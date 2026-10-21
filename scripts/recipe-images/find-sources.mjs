#!/usr/bin/env node
// Letar källa (och därmed bild) för recept UTAN dishingouthealth-källa genom att
// fuzzy-matcha titeln mot svenska receptsajters sitemaps och sedan VERIFIERA
// kandidaten mot receptets ingredienser (JSON-LD recipeIngredient). Bara träffar
// där både titel och ingredienser stämmer räknas som säkra.
//
//   node scripts/recipe-images/find-sources.mjs --from=<recept.json> [--sitemaps=<dir>] [--only=<id,id>]
//
// Sitemaps (lokala xml-filer, hämtade med curl): coop-sitemap.xml, koket-sitemap.xml,
// put-sitemap.xml (Portionen under tian). Skriver scripts/recipe-images/sources-report.json
// med per recept: kandidater, titelpoäng, ingrediensöverlapp, verdict (saker|osaker|ingen).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const args = new Map(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? 'true'] : [a, 'true']; }));
const FROM = args.get('from');
const SM_DIR = args.get('sitemaps') || __dirname;
const ONLY = args.has('only') ? new Set(args.get('only').split(',').map(Number)) : null;
if (!FROM) { console.error('Ange --from=<recept.json>'); process.exit(2); }

const raw = JSON.parse(readFileSync(path.resolve(ROOT, FROM), 'utf8'));
const all = (Array.isArray(raw) ? raw : raw.recipes || []).map((r) => ({ id: Number(r.id), title: r.title, notes: r.notes || '', ingredients: r.ingredients || [] }));
const manifest = readFileSync(path.join(ROOT, 'js', 'recipe-images.js'), 'utf8');
const haveImg = new Set([...manifest.matchAll(/^\s+(\d+),/gm)].map((m) => Number(m[1])));
const targets = all.filter((r) => !haveImg.has(r.id) && !/dishingouthealth/i.test(r.notes) && (!ONLY || ONLY.has(r.id)));
console.log(`${targets.length} recept utan bild och utan dishingouthealth-källa.`);

const STOP = new Set(['med', 'och', 'i', 'pa', 'på', 'till', 'av', 'en', 'ett', 'recept', 'det', 'den', 'som', 'för', 'for', 'min', 'bästa', 'basta', 'enkel', 'enkla', 'snabb', 'snabba', 'god', 'goda', 'krämig', 'kramig', 'amandas', 'a', 'la']);
function norm(s) {
  return s.toLowerCase().replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e').replace(/[^a-z0-9]+/g, ' ').trim();
}
function tokens(s) {
  return new Set(norm(s).split(' ').filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w)));
}
// Jaccard på ordstammar (de 5 första tecknen) — "laxbiffar"/"laxbiff" ska mötas.
const stem = (w) => w.slice(0, 5);
function jac(a, b) {
  const A = new Set([...a].map(stem)), B = new Set([...b].map(stem));
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i || 1);
}

// ── Sitemaps → [{site, url, slug}] ───────────────────────────────────────────
const SITES = [
  ['coop', 'coop-sitemap.xml'],
  ['koket', 'koket-sitemap.xml'],
  ['put', 'put-sitemap.xml'],
];
const pages = [];
for (const [site, file] of SITES) {
  const p = path.join(SM_DIR, file);
  if (!existsSync(p)) { console.log(`(ingen ${file})`); continue; }
  const xml = readFileSync(p, 'utf8');
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = m[1].trim();
    const slug = url.replace(/\/$/, '').split('/').pop().toLowerCase();
    if (slug) pages.push({ site, url, slug, toks: tokens(slug) });
  }
}
console.log(`${pages.length} sidor i sitemaps.`);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}
function ldRecipe(html) {
  for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const found = find(JSON.parse(block[1].trim()));
      if (found) return found;
    } catch { /* nästa */ }
  }
  return null;
  function find(node) {
    if (!node) return null;
    if (Array.isArray(node)) { for (const n of node) { const r = find(n); if (r) return r; } return null; }
    if (typeof node !== 'object') return null;
    const t = [].concat(node['@type'] || []);
    if (t.some((x) => String(x).toLowerCase() === 'recipe')) return node;
    return node['@graph'] ? find(node['@graph']) : null;
  }
}
function ogImage(html) {
  const m = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html);
  return m ? m[1] : null;
}
// Ingrediensöverlapp: andel av VÅRA ingrediensers huvudord som återfinns i källans ingredienslista.
function ingredientOverlap(ours, theirs) {
  const theirText = norm(theirs.join(' '));
  const theirToks = new Set(theirText.split(' ').filter((w) => w.length >= 4).map(stem));
  const heads = ours.map((l) => [...tokens(l.replace(/\(.*?\)/g, ''))].filter((w) => w.length >= 4)).filter((a) => a.length);
  if (!heads.length) return 0;
  let hit = 0;
  for (const words of heads) if (words.some((w) => theirToks.has(stem(w)))) hit++;
  return hit / heads.length;
}

const report = [];
for (const r of targets) {
  const T = tokens(r.title);
  const cands = pages.map((p) => ({ ...p, score: jac(T, p.toks) })).filter((p) => p.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 4);
  const entry = { id: r.id, title: r.title, candidates: [], verdict: 'ingen' };
  for (const c of cands) {
    const cand = { site: c.site, url: c.url, titleScore: Number(c.score.toFixed(2)), ingredientOverlap: null, name: null, image: null };
    try {
      const html = await get(c.url);
      const ld = ldRecipe(html);
      cand.name = ld?.name || null;
      cand.image = (typeof ld?.image === 'string' ? ld.image : Array.isArray(ld?.image) ? (typeof ld.image[0] === 'string' ? ld.image[0] : ld.image[0]?.url) : ld?.image?.url) || ogImage(html);
      if (ld?.recipeIngredient) cand.ingredientOverlap = Number(ingredientOverlap(r.ingredients, ld.recipeIngredient.map(String)).toFixed(2));
      await sleep(250);
    } catch (e) { cand.error = String(e.message || e); }
    entry.candidates.push(cand);
  }
  const best = entry.candidates.filter((c) => c.image).sort((a, b) => (b.ingredientOverlap ?? 0) - (a.ingredientOverlap ?? 0) || b.titleScore - a.titleScore)[0];
  if (best && best.ingredientOverlap != null && best.ingredientOverlap >= 0.7 && best.titleScore >= 0.6) entry.verdict = 'saker';
  else if (best && (best.ingredientOverlap ?? 0) >= 0.5) entry.verdict = 'osaker';
  entry.best = best || null;
  report.push(entry);
  console.log(`${String(r.id).padStart(3)} ${r.title.slice(0, 48).padEnd(48)} ${entry.verdict.padEnd(6)} ${best ? `${best.site} ${best.titleScore}/${best.ingredientOverlap ?? '-'} ${best.url}` : ''}`);
}
writeFileSync(path.join(__dirname, 'sources-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`säkra: ${report.filter((e) => e.verdict === 'saker').length} · osäkra: ${report.filter((e) => e.verdict === 'osaker').length} · ingen: ${report.filter((e) => e.verdict === 'ingen').length}`);
