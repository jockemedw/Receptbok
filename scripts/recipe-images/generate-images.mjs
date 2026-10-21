#!/usr/bin/env node
// Genererar AI-bilder (serveringsförslag) för recept som saknar både bild och
// webbkälla — med Googles Gemini-bildmodell (samma nyckel som receptimporten).
// Bilderna märks i appen som "AI-genererad bild · serveringsförslag" via
// scripts/recipe-images/ai-generated.json, som fetch-images.mjs läser när
// manifestet js/recipe-images.js skrivs.
//
//   node scripts/recipe-images/generate-images.mjs --from=<recept.json> --only=55,42 [--model=gemini-2.5-flash-image] [--force] [--dry-run]
//   node scripts/recipe-images/generate-images.mjs --from=scripts/.cache/recipes-live.json --all-missing
//
// Nyckel: GOOGLE_API_KEY i miljön, annars .env.vercel.local / .env.local i repo-roten
// (vercel env pull). Nyckeln loggas aldrig.
//
// Utdata: images/recipes/r<id>.webp (640×640, kvalitet 80), ai-generated.json
// (id, titel, modell, datum, prompt) och manifestet via fetch-images skrivfunktion.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const IMG_DIR = path.join(ROOT, 'images', 'recipes');
const AI_JSON = path.join(__dirname, 'ai-generated.json');
const MANIFEST = path.join(ROOT, 'js', 'recipe-images.js');

const args = new Map(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? 'true'] : [a, 'true']; }));
const FROM = args.get('from');
const MODEL = args.get('model') || 'gemini-2.5-flash-image';
const ONLY = args.has('only') ? new Set(args.get('only').split(',').map(Number)) : null;
const ALL_MISSING = args.get('all-missing') === 'true';
const FORCE = args.get('force') === 'true';
const DRY = args.get('dry-run') === 'true';
const OUT_DIR = args.get('out') ? path.resolve(ROOT, args.get('out')) : IMG_DIR;   // --out=<dir> för provbilder utanför repot
if (!FROM || (!ONLY && !ALL_MISSING)) { console.error('Ange --from=<recept.json> och --only=id,… eller --all-missing'); process.exit(2); }

// ── Nyckel ───────────────────────────────────────────────────────────────────
function loadKey() {
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  for (const f of ['.env.vercel.local', '.env.local']) {
    const p = path.join(ROOT, f);
    if (!existsSync(p)) continue;
    const m = /^GOOGLE_API_KEY="?([^"\r\n]+)"?/m.exec(readFileSync(p, 'utf8'));
    if (m) return m[1].trim();
  }
  return null;
}
const KEY = loadKey();
if (!KEY && !DRY) { console.error('Ingen GOOGLE_API_KEY (miljön, .env.vercel.local eller .env.local).'); process.exit(2); }

// ── Recept ───────────────────────────────────────────────────────────────────
const raw = JSON.parse(readFileSync(path.resolve(ROOT, FROM), 'utf8'));
const recipes = (Array.isArray(raw) ? raw : raw.recipes || []).map((r) => ({ id: Number(r.id), title: r.title, protein: r.protein, tags: r.tags || [], ingredients: r.ingredients || [], notes: r.notes || '' }));
const haveImg = new Set(existsSync(IMG_DIR) ? readdirSync(IMG_DIR).map((f) => /^r(\d+)\.webp$/.exec(f)?.[1]).filter(Boolean).map(Number) : []);
const targets = recipes.filter((r) => ONLY ? ONLY.has(r.id) : (!haveImg.has(r.id) && !/dishingouthealth/i.test(r.notes)));

// ── Prompt ───────────────────────────────────────────────────────────────────
// Ingrediensnamnen (utan mängder) ger modellen rätt råvaror; stilen är låst så
// bilderna hänger ihop med de riktiga fotona (uppifrån, dagsljus, ljus duk).
function ingredientNames(list) {
  return list
    .map((l) => String(l).replace(/^[^:]{1,20}:\s*/, '').replace(/\(.*?\)/g, '').replace(/^[\d½¼¾,.\-–\s]+(kg|hg|g|l|dl|cl|ml|msk|tsk|krm|st|burk(ar)?|påse|pkt|förp\.?|klyft(a|or)|kruk(a|or)|skiv(a|or)|bit(ar)?)?\b\.?\s*/i, '').trim())
    .filter((s) => s && !/^(salt|peppar|svartpeppar|salt och (svart)?peppar|vatten|olja|rapsolja|olivolja|smör|smör eller olja)/i.test(s))
    .slice(0, 12);
}
function promptFor(r) {
  const ings = ingredientNames(r.ingredients).join(', ');
  return `Fotorealistiskt matfoto av en svensk hemlagad middag: "${r.title}". ` +
    `Rätten innehåller: ${ings}. ` +
    'Serverad på en enkel keramiktallrik, fotograferad rakt uppifrån i mjukt naturligt dagsljus på en ljus linneduk eller ett ljust träbord, ' +
    'vardagligt och aptitligt, inga händer, inga personer, ingen text, inga logotyper, inget bestick som skymmer maten. Kvadratiskt format.';
}

// ── Gemini ───────────────────────────────────────────────────────────────────
async function generate(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw new Error('inget bildsvar: ' + JSON.stringify(data).slice(0, 300));
  return { buf: Buffer.from(part.inlineData.data, 'base64'), mime: part.inlineData.mimeType };
}

// ── Manifest + provenienslogg ────────────────────────────────────────────────
function loadAi() { return existsSync(AI_JSON) ? JSON.parse(readFileSync(AI_JSON, 'utf8')) : { _: 'AI-genererade receptbilder (serveringsförslag) — id, modell, datum, prompt. Läses av fetch-images.mjs när manifestet skrivs (RECIPE_IMAGE_AI_IDS → bildtexten i appen).', images: [] }; }
export function writeManifest(ids, aiIds) {
  const sorted = [...ids].sort((a, b) => a - b);
  const ai = [...aiIds].filter((id) => ids.has(id)).sort((a, b) => a - b);
  writeFileSync(MANIFEST, `// GENERERAD av scripts/recipe-images/fetch-images.mjs / generate-images.mjs — redigera inte för hand.
// Recept-id:n som har en bild i images/recipes/r<id>.webp (640×640 webp). Appen
// läser mängderna i js/utils.js (recipeImage) så listan aldrig ritar trasiga bilder.
export const RECIPE_IMAGE_IDS = new Set([
${sorted.map((id) => `  ${id},`).join('\n')}
]);
// Delmängd som är AI-genererade serveringsförslag (scripts/recipe-images/ai-generated.json)
// — visas med bildtexten "AI-genererad bild · serveringsförslag".
export const RECIPE_IMAGE_AI_IDS = new Set([
${ai.map((id) => `  ${id},`).join('\n')}
]);
`);
}

// ── Kör ──────────────────────────────────────────────────────────────────────
console.log(`${targets.length} recept att generera (${MODEL})${DRY ? ' — torrkörning' : ''}${OUT_DIR !== IMG_DIR ? ' → ' + OUT_DIR : ''}`);
const ai = loadAi();
let done = 0, failed = 0;
let sharp = null;
if (!DRY) { ({ default: sharp } = await import('sharp')); mkdirSync(OUT_DIR, { recursive: true }); }
for (const r of targets) {
  const prompt = promptFor(r);
  if (DRY) { console.log(`  ${r.id} ${r.title}\n     ${prompt}`); continue; }
  if (haveImg.has(r.id) && !FORCE && OUT_DIR === IMG_DIR) { console.log(`  = ${r.id} finns redan`); continue; }
  try {
    const { buf } = await generate(prompt);
    const out = path.join(OUT_DIR, `r${r.id}.webp`);
    await sharp(buf).resize(640, 640, { fit: 'cover', position: 'attention' }).webp({ quality: 80 }).toFile(out);
    if (OUT_DIR === IMG_DIR) {
      ai.images = ai.images.filter((x) => x.id !== r.id);
      ai.images.push({ id: r.id, title: r.title, model: MODEL, date: new Date().toISOString().slice(0, 10), prompt });
      haveImg.add(r.id);
    }
    done++;
    console.log(`  ✓ r${r.id}.webp  ${r.title}`);
    await new Promise((res) => setTimeout(res, 1500));
  } catch (e) {
    failed++;
    console.log(`  ✗ ${r.id} ${r.title}: ${String(e.message || e).slice(0, 200)}`);
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(String(e.message))) { console.log('Kvoten slut — avbryter.'); break; }
  }
}
if (!DRY && OUT_DIR === IMG_DIR) {
  writeFileSync(AI_JSON, JSON.stringify(ai, null, 2) + '\n');
  writeManifest(haveImg, new Set(ai.images.map((x) => x.id)));
}
console.log(`klart: ${done} genererade · ${failed} misslyckade`);
