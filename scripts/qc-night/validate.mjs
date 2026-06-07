#!/usr/bin/env node
// ─── NATTJOBB-VALIDATOR (Fas QC, 2026-06-07) ────────────────────────────────
// Deterministisk gate för receptkvalitet-nattjobbet. Tar en proposals-fil med
// poster { id, old:{...}, new:{...}, renames?:{from:to}, removals?:[canon] } och
// godkänner/underkänner varje förslag mot de hårda invarianterna i specen
// (docs/superpowers/specs/2026-06-07-receptkvalitet-nattjobb-design.md).
//
// Använder den RIKTIGA parsern ur api/_shared/shopping-builder.js så att gaten
// mäter exakt det inköpslistan ser.
//
// Kör:  node scripts/qc-night/validate.mjs <proposals.json>
// Exit: 0 om alla PASS, 1 om någon FAIL. Skriver JSON-resultat till stdout.

import { readFileSync } from "fs";
import { parseIngredient, normalizeName, CANON_SET } from "../../api/_shared/shopping-builder.js";

const VALID_PROTEIN = new Set(["fisk", "kyckling", "kött", "fläsk", "vegetarisk", null]);

// ─── Audit-klassning (replik av scripts/audit-ingredients.mjs) ───────────────
const PANTRY_OK = new Set([
  "salt", "svartpeppar", "vitpeppar", "peppar", "vatten", "flingsalt",
  "salt och svartpeppar", "salt och peppar", "salt och nymalen svartpeppar",
  "nymalen svartpeppar", "salt & peppar", "lite vatten",
]);
const VAGUE_RAW = /\b(till (stekning|servering|garnering))\b|^(\s*)(ev\.?|eventuellt|valfri|valfritt|valfria)\b|\b(valfritt|valfria|efter smak|som tillbehör|som garnering|för (stekning|grillning|hetta|servering))\b|\b(att (steka|woka|fritera|smörja))\b|\btill (våffeljärnet|formen|pannan)\b|^\s*(tillbehör|topping|gott till|till servering|garnering|servering)\s*:|\bspray\b/i;
const NOISE_PATTERNS = /\b(på burk|i lag|i vatten|i olja|konserv|avrunna?|avrunnna|utan ben|utan skinn|av god kvalitet|reducerat|låg salthalt|natrium|uppdelat?|för \d+ (pers|personer)|san marzano)\b/i;

function classify(raw) {
  const { amount, name } = parseIngredient(raw);
  const norm = normalizeName(name);
  const tags = [];
  const startsWithQty = /^[\s]*[\d¼½¾⅓⅔⅛⅜⅝⅞⅕⅖]/.test(raw.trim());
  if (amount === null && startsWithQty) tags.push("P0");
  const acceptableNoAmount = PANTRY_OK.has(norm) || PANTRY_OK.has(name) || VAGUE_RAW.test(raw);
  if (amount === null && !startsWithQty && !acceptableNoAmount) tags.push("P1");
  const adjOch = /\b(rostad\w*|saltad\w*|skalad\w*|tärnad\w*|hackad\w*|finhackad\w*|grovhackad\w*|strimlad\w*|skivad\w*|kokt\w*|riven|rivna|blandad\w*|torkad\w*|färsk\w*|mald\w*|malen)\s+och\s+\w+/i.test(raw) || /\bskal och saft\b/i.test(raw);
  const multiOch = / och /.test(name) && !PANTRY_OK.has(name) && !adjOch;
  if (!acceptableNoAmount && (multiOch || / eller /.test(name) || /\//.test(name))) tags.push("P1");
  if (!CANON_SET.has(norm) && !PANTRY_OK.has(norm) && !/\b(salt|peppar|vatten)\b/.test(norm)) tags.push("P2");
  if (NOISE_PATTERNS.test(raw) || norm.length > 28) tags.push("P2");
  return tags;
}

const SEV_WEIGHT = { P0: 100, P1: 10, P2: 1 };
function auditScore(ingredients) {
  let s = 0;
  for (const raw of ingredients || []) {
    const tags = classify(raw);
    // top severity per rad (samma som audit: en rad räknas en gång på värsta nivån)
    if (tags.includes("P0")) s += SEV_WEIGHT.P0;
    else if (tags.includes("P1")) s += SEV_WEIGHT.P1;
    else if (tags.includes("P2")) s += SEV_WEIGHT.P2;
  }
  return s;
}

// Prissatta canon-namn (rader med definierbar mängd) som en mängd.
function pricedCanons(ingredients) {
  const set = new Set();
  for (const raw of ingredients || []) {
    const { amount, name } = parseIngredient(raw);
    if (amount !== null) set.add(normalizeName(name));
  }
  return set;
}

// Alla tal-token i instruktioner (för sifferbevaring). Multiset.
function numberTokens(instructions) {
  const counts = new Map();
  for (const step of instructions || []) {
    for (const m of String(step).matchAll(/\d+(?:[.,]\d+)?/g)) {
      const t = m[0].replace(",", ".");
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return counts;
}

export function validateOne(p) {
  const { id, old, neu, renames = {}, removals = [] } = p;
  const fails = [];
  const warns = [];

  // Inv 4 — Struktur
  if (old.id !== neu.id) fails.push(`id ändrat (${old.id}→${neu.id})`);
  if (old.title !== neu.title) fails.push(`title ändrad`);
  if (!VALID_PROTEIN.has(neu.protein ?? null)) fails.push(`ogiltig protein-enum: ${neu.protein}`);
  for (const f of ["ingredients", "instructions", "tags", "seasons"]) {
    if (neu[f] !== undefined && !Array.isArray(neu[f])) fails.push(`${f} är inte array`);
  }
  if (Array.isArray(neu.ingredients) && neu.ingredients.length === 0) fails.push(`ingredients tom`);
  if (Array.isArray(neu.instructions) && neu.instructions.length === 0) fails.push(`instructions tom`);
  if (Array.isArray(neu.ingredients) && neu.ingredients.some((x) => !x || !String(x).trim())) fails.push(`tom ingrediensrad`);
  if (Array.isArray(neu.instructions) && neu.instructions.some((x) => !x || !String(x).trim())) fails.push(`tomt instruktionssteg`);

  // Inv 1 — Canon-bevaring (ingen prissatt ingrediens tappas odeklarerat)
  const oldCanon = pricedCanons(old.ingredients);
  const newCanon = pricedCanons(neu.ingredients);
  const renamedFrom = new Set(Object.keys(renames));
  const removedSet = new Set(removals);
  for (const c of oldCanon) {
    if (!newCanon.has(c) && !renamedFrom.has(c) && !removedSet.has(c)) {
      fails.push(`prissatt ingrediens tappad odeklarerat: "${c}"`);
    }
  }

  // Inv 2 — Audit-icke-regression (ingrediensrader)
  const oldScore = auditScore(old.ingredients);
  const newScore = auditScore(neu.ingredients);
  if (newScore > oldScore) fails.push(`audit-regression: ${oldScore}→${newScore}`);

  // Inv 3 — Sifferbevaring i instruktioner (gammalt ⊆ nytt)
  if (neu.instructions !== undefined) {
    const oldNums = numberTokens(old.instructions);
    const newNums = numberTokens(neu.instructions);
    for (const [t, c] of oldNums) {
      if ((newNums.get(t) || 0) < c) {
        fails.push(`tal-token saknas i nya instruktioner: "${t}" (${c}→${newNums.get(t) || 0}) — möjlig ändrad tid/temp/mängd`);
      }
    }
  }

  // Varning (ej gate): mängd ändrad för canon som finns i båda
  // (fångar oavsiktlig kvantitetsändring; merges/splits kan ge legitima diffar)
  const amtOf = (ings) => {
    const m = new Map();
    for (const raw of ings || []) {
      const { amount, unit, name } = parseIngredient(raw);
      if (amount !== null) {
        const k = normalizeName(name) + "||" + (unit || "");
        m.set(k, (m.get(k) || 0) + amount);
      }
    }
    return m;
  };
  const oa = amtOf(old.ingredients), na = amtOf(neu.ingredients);
  for (const [k, v] of oa) {
    if (na.has(k) && Math.abs(na.get(k) - v) > 0.001) {
      warns.push(`mängd ändrad för ${k}: ${v}→${na.get(k)}`);
    }
  }

  return { id, pass: fails.length === 0, fails, warns, oldScore, newScore };
}

// ─── CLI (endast vid direkt anrop) ───────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("validate.mjs")) {
  const path = process.argv[2];
  if (path) {
    const proposals = JSON.parse(readFileSync(path, "utf-8"));
    const results = proposals.map((p) => validateOne({ id: p.id, old: p.old, neu: p.neu ?? p.new, renames: p.renames, removals: p.removals }));
    const allPass = results.every((r) => r.pass);
    console.log(JSON.stringify({ allPass, results }, null, 2));
    process.exit(allPass ? 0 : 1);
  }
}
