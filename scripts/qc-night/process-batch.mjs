#!/usr/bin/env node
// ─── NATTJOBB BATCH-PROCESSOR ────────────────────────────────────────────────
// Tar modellens förslag (bara ÄNDRADE fält per recept), slår dem mot original ur
// backupen, validerar mot de hårda invarianterna, och emitterar UPDATE-SQL för
// de som passerar. Uppdaterar state + rapport. DB-skrivning sker via MCP (kör
// den emitterade SQL-filen separat).
//
// Förslagsformat (array):
//   { id, set?:{ingredients?,instructions?,notes?,protein?,tags?,seasons?,time?,servings?,timeNote?},
//     renames?:{from:to}, removals?:[canon], changes?:[str], flags?:[str], skip?:bool, reason?:str }
//
// Kör:  node scripts/qc-night/process-batch.mjs <proposals.json> <batchTag>

import { readFileSync, writeFileSync, existsSync } from "fs";
import { validateOne } from "./validate.mjs";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const BACKUP = `${ROOT}docs/recipe-backup-20260607.json`;
const STATE = `${ROOT}docs/qc-night/state.json`;

const [, , proposalsPath, batchTag] = process.argv;
if (!proposalsPath || !batchTag) { console.error("Användning: process-batch.mjs <proposals.json> <batchTag>"); process.exit(2); }

const backup = JSON.parse(readFileSync(BACKUP, "utf-8"));
const byId = new Map(backup.recipes.map((r) => [r.id, r]));
const state = JSON.parse(readFileSync(STATE, "utf-8"));
const proposals = JSON.parse(readFileSync(proposalsPath, "utf-8"));

// SQL-säker dollar-quote för en sträng
function dq(s) {
  let tag = "q";
  while (s.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${s}$${tag}$`;
}
const COL = { ingredients: "ingredients", instructions: "instructions", notes: "notes",
  protein: "protein", tags: "tags", seasons: "seasons", time: "time",
  servings: "servings", timeNote: "time_note", tested: "tested" };
const JSONB = new Set(["ingredients", "instructions", "tags", "seasons"]);

function sqlValue(field, val) {
  if (val === null || val === undefined) return "null";
  // text[]-kolumner: konvertera JSON-array → text[] via jsonb_array_elements_text
  if (JSONB.has(field)) return `ARRAY(SELECT jsonb_array_elements_text(${dq(JSON.stringify(val))}::jsonb))::text[]`;
  if (field === "time" || field === "servings") return String(Number(val));
  if (field === "tested") return val ? "true" : "false";
  return dq(String(val)); // text: notes, protein, timeNote
}

let sql = `-- ${batchTag} — genererad ${new Date().toISOString()}\nbegin;\n`;
let report = `## Batch ${batchTag}\n`;
const pushRows = []; // rader att POSTa till qc_import-bryggan (validerade ändringar)
let nChanged = 0, nUnchanged = 0, nSkipped = 0, nFlagged = 0, nSql = 0;

for (const p of proposals) {
  const old = byId.get(p.id);
  if (!old) { report += `\n### #${p.id} — SAKNAS I BACKUP (hoppar)\n`; continue; }
  const title = old.title;

  if (p.flags?.length) { nFlagged++; }

  if (p.skip || !p.set || Object.keys(p.set).length === 0) {
    state.recipes[p.id] = { status: "unchanged", flags: p.flags || [], reason: p.reason || "ingen ändring behövs" };
    nUnchanged++;
    report += `\n### #${p.id} — ${title}\n- _oförändrad_${p.reason ? " — " + p.reason : ""}\n`;
    for (const f of p.flags || []) report += `- 🏷️ FLAGGA: ${f}\n`;
    continue;
  }

  const neu = { ...old, ...p.set };
  const v = validateOne({ id: p.id, old, neu, renames: p.renames || {}, removals: p.removals || [] });

  if (!v.pass) {
    state.recipes[p.id] = { status: "skipped", fails: v.fails, flags: p.flags || [], oldScore: v.oldScore, newScore: v.newScore };
    nSkipped++;
    report += `\n### #${p.id} — ${title}  ⛔ SKIPPAD (original behålls)\n`;
    for (const f of v.fails) report += `- ❌ ${f}\n`;
    for (const f of p.flags || []) report += `- 🏷️ FLAGGA: ${f}\n`;
    continue;
  }

  // PASS → emittera SQL för ändrade fält
  const sets = [];
  for (const [field, val] of Object.entries(p.set)) {
    if (!COL[field]) { report += `- ⚠️ okänt fält ignorerat: ${field}\n`; continue; }
    sets.push(`${COL[field]} = ${sqlValue(field, val)}`);
  }
  if (sets.length) {
    sql += `update recipes set ${sets.join(", ")} where id = ${p.id}; -- ${title.replace(/\n/g, " ")}\n`;
    nSql++;
    // Push-rad till bryggan: bara ändrade fält, time_note-nyckel mappad
    const row = { id: p.id };
    for (const [field, val] of Object.entries(p.set)) {
      if (!COL[field]) continue;
      row[COL[field]] = val;
    }
    pushRows.push(row);
  }
  nChanged++;
  state.recipes[p.id] = { status: "changed", changedFields: Object.keys(p.set), oldScore: v.oldScore, newScore: v.newScore, flags: p.flags || [], warns: v.warns };

  report += `\n### #${p.id} — ${title}  ✅\n`;
  for (const c of p.changes || []) report += `- ${c}\n`;
  for (const f of p.flags || []) report += `- 🏷️ FLAGGA: ${f}\n`;
  for (const w of v.warns || []) report += `- ⚠️ ${w}\n`;
  if (v.newScore !== v.oldScore) report += `- audit-poäng: ${v.oldScore}→${v.newScore}\n`;
}

sql += "commit;\n";

// Skriv SQL-fil (backup-väg) + push-fil (primär skrivväg via bryggan)
writeFileSync(`${ROOT}docs/qc-night/proposals/${batchTag}.sql`, sql, "utf-8");
writeFileSync(`${ROOT}docs/qc-night/proposals/${batchTag}.push.json`, JSON.stringify(pushRows, null, 2) + "\n", "utf-8");

// Räkna om totals från state (idempotent — säkert att köra om en batch)
const all = Object.values(state.recipes);
state.totals = {
  processed: all.filter((r) => r.status && r.status !== "pending").length,
  changed: all.filter((r) => r.status === "changed").length,
  unchanged: all.filter((r) => r.status === "unchanged").length,
  skipped: all.filter((r) => r.status === "skipped").length,
  flagged: all.filter((r) => (r.flags || []).length).length,
};
state.lastBatch = batchTag;
state.lastUpdate = new Date().toISOString();
writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n", "utf-8");

// Per-batch rapportfil (idempotent — skrivs över vid omkörning; slås ihop i slutet)
writeFileSync(`${ROOT}docs/qc-night/report-${batchTag}.md`, report, "utf-8");

console.log(`Batch ${batchTag}: ändrade=${nChanged} oförändrade=${nUnchanged} skippade=${nSkipped} flaggade=${nFlagged}`);
console.log(`Push (${pushRows.length} rader): docs/qc-night/proposals/${batchTag}.push.json`);
if (nSql === 0) console.log("INGEN ändring att skriva för denna batch.");