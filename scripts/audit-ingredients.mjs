#!/usr/bin/env node
// ─── INGREDIENS-AUDIT (Fas 0) ──────────────────────────────────────────────
// Kvalitetskontroll av alla receptingredienser. Klassar varje ingrediensrad i
// 6 problemklasser och graderar severity (P0/P1/P2), så vi kan mäta framsteg
// före/efter datastädning (Fas 3).
//
// Datakälla (i prioritetsordning):
//   1. Live Supabase via REST om SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY finns
//      (eller SUPABASE_ANON_KEY — read-only räcker).
//   2. --source <fil.json>  (export med formen { "recipes": [...] })
//
// Kör:  node scripts/audit-ingredients.mjs [--source /tmp/recipes-supabase.json]
// Skriver: docs/ingredient-audit-<datum>.md + docs/ingredient-audit-latest.json

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseIngredient, normalizeName, CANON_SET } from "../api/_shared/shopping-builder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── Datainläsning ─────────────────────────────────────────────────────────
async function loadRecipes() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (url && key) {
    const res = await fetch(`${url}/rest/v1/recipes?select=id,title,ingredients&order=id`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`Supabase REST ${res.status}: ${await res.text()}`);
    return { source: `Supabase (${url})`, recipes: await res.json() };
  }
  const argIdx = process.argv.indexOf("--source");
  const path = argIdx !== -1 ? process.argv[argIdx + 1] : "/tmp/recipes-supabase.json";
  const data = JSON.parse(readFileSync(path, "utf-8"));
  return { source: `fil: ${path}`, recipes: data.recipes };
}

// ─── Heuristik: vilka mängdlösa rader är ACCEPTABLA (inte en defekt)? ────────
// Skafferi-stapelvaror, garnering, "till stekning/servering" och valfria rader
// är medvetet mängdlösa och ska inte räknas som fel.
const PANTRY_OK = new Set([
  "salt", "svartpeppar", "vitpeppar", "peppar", "vatten", "flingsalt",
  "salt och svartpeppar", "salt och peppar", "salt och nymalen svartpeppar",
  "nymalen svartpeppar", "salt & peppar", "lite vatten",
]);
// Mängdlösa rader som är medvetet vaga: garnering/servering/stekning, samt
// efterställda "(valfritt)", "efter smak", "som tillbehör" → inte en defekt.
const VAGUE_RAW = /\b(till (stekning|servering|garnering))\b|^(\s*)(ev\.?|eventuellt|valfri|valfritt|valfria)\b|\b(valfritt|valfria|efter smak|som tillbehör|som garnering|för (stekning|grillning|hetta|servering))\b|\b(att (steka|woka|fritera|smörja))\b|\btill (våffeljärnet|formen|pannan)\b|^\s*(tillbehör|topping|gott till|till servering|garnering|servering)\s*:|\bspray\b/i;

// Förpacknings-/varumärkesbrus som tyder på ostädat namn
const NOISE_PATTERNS = /\b(på burk|i lag|i vatten|i olja|konserv|avrunna?|avrunnna|utan ben|utan skinn|av god kvalitet|reducerat|låg salthalt|natrium|uppdelat?|för \d+ (pers|personer)|san marzano)\b/i;

function classify(raw, recipeId) {
  const { amount, unit, name } = parseIngredient(raw);
  const norm = normalizeName(name);
  const tags = []; // { class, sev }
  const lower = raw.toLowerCase();

  // C5 — PARSE-FEL: mängd uppenbart närvarande men tappad (P0)
  const startsWithQty = /^[\s]*[\d¼½¾⅓⅔⅛⅜⅝⅞⅕⅖]/.test(raw.trim());
  if (amount === null && startsWithQty) {
    tags.push({ cls: "C5 parse-fel (mängd tappad)", sev: "P0" });
  }

  // C2 — SAKNAD MÄNGD på riktig ingrediens (P1), om inte acceptabelt mängdlös
  const acceptableNoAmount =
    PANTRY_OK.has(norm) || PANTRY_OK.has(name) || VAGUE_RAW.test(raw);
  if (amount === null && !startsWithQty && !acceptableNoAmount) {
    tags.push({ cls: "C2 saknad mängd", sev: "P1" });
  }

  // C3 — FLERA INGREDIENSER på en rad (P1). Hoppas över för vaga/valfria rader
  // (serveringsförslag) och för adjektiv-"och" ("rostade och saltade", "skal och saft")
  // som inte är två separata ingredienser.
  const adjOch = /\b(rostad\w*|saltad\w*|skalad\w*|tärnad\w*|hackad\w*|finhackad\w*|grovhackad\w*|strimlad\w*|skivad\w*|kokt\w*|riven|rivna|blandad\w*|torkad\w*|färsk\w*|mald\w*|malen)\s+och\s+\w+/i.test(raw)
    || /\bskal och saft\b/i.test(raw);
  const multiOch = / och /.test(name) && !PANTRY_OK.has(name) && !adjOch;
  if (!acceptableNoAmount && (multiOch || / eller /.test(name) || /\//.test(name))) {
    tags.push({ cls: "C3 flera ingredienser/rad", sev: "P1" });
  }

  // C1 — OKÄNT NAMN: ej pris-matchbart (P2), exkl. pantry-staplar
  if (!CANON_SET.has(norm) && !PANTRY_OK.has(norm) && !/\b(salt|peppar|vatten)\b/.test(norm)) {
    tags.push({ cls: "C1 okänt namn (ej canon)", sev: "P2" });
  }

  // C4 — BESKRIVANDE BRUS i namnet (P2)
  if (NOISE_PATTERNS.test(raw) || norm.length > 28) {
    tags.push({ cls: "C4 beskrivande brus", sev: "P2" });
  }

  // (Not: "namn (mängd)"-formatet ["doh-format"] hanteras redan av parsern och
  //  räknas därför inte som defekt.)

  return { raw, recipeId, amount, unit, name, norm, tags };
}

// ─── Severity-rang ─────────────────────────────────────────────────────────
const SEV_RANK = { P0: 0, P1: 1, P2: 2 };
function topSev(tags) {
  if (!tags.length) return null;
  return tags.map((t) => t.sev).sort((a, b) => SEV_RANK[a] - SEV_RANK[b])[0];
}

// ─── Kör ───────────────────────────────────────────────────────────────────
const { source, recipes } = await loadRecipes();
const today = new Date().toISOString().slice(0, 10);

let totalLines = 0;
const classCount = {};   // cls -> antal
const sevCount = { P0: 0, P1: 0, P2: 0 };
const nonCanon = new Map(); // norm -> antal
const byRecipe = new Map(); // id -> { title, lines: [{raw, tags}] }
const titleById = new Map();

for (const r of recipes) {
  titleById.set(r.id, r.title);
  for (const raw of r.ingredients || []) {
    totalLines++;
    const res = classify(raw, r.id);
    if (!CANON_SET.has(res.norm)) nonCanon.set(res.norm, (nonCanon.get(res.norm) || 0) + 1);
    if (!res.tags.length) continue;
    for (const t of res.tags) classCount[t.cls] = (classCount[t.cls] || 0) + 1;
    const sev = topSev(res.tags);
    sevCount[sev]++;
    if (sev === "P0" || sev === "P1") {
      if (!byRecipe.has(r.id)) byRecipe.set(r.id, { title: r.title, lines: [] });
      byRecipe.get(r.id).lines.push({ raw, sev, tags: res.tags.map((t) => t.cls) });
    }
  }
}

// ─── Bygg markdown ───────────────────────────────────────────────────────────
const matchable = totalLines; // info
const uniqNames = nonCanon.size; // bara icke-canon hamnar här; canon räknas separat nedan
let md = `# Ingrediens-audit — ${today}\n\n`;
md += `> Genererad av \`scripts/audit-ingredients.mjs\`. Källa: ${source}.\n\n`;
md += `## Sammanfattning\n\n`;
md += `- **Recept:** ${recipes.length}\n`;
md += `- **Ingrediensrader:** ${totalLines}\n`;
md += `- **Rader med problem (P0–P2):** ${sevCount.P0 + sevCount.P1 + sevCount.P2}\n\n`;
md += `| Severity | Antal | Innebörd |\n|---|---|---|\n`;
md += `| **P0** | ${sevCount.P0} | Mängd uppenbart närvarande men tappad i parsning — bryter listan |\n`;
md += `| **P1** | ${sevCount.P1} | Riktig ingrediens utan definierbar mängd, eller flera ingredienser på en rad |\n`;
md += `| **P2** | ${sevCount.P2} | Ej pris-matchbart namn, brus eller kosmetiskt format |\n\n`;

md += `## Per problemklass\n\n| Klass | Antal rader |\n|---|---|\n`;
for (const [cls, n] of Object.entries(classCount).sort((a, b) => b[1] - a[1])) {
  md += `| ${cls} | ${n} |\n`;
}

md += `\n## Pris-matchbarhet (canon-täckning)\n\n`;
md += `- **Icke-canon-namn (unika):** ${uniqNames} — matchar inga Willys-erbjudanden, slås ihop svagt.\n\n`;
md += `### 40 vanligaste icke-canon-namnen (Fas 2-kandidater)\n\n| Antal | Namn |\n|---|---|\n`;
for (const [n, c] of [...nonCanon.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
  md += `| ${c}× | ${n} |\n`;
}

md += `\n## P0 + P1-rader per recept (åtgärdslista för Fas 3)\n\n`;
const sortedRecipes = [...byRecipe.entries()].sort((a, b) => a[0] - b[0]);
for (const [id, { title, lines }] of sortedRecipes) {
  md += `\n### #${id} — ${title}\n\n`;
  for (const l of lines) {
    md += `- \`${l.raw}\`  — **${l.sev}** (${l.tags.join("; ")})\n`;
  }
}

// ─── Skriv ut ────────────────────────────────────────────────────────────────
mkdirSync(join(ROOT, "docs"), { recursive: true });
writeFileSync(join(ROOT, "docs", `ingredient-audit-${today}.md`), md, "utf-8");
writeFileSync(
  join(ROOT, "docs", "ingredient-audit-latest.json"),
  JSON.stringify({ date: today, source, recipes: recipes.length, totalLines, sevCount, classCount, nonCanonUnique: uniqNames }, null, 2) + "\n",
  "utf-8"
);

console.log(`Audit klar — ${recipes.length} recept, ${totalLines} rader`);
console.log(`  P0: ${sevCount.P0}  P1: ${sevCount.P1}  P2: ${sevCount.P2}`);
console.log(`  icke-canon unika namn: ${uniqNames}`);
console.log(`Rapport: docs/ingredient-audit-${today}.md`);
