#!/usr/bin/env node
// Hämtar receptbilder från källan (dishingouthealth.com) och lagrar dem som
// nedskalade, kvadratiskt beskurna webp-kopior i repot — inte hotlänkade.
//
//   node scripts/recipe-images/fetch-images.mjs --from=<recept.json> [--dry-run] [--limit=N] [--force] [--only=id,id]
//
// <recept.json> = en array av recept i appens format (id, title, notes …), t.ex.
//   - scripts/.cache/recipes.json (från scripts/export-recipes.mjs — har {recipes:[…]})
//   - en dump av window.RECIPES ur den inloggade appen
//   - docs/recipe-backup-20260607.json ({recipes:[…]})
//
// Steg per recept med "Källa: <originaltitel>, dishingouthealth.com" i notes:
//   1. originaltiteln → slug, matchas mot sajtens post-sitemap (exakt träff,
//      annars normaliserad jämförelse utan skiljetecken/stoppord som "recipe")
//   2. receptsidan → og:image (reserv: Recipe.image i JSON-LD)
//   3. bilden → sharp: 640×640 cover-beskuren webp (kvalitet 80) → images/recipes/r<id>.webp
//
// Skriver dessutom:
//   - js/recipe-images.js        manifest över id:n som har bild (appen läser det)
//   - db/migrations/014_recipe_source_url.sql  återfyllnadsblocket (UPDATE per recept)
//   - scripts/recipe-images/report.json        vad som matchade/missade (för granskning)
//
// Beroende: sharp (devDependency). Kör `npm install` först.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const IMG_DIR = path.join(ROOT, 'images', 'recipes');
const MANIFEST = path.join(ROOT, 'js', 'recipe-images.js');
const MIGRATION = path.join(ROOT, 'db', 'migrations', '014_recipe_source_url.sql');
const REPORT = path.join(__dirname, 'report.json');
const SITE = 'https://dishingouthealth.com';
const SIZE = 640;

// ── Argument ─────────────────────────────────────────────────────────────────
const args = new Map(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
}));
const FROM = args.get('from');
const DRY = args.get('dry-run') === 'true';
const FORCE = args.get('force') === 'true';
const LIMIT = args.has('limit') ? Number(args.get('limit')) : Infinity;
const ONLY = args.has('only') ? new Set(args.get('only').split(',').map(Number)) : null;   // --only=2,3,4 → bara dessa id:n
if (!FROM) {
  console.error('Ange --from=<recept.json>. Se kommentaren överst i skriptet.');
  process.exit(2);
}

// ── Indata ───────────────────────────────────────────────────────────────────
function loadRecipes(file) {
  const raw = JSON.parse(readFileSync(path.resolve(ROOT, file), 'utf8'));
  const arr = Array.isArray(raw) ? raw : (raw.recipes || raw.rows || []);
  return arr.map((r) => ({ id: Number(r.id), title: String(r.title || ''), notes: r.notes || '', sourceUrl: r.sourceUrl || r.source_url || null }));
}

// Manuellt verifierade källor (sources.json): id+titel → url (+ ev. direkt bild-URL).
const MANUAL_PATH = path.join(__dirname, 'sources.json');
const MANUAL = existsSync(MANUAL_PATH) ? JSON.parse(readFileSync(MANUAL_PATH, 'utf8')).sources : [];
function manualFor(r) {
  return MANUAL.find((m) => m.id === r.id && m.title.toLowerCase() === String(r.title).toLowerCase()) || null;
}

const SOURCE_RE = /Källa:\s*(.+?),\s*dishingouthealth\.com/i;
function sourceTitle(notes) {
  const m = SOURCE_RE.exec(notes || '');
  return m ? m[1].trim() : null;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpGet(url, { binary = false, retries = 2 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: binary ? 'image/*' : 'text/html,application/xml;q=0.9,*/*;q=0.8' }, redirect: 'follow' });
      if (!res.ok) {
        if (attempt < retries && (res.status >= 500 || res.status === 429)) { await sleep(1500 * (attempt + 1)); continue; }
        throw new Error(`HTTP ${res.status}`);
      }
      return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (e) {
      if (attempt < retries) { await sleep(1500 * (attempt + 1)); continue; }
      throw e;
    }
  }
}

// ── Sitemap → slugkarta ──────────────────────────────────────────────────────
function locs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

async function loadSlugMap() {
  const index = await httpGet(`${SITE}/sitemap_index.xml`);
  let maps = locs(index).filter((u) => /post-sitemap/.test(u));
  if (!maps.length) maps = locs(index).filter((u) => /sitemap.*\.xml/.test(u));
  const slugs = new Map();   // slug → url
  for (const sm of maps) {
    for (const u of locs(await httpGet(sm))) {
      const slug = u.replace(/\/$/, '').split('/').pop().toLowerCase();
      if (slug && !/^(category|tag|author|page)$/.test(slug)) slugs.set(slug, u);
    }
    await sleep(300);
  }
  return slugs;
}

// Samma regler som WordPress-slugs: gemener, diakritik bort, allt icke-alfanumeriskt → bindestreck.
function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/['’]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const STOP = new Set(['recipe', 'recipes', 'the', 'a', 'an', 'with', 'and', 'in', 'easy', 'healthy', 'best', 'minute', 'min', 'vegan', 'vegetarian', 'ultimate', 'nourishing']);
function loose(slug) {
  return slug.split('-').filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w)).join('');
}

function matchSlug(title, slugs) {
  const exact = slugify(title);
  if (slugs.has(exact)) return { url: slugs.get(exact), how: 'exact' };
  const want = loose(exact);
  if (!want) return null;
  const hits = [...slugs.keys()].filter((s) => loose(s) === want);
  if (hits.length === 1) return { url: slugs.get(hits[0]), how: 'loose' };
  // Sista utväg: titeln är ett prefix/suffix av sluggen (t.ex. "…-skillet" saknas i titeln)
  const near = [...slugs.keys()].filter((s) => loose(s).startsWith(want) || want.startsWith(loose(s)));
  if (near.length === 1) return { url: slugs.get(near[0]), how: 'near' };
  // Ordmängder: sluggen är en delmängd av titeln ("broccoli-pasta" ⊂ "Lemon Butter
  // Broccoli Pasta") eller tvärtom, och Jaccard ≥ 0,4 med tydligt avstånd till tvåan.
  // Märks 'fuzzy' i rapporten så träffarna kan granskas.
  const T = tokens(exact);
  const scored = [...slugs.keys()].map((s) => {
    const S = tokens(s);
    let both = 0; for (const w of S) if (T.has(w)) both++;
    const contained = S.size > 0 && (both === S.size || both === T.size);
    return { s, j: both / (S.size + T.size - both || 1), contained };
  }).filter((x) => x.contained && x.j >= 0.4).sort((a, b) => b.j - a.j);
  if (scored.length && (scored.length === 1 || scored[0].j - scored[1].j >= 0.1)) return { url: slugs.get(scored[0].s), how: 'fuzzy' };
  return null;
}
function tokens(slug) {
  return new Set(slug.split('-').filter((w) => w && !STOP.has(w) && !/^d+$/.test(w)));
}

// ── Bild-URL ur receptsidan ─────────────────────────────────────────────────
function imageUrlFromHtml(html) {
  const og = /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)
          || /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i.exec(html);
  if (og) return og[1];
  for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const node = findRecipe(JSON.parse(block[1].trim()));
      const img = node?.image;
      if (!img) continue;
      if (typeof img === 'string') return img;
      if (Array.isArray(img)) return typeof img[0] === 'string' ? img[0] : img[0]?.url;
      if (img.url) return img.url;
    } catch { /* nästa block */ }
  }
  return null;
}
function findRecipe(node) {
  if (!node) return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findRecipe(n); if (r) return r; } return null; }
  if (typeof node !== 'object') return null;
  const t = [].concat(node['@type'] || []);
  if (t.some((x) => String(x).toLowerCase() === 'recipe')) return node;
  return node['@graph'] ? findRecipe(node['@graph']) : null;
}

// ── Utdata ───────────────────────────────────────────────────────────────────
function existingIds() {
  if (!existsSync(IMG_DIR)) return new Set();
  return new Set(readdirSync(IMG_DIR).map((f) => /^r(\d+)\.webp$/.exec(f)?.[1]).filter(Boolean).map(Number));
}

function writeManifest(ids) {
  const sorted = [...ids].sort((a, b) => a - b);
  const body = `// GENERERAD av scripts/recipe-images/fetch-images.mjs — redigera inte för hand.
// Recept-id:n som har en bild i images/recipes/r<id>.webp (640×640 webp, kopia
// från källan). Appen läser mängden i js/utils.js (recipeImage) så listan aldrig
// ritar trasiga bilder för recept som saknar en.
export const RECIPE_IMAGE_IDS = new Set([
${sorted.map((id) => `  ${id},`).join('\n')}
]);
`;
  writeFileSync(MANIFEST, body);
}

const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
function writeBackfill(rows) {
  if (!existsSync(MIGRATION)) return;
  const src = readFileSync(MIGRATION, 'utf8');
  const start = src.indexOf('-- >>> BACKFILL:START');
  const end = src.indexOf('-- <<< BACKFILL:END');
  if (start < 0 || end < 0) return;
  const head = src.slice(0, src.indexOf('\n', start) + 1);
  const lines = rows.map((r) =>
    `UPDATE public.recipes SET source_url = ${sqlStr(r.url)} WHERE id = ${r.id} AND title = ${sqlStr(r.title)} AND source_url IS DISTINCT FROM ${sqlStr(r.url)};`);
  writeFileSync(MIGRATION, head + lines.join('\n') + '\n' + src.slice(end));
}

// ── Huvudflöde ───────────────────────────────────────────────────────────────
const recipes = loadRecipes(FROM);
const candidates = recipes.map((r) => ({ ...r, srcTitle: sourceTitle(r.notes), manual: manualFor(r) })).filter((r) => r.srcTitle || r.sourceUrl || r.manual);
console.log(`${recipes.length} recept i ${FROM}, ${candidates.length} med källa (dishingouthealth eller sources.json).`);

const slugs = await loadSlugMap();
console.log(`${slugs.size} sidor i sajtens sitemap.`);

const have = existingIds();
const report = { matched: [], unmatched: [], failed: [], skipped: [] };
const backfill = [];
let done = 0;
let sharp = null;
if (!DRY) { ({ default: sharp } = await import('sharp')); mkdirSync(IMG_DIR, { recursive: true }); }

for (const r of candidates) {
  if (ONLY && !ONLY.has(r.id)) continue;
  const hit = r.manual ? { url: r.manual.url, how: 'manual', image: r.manual.image || null }
    : r.sourceUrl ? { url: r.sourceUrl, how: 'column' }
    : (r.srcTitle ? matchSlug(r.srcTitle, slugs) : null);
  if (!hit) { report.unmatched.push({ id: r.id, title: r.title, srcTitle: r.srcTitle, slug: slugify(r.srcTitle) }); continue; }
  backfill.push({ id: r.id, title: r.title, url: hit.url });
  report.matched.push({ id: r.id, title: r.title, srcTitle: r.srcTitle, url: hit.url, how: hit.how });
  if (have.has(r.id) && !FORCE) { report.skipped.push(r.id); continue; }
  if (DRY || done >= LIMIT) continue;
  try {
    const imgUrl = hit.image || imageUrlFromHtml(await httpGet(hit.url));
    if (!imgUrl) throw new Error('ingen og:image/JSON-LD-bild');
    const buf = await httpGet(imgUrl, { binary: true });
    await sharp(buf).rotate().resize(SIZE, SIZE, { fit: 'cover', position: 'attention' }).webp({ quality: 80 }).toFile(path.join(IMG_DIR, `r${r.id}.webp`));
    have.add(r.id);
    done++;
    process.stdout.write(`  ✓ r${r.id}.webp  ${r.title}\n`);
    await sleep(400);
  } catch (e) {
    report.failed.push({ id: r.id, title: r.title, url: hit.url, error: String(e.message || e) });
    process.stdout.write(`  ✗ ${r.id} ${r.title}: ${e.message}\n`);
  }
}

if (!DRY) {
  writeManifest(have);
  writeBackfill(backfill);
}
writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
console.log(`Matchade ${report.matched.length} (${report.matched.filter((m) => m.how === 'exact').length} exakt) · omatchade ${report.unmatched.length} · hämtade ${done} · misslyckade ${report.failed.length} · redan fanns ${report.skipped.length}`);
if (report.unmatched.length) console.log('Omatchade:', report.unmatched.map((u) => `${u.id} "${u.srcTitle}"`).join(' | '));
console.log(DRY ? '(torrkörning — inget skrivet)' : `Manifest: ${path.relative(ROOT, MANIFEST)} · återfyllnad i ${path.relative(ROOT, MIGRATION)} · rapport ${path.relative(ROOT, REPORT)}`);
