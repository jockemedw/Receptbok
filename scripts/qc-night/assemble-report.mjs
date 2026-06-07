#!/usr/bin/env node
// Slår ihop per-batch-rapporter + state till en master-rapport med sammanfattning,
// flaggade tvetydigheter och canon-kandidater (kod-uppföljning).

import { readFileSync, writeFileSync, readdirSync } from "fs";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const QC = `${ROOT}docs/qc-night/`;
const state = JSON.parse(readFileSync(`${QC}state.json`, "utf-8"));
const final = JSON.parse(readFileSync(`${QC}recipe-final-20260607.json`, "utf-8")); // för räkning

const t = state.totals;
const b = state.baseline;
// Slutaudit-siffror (från audit-latest.json)
const auditLatest = JSON.parse(readFileSync(`${ROOT}docs/ingredient-audit-latest.json`, "utf-8"));
const f = auditLatest.sevCount;

let md = `# Receptkvalitet nattjobb — slutrapport 2026-06-07\n\n`;
md += `> Genererad av nattjobbet (autonomt). Spec: \`docs/superpowers/specs/2026-06-07-receptkvalitet-nattjobb-design.md\`.\n\n`;

md += `## Sammanfattning\n\n`;
md += `| | Antal |\n|---|---|\n`;
md += `| Recept totalt | 262 |\n`;
md += `| **Ändrade (live)** | **${t.changed}** |\n`;
md += `| Oförändrade (rena) | ${t.unchanged} |\n`;
md += `| Skippade av valideringen | ${t.skipped} |\n`;
md += `| Recept med flagga (manuell blick) | ${t.flagged} |\n\n`;

md += `### Audit före → efter\n\n`;
md += `| Severity | Före | Efter | Δ |\n|---|---|---|---|\n`;
md += `| P0 (mängd tappad) | ${b.P0} | ${f.P0} | ${f.P0 - b.P0} |\n`;
md += `| P1 (saknad mängd / flera per rad) | ${b.P1} | ${f.P1} | ${f.P1 - b.P1} |\n`;
md += `| P2 (icke-canon / brus) | ${b.P2} | ${f.P2} | ${f.P2 - b.P2} |\n\n`;
const wBefore = b.P0 * 100 + b.P1 * 10 + b.P2;
const wAfter = f.P0 * 100 + f.P1 * 10 + f.P2;
md += `**Viktad svårighetsgrad** (P0×100 + P1×10 + P2×1): ${wBefore} → ${wAfter} (−${Math.round((1 - wAfter / wBefore) * 100)} %).\n\n`;
md += `P1 (de verkliga "list-brytarna" — ingredienser utan handlingsbar mängd) sänktes ${b.P1} → ${f.P1}. `;
md += `P2-antalet är i stort sett oförändrat eftersom (a) flera P1-rader blev giltiga "till servering"-rader som fortfarande har icke-canon-namn (P1→P2, en netto-förbättring), och (b) återstående P2 domineras av ofarliga beskrivningar ("uppdelat", "på burk") som redan parsas korrekt till rätt canon, samt äkta ingrediensnamn som saknar canon-post (kräver kod, se nedan).\n\n`;

md += `## Backup & revert\n\n`;
md += `- **In-DB-snapshot:** \`${state.backupTable}\` (262 rader, exakt kopia före körning) — primär revert-källa.\n`;
md += `- **Off-DB-kopia:** \`${state.backupFile}\` (committad).\n`;
md += `- **Revert:** säg *"revert nattjobbet"* → varje recept återställs ur snapshot-tabellen via MCP.\n\n`;

// Flaggor
md += `## Flaggade tvetydigheter (lämnade oförändrade — kräver din blick)\n\n`;
const flagged = Object.entries(state.recipes).filter(([, r]) => (r.flags || []).length).map(([id, r]) => [+id, r.flags]);
flagged.sort((a, b) => a[0] - b[0]);
const canon = [];
for (const [id, flags] of flagged) {
  const nonCanon = flags.filter((x) => !/canon-kandidat/i.test(x));
  for (const fl of flags.filter((x) => /canon-kandidat/i.test(x))) canon.push(`#${id}: ${fl}`);
  for (const fl of nonCanon) md += `- **#${id}** — ${fl}\n`;
}

md += `\n## Canon-kandidater (kod-uppföljning — EJ tillämpat)\n\n`;
md += `Dessa höjer pris-matchbarheten men kräver ändring i \`NORMALIZATION_TABLE\` (\`api/_shared/shopping-builder.js\`) — utanför nattjobbets data-scope. Säkra tillägg att granska:\n\n`;
md += `- **Plural-buljongtärningar:** \`grönsaksbuljongtärningar\`→grönsaksbuljong, \`hönsbuljongtärningar\`→hönsbuljong, \`buljongtärningar\`→buljongtärning, \`umamibuljongtärningar\`→buljongtärning. (Återkommer i #5,#8,#9,#10,#17 m.fl.)\n`;
md += `- **Self-canons för vanliga råvaror:** \`matvete\`, \`torsk\`, \`sej\`, \`pizzadeg\`, \`nori\`/\`nori-ark\`, \`citrongräs\`, \`portobellosvamp\`→champinjoner, \`baby bella-svamp\`→champinjoner.\n`;
for (const c of canon) md += `- ${c}\n`;

// Per-batch
md += `\n---\n\n# Detaljerade ändringar per batch\n\n`;
const batchFiles = readdirSync(QC).filter((n) => /^report-batch-\d+\.md$/.test(n)).sort();
for (const bf of batchFiles) md += readFileSync(`${QC}${bf}`, "utf-8") + "\n";

writeFileSync(`${QC}report-2026-06-07.md`, md, "utf-8");
console.log(`Slutrapport: docs/qc-night/report-2026-06-07.md (${md.length} tecken)`);
console.log(`Ändrade ${t.changed}, flaggade ${t.flagged}, canon-kandidater ${canon.length}`);
