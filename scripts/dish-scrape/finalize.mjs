#!/usr/bin/env node
// Bygger staging + quality-report från progress.json utan att kalla Sonnet.
// Användning: node finalize.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const PROGRESS_PATH = path.join(__dirname, 'progress.json');
const STAGING_PATH = path.join(REPO_ROOT, 'recipes-import-pending.json');
const REPORT_PATH = path.join(REPO_ROOT, 'recipes-import-quality-report.md');

if (!fs.existsSync(PROGRESS_PATH)) {
  console.error('progress.json saknas — kör scrape.mjs först.');
  process.exit(1);
}

const progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8'));
const imported = [];
const skipped = [];
const errors = [];
for (const [url, v] of Object.entries(progress.results)) {
  if (v.status === 'imported' && v.recipe) imported.push(v.recipe);
  else if (v.status === 'skipped') skipped.push({ url, reason: v.reason });
  else if (v.status === 'error') errors.push({ url, error: v.error });
}

console.log(`Imported: ${imported.length}`);
console.log(`Skipped:  ${skipped.length}`);
console.log(`Errors:   ${errors.length}`);

const stagingObj = {
  meta: {
    generated: new Date().toISOString(),
    source: 'dishingouthealth.com',
    total: imported.length,
    firstId: imported[0]?.id ?? null,
    lastId: imported[imported.length - 1]?.id ?? null,
    note: 'Partiell körning — Anthropic-krediter tog slut vid #339. Resterande URLer obearbetade eller fel.',
    counts: { imported: imported.length, skipped: skipped.length, errors: errors.length },
  },
  recipes: imported,
};
fs.writeFileSync(STAGING_PATH, JSON.stringify(stagingObj, null, 2) + '\n', 'utf-8');
console.log(`✓ Skrev ${STAGING_PATH}`);

// Quality report
const lines = [];
lines.push(`# Dishingouthealth-import — kvalitetsrapport`);
lines.push('');
lines.push(`Genererad: ${new Date().toISOString()} (avslut efter out-of-credits vid 360/551)`);
lines.push('');
lines.push(`## Sammanfattning`);
lines.push('');
lines.push(`| | Antal |`);
lines.push(`|---|---|`);
lines.push(`| URLer i sitemap | 710 |`);
lines.push(`| Slug-skippade (kategorifilter) | 159 |`);
lines.push(`| Kandidat-URLer | 551 |`);
lines.push(`| Bearbetade innan stopp | 360 |`);
lines.push(`| **Importerade till staging** | **${imported.length}** |`);
lines.push(`| Sonnet-skippade (för långa, dessert, low-rating, etc.) | ${skipped.length} |`);
lines.push(`| Fel (out-of-credits) | ${errors.length} |`);
lines.push(`| Obearbetade (avbrutet) | ${551 - 360} |`);
lines.push('');

// 10 stickprov slumpmässigt
if (imported.length > 0) {
  const sampleSize = Math.min(10, imported.length);
  const indices = new Set();
  while (indices.size < sampleSize) indices.add(Math.floor(Math.random() * imported.length));
  lines.push(`## ${sampleSize} stickprov (slumpmässigt — granska för översättningskvalitet)`);
  lines.push('');
  let n = 1;
  for (const idx of [...indices].sort((a, b) => a - b)) {
    const r = imported[idx];
    const ratingStr = r._meta?.rating != null ? `★ ${r._meta.rating} (${r._meta.ratingCount || 0} röster)` : 'utan betyg';
    lines.push(`### ${n++}. ${r.title} (id ${r.id})`);
    lines.push('');
    lines.push(`- **Tid:** ${r.time} min · **Protein:** ${r.protein} · **Tags:** ${r.tags.join(', ')} · **Betyg:** ${ratingStr}`);
    lines.push(`- **Portioner:** ${r.servings}`);
    lines.push('');
    lines.push('**Ingredienser:**');
    for (const ing of r.ingredients) lines.push(`- ${ing}`);
    lines.push('');
    lines.push('**Instruktioner:**');
    r.instructions.forEach((ins, i) => lines.push(`${i + 1}. ${ins}`));
    lines.push('');
    lines.push(`*Källa: ${r._meta?.originalTitle} — ${r._meta?.sourceUrl}*`);
    lines.push('');
  }
}

// Varningsflaggor
const longIngredients = imported.filter(r => r.ingredients.length > 15);
const shortInstructions = imported.filter(r => r.instructions.length < 3);
const weirdAmounts = imported.filter(r => r.ingredients.some(i => /\b(0 g|NaN|undefined|null)\b/i.test(i)));
const englishLeak = imported.filter(r => /\b(thinly|finely|chopped|sliced|diced|minced|drained|optional|to taste|divided|softened|crumbled|melted|whisked|cubed|halved|quartered|shredded)\b/i.test(JSON.stringify(r.ingredients) + r.title));

lines.push(`## Varningsflaggor`);
lines.push('');
lines.push(`### Recept med >15 ingredienser (kanske dålig parse) — ${longIngredients.length}`);
for (const r of longIngredients.slice(0, 25)) lines.push(`- #${r.id} ${r.title} (${r.ingredients.length} ing)`);
lines.push('');
lines.push(`### Recept med <3 instruktion-steg — ${shortInstructions.length}`);
for (const r of shortInstructions.slice(0, 25)) lines.push(`- #${r.id} ${r.title} (${r.instructions.length} steg)`);
lines.push('');
lines.push(`### Konstiga mängder (0 g, NaN, undefined) — ${weirdAmounts.length}`);
for (const r of weirdAmounts.slice(0, 25)) lines.push(`- #${r.id} ${r.title}`);
lines.push('');
lines.push(`### Möjliga engelska kvarlevor — ${englishLeak.length}`);
for (const r of englishLeak.slice(0, 25)) lines.push(`- #${r.id} ${r.title}`);
lines.push('');

// Distribution
const proteinDist = {};
const tagDist = {};
const timeDist = { 'vardag30 (≤30)': 0, 'helg60 (31-60)': 0, 'över 60 / okänt': 0 };
const ratingBuckets = { '5.0': 0, '4.8-5.0': 0, '4.5-4.8': 0, 'utan betyg': 0 };
for (const r of imported) {
  proteinDist[r.protein] = (proteinDist[r.protein] || 0) + 1;
  for (const t of r.tags) tagDist[t] = (tagDist[t] || 0) + 1;
  if (r.time && r.time <= 30) timeDist['vardag30 (≤30)']++;
  else if (r.time && r.time <= 60) timeDist['helg60 (31-60)']++;
  else timeDist['över 60 / okänt']++;
  const rating = r._meta?.rating;
  if (rating == null) ratingBuckets['utan betyg']++;
  else if (rating >= 5.0) ratingBuckets['5.0']++;
  else if (rating >= 4.8) ratingBuckets['4.8-5.0']++;
  else ratingBuckets['4.5-4.8']++;
}
lines.push(`## Kategori-distribution`);
lines.push('');
lines.push(`### Protein`);
for (const [k, v] of Object.entries(proteinDist).sort((a, b) => b[1] - a[1])) lines.push(`- ${k}: ${v}`);
lines.push('');
lines.push(`### Tags`);
for (const [k, v] of Object.entries(tagDist).sort((a, b) => b[1] - a[1])) lines.push(`- ${k}: ${v}`);
lines.push('');
lines.push(`### Tid`);
for (const [k, v] of Object.entries(timeDist)) lines.push(`- ${k}: ${v}`);
lines.push('');
lines.push(`### Betygsfördelning`);
for (const [k, v] of Object.entries(ratingBuckets)) lines.push(`- ${k}: ${v}`);
lines.push('');

// Skip-anledningar
if (skipped.length) {
  const skipReasons = {};
  for (const s of skipped) {
    const key = s.reason.replace(/[\d.]+/g, '#').slice(0, 60);
    skipReasons[key] = (skipReasons[key] || 0) + 1;
  }
  lines.push(`## Sonnet-skippade — anledningar`);
  lines.push('');
  for (const [reason, n] of Object.entries(skipReasons).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${n} × ${reason}`);
  }
  lines.push('');
}

// Errors
if (errors.length) {
  lines.push(`## Fel — ${errors.length} st (alla ”credit balance too low”)`);
  lines.push('');
  lines.push(`Dessa URLer kan retry:as i en framtida session efter att Anthropic-krediter laddats på. Resume-flaggan plockar upp cache:n och försöker igen på errors.`);
  lines.push('');
}

// Promotion
lines.push(`## Granska och promota`);
lines.push('');
lines.push(`### 1. Granska kvaliteten`);
lines.push('');
lines.push(`- Läs igenom de 10 stickprovsrecepten ovan. Är översättningarna idiomatiska?`);
lines.push(`- Skanna varningsflaggorna — finns det ord som ser konstiga ut?`);
lines.push(`- Öppna ev. \`recipes-import-pending.json\` och spotta-läs ett par till.`);
lines.push('');
lines.push(`### 2a. Promotera (om kvaliteten ser bra ut)`);
lines.push('');
lines.push('```bash');
lines.push('cd scripts/dish-scrape && node promote.mjs');
lines.push('git add recipes.json && git commit -m "Importera ' + imported.length + ' recept från dishingouthealth.com" && git push');
lines.push('```');
lines.push('');
lines.push(`### 2b. Avstå (om kvaliteten ser dålig ut)`);
lines.push('');
lines.push('```bash');
lines.push('rm recipes-import-pending.json recipes-import-quality-report.md');
lines.push('git add -A && git commit -m "Avstå från dishingouthealth-import" && git push');
lines.push('```');
lines.push('');
lines.push(`### 3. (Valfritt) Återuppta körningen för de 191 obearbetade`);
lines.push('');
lines.push(`Om du laddar på Anthropic-krediter ($5–$10 räcker) kan du köra:`);
lines.push('');
lines.push('```bash');
lines.push('cd scripts/dish-scrape && node scrape.mjs --resume');
lines.push('```');
lines.push('');
lines.push(`Resume:n läser cache:n och bearbetar bara obearbetade URLer + retry på de ${errors.length} felen.`);
lines.push('');

fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf-8');
console.log(`✓ Skrev ${REPORT_PATH}`);
