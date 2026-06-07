#!/usr/bin/env node
// Visar BARA det som behöver omdöme per recept: audit-flaggade ingrediensrader
// (med parse-resultat) + ingrediens↔steg-korsreferens. Fokuserar nattjobbet.
//
// Kör:  node scripts/qc-night/inspect.mjs <startId> <count>   (count default 12)

import { readFileSync } from "fs";
import { parseIngredient, normalizeName, CANON_SET } from "../../api/_shared/shopping-builder.js";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const backup = JSON.parse(readFileSync(`${ROOT}docs/recipe-backup-20260607.json`, "utf-8"));

const PANTRY_OK = new Set(["salt","svartpeppar","vitpeppar","peppar","vatten","flingsalt","salt och svartpeppar","salt och peppar","salt och nymalen svartpeppar","nymalen svartpeppar","salt & peppar","lite vatten"]);
const VAGUE_RAW = /\b(till (stekning|servering|garnering))\b|^(\s*)(ev\.?|eventuellt|valfri|valfritt|valfria)\b|\b(valfritt|valfria|efter smak|som tillbehör|som garnering|för (stekning|grillning|hetta|servering))\b|\b(att (steka|woka|fritera|smörja))\b|\btill (våffeljärnet|formen|pannan)\b|^\s*(tillbehör|topping|gott till|till servering|garnering|servering)\s*:|\bspray\b/i;
const NOISE_PATTERNS = /\b(på burk|i lag|i vatten|i olja|konserv|avrunna?|avrunnna|utan ben|utan skinn|av god kvalitet|reducerat|låg salthalt|natrium|uppdelat?|för \d+ (pers|personer)|san marzano)\b/i;

function classify(raw) {
  const { amount, unit, name } = parseIngredient(raw);
  const norm = normalizeName(name);
  const tags = [];
  const startsWithQty = /^[\s]*[\d¼½¾⅓⅔⅛⅜⅝⅞⅕⅖]/.test(raw.trim());
  if (amount === null && startsWithQty) tags.push("P0:mängd-tappad");
  const acc = PANTRY_OK.has(norm) || PANTRY_OK.has(name) || VAGUE_RAW.test(raw);
  if (amount === null && !startsWithQty && !acc) tags.push("P1:saknad-mängd");
  const adjOch = /\b(rostad\w*|saltad\w*|skalad\w*|tärnad\w*|hackad\w*|finhackad\w*|grovhackad\w*|strimlad\w*|skivad\w*|kokt\w*|riven|rivna|blandad\w*|torkad\w*|färsk\w*|mald\w*|malen)\s+och\s+\w+/i.test(raw) || /\bskal och saft\b/i.test(raw);
  const multiOch = / och /.test(name) && !PANTRY_OK.has(name) && !adjOch;
  if (!acc && (multiOch || / eller /.test(name) || /\//.test(name))) tags.push("P1:flera/rad");
  if (!CANON_SET.has(norm) && !PANTRY_OK.has(norm) && !/\b(salt|peppar|vatten)\b/.test(norm)) tags.push("P2:icke-canon");
  if (NOISE_PATTERNS.test(raw) || norm.length > 28) tags.push("P2:brus");
  return { amount, unit, name, norm, tags };
}

// stem av ingrediensnamn för korsreferens-sökning i stegen
function searchStem(name) {
  return name.replace(/^(liten|litet|små|stor|stora|stort|färsk\w*|fryst\w*|torkad\w*|riven|rivna|hackad\w*|finhackad\w*|grovhackad\w*|skivad\w*|strimlad\w*|tärnad\w*|kokt\w*|mald\w*|malen|röd|gul|grön|vit)\s+/i, "")
    .split(/[, ]/)[0].toLowerCase();
}

const start = parseInt(process.argv[2] || "1", 10);
const count = parseInt(process.argv[3] || "12", 10);
const ids = backup.recipes.map((r) => r.id).filter((id) => id >= start).slice(0, count);

for (const r of backup.recipes.filter((x) => ids.includes(x.id))) {
  const flaggedLines = [];
  (r.ingredients || []).forEach((raw, i) => {
    const c = classify(raw);
    if (c.tags.length) flaggedLines.push(`    [${i}] "${raw}"  →  parse{amt:${c.amount},unit:${c.unit},name:"${c.name}",norm:"${c.norm}"}  ${c.tags.join(" ")}`);
  });
  const steps = (r.instructions || []).join(" \n ").toLowerCase();
  const orphans = [];
  for (const raw of r.ingredients || []) {
    const { name } = parseIngredient(raw);
    const stem = searchStem(name);
    if (stem && stem.length >= 4 && !PANTRY_OK.has(name) && !steps.includes(stem.slice(0, Math.max(4, stem.length - 1)))) {
      orphans.push(`"${name}" (sökte "${stem}")`);
    }
  }
  if (!flaggedLines.length && !orphans.length) {
    console.log(`#${r.id} ${r.title} — REN (inga flaggor)`);
    continue;
  }
  console.log(`\n#${r.id} — ${r.title}  [protein:${r.protein} tags:${(r.tags||[]).join(",")}]`);
  if (flaggedLines.length) { console.log(`  FLAGGADE RADER:`); flaggedLines.forEach((l) => console.log(l)); }
  if (orphans.length) console.log(`  EV. OANVÄNDA I STEG: ${orphans.join("; ")}`);
}
