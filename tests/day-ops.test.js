// Regressiontester för api/_shared/day-ops.js — rotationslogiken bakom
// "Flytta dag" och "Fri dag". Körs med `node tests/day-ops.test.js` — inga deps.
//
// Bevakar (hård projektregel: befintlig plan får aldrig förstöras):
//   1. planAfterMove roterar rätt åt båda håll, till slutet och no-op:ar korrekt
//   2. Fria dagar (blocked) är PINNADE vid sina datum vid flytt
//   3. planAfterFree skjuter planen framåt + förlänger; planAfterUnfree är inversen
//   4. Round-trip free→unfree återställer planen exakt
//   5. Receptmängden bevaras av varje operation (invariant)
//   6. changedRows pekar bara ut rader som faktiskt ändrats

import {
  planAfterMove, planAfterFree, planAfterUnfree,
  changedRows, contentOf, sameRecipes, rotateMove,
} from "../api/_shared/day-ops.js";

let passed = 0;
let failed = 0;
const failures = [];

function assertEq(actual, expected, desc) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    failures.push(`  ❌ ${desc}\n     förväntad: ${e}\n     faktisk:   ${a}`);
  }
}

function assertTrue(cond, desc) {
  if (cond) passed++;
  else { failed++; failures.push(`  ❌ ${desc}`); }
}

// Bygg planrader: ['A', 'B', null(fri), ...] → rader med datum 06-10, 06-11, ...
function mkRows(spec) {
  return spec.map((s, i) => {
    const date = `2026-06-${String(10 + i).padStart(2, "0")}`;
    if (s === null) {
      return { date, recipe_id: null, recipe_title_snapshot: null, saving: null, saving_matches: null, blocked: true };
    }
    return { date, recipe_id: s.charCodeAt(0), recipe_title_snapshot: s, saving: s === "A" ? 12 : null, saving_matches: null, blocked: false };
  });
}
function layout(rows) {
  return rows.map((r) => (r.blocked === true ? "·" : (r.recipe_title_snapshot || "_"))).join("");
}
const d = (i) => `2026-06-${String(10 + i).padStart(2, "0")}`;

// ── rotateMove (rena indexmatematiken) ───────────────────────────────────────
assertEq(rotateMove(["A","B","C","D","E"], 4, 1), ["A","E","B","C","D"], "rotateMove: sist → före idx 1");
assertEq(rotateMove(["A","B","C","D","E"], 0, 3), ["B","C","A","D","E"], "rotateMove: först → före idx 3");
assertEq(rotateMove(["A","B","C","D","E"], 1, 5), ["A","C","D","E","B"], "rotateMove: idx 1 → sist");
assertEq(rotateMove(["A","B","C","D","E"], 1, 2), null,                  "rotateMove: före efterföljaren = no-op");
assertEq(rotateMove(["A","B","C","D","E"], 1, 1), null,                  "rotateMove: före sig själv = no-op");

// ── planAfterMove: grundfall ─────────────────────────────────────────────────
{
  const rows = mkRows(["A","B","C","D","E"]);
  const r1 = planAfterMove(rows, d(4), d(1));   // E före B
  assertEq(layout(r1.next), "AEBCD", "move: E kläms in före B — senare dagar skjuts framåt");
  assertTrue(sameRecipes(rows, r1.next), "move: receptmängden bevarad (framåt)");
  assertEq(r1.next.map((r) => r.date), rows.map((r) => r.date), "move: datumen ligger fast");

  const r2 = planAfterMove(rows, d(0), null);   // A sist
  assertEq(layout(r2.next), "BCDEA", "move: A flyttas sist (before=null)");

  const r3 = planAfterMove(rows, d(1), d(2));   // B före C = no-op
  assertTrue(r3.noop === true, "move: no-op när målet är nästa position");

  assertEq(planAfterMove(rows, "2099-01-01", d(1)).error, "src",    "move: okänd källa → error src");
  assertEq(planAfterMove(rows, d(0), "2099-01-01").error, "target", "move: okänt mål → error target");
}

// ── planAfterMove: fria dagar pinnade ────────────────────────────────────────
{
  const rows = mkRows(["A","B",null,"C","D"]);  // fri dag på idx 2
  const r = planAfterMove(rows, d(4), d(0));    // D före A
  assertEq(layout(r.next), "DA·BC", "move: fri dag kvar på sitt datum, övriga roterar runt den");
  assertTrue(r.next[2].blocked === true, "move: fri dag fortfarande blockerad");
  assertEq(r.next[2].date, d(2), "move: fri dag på exakt samma datum");
  assertTrue(sameRecipes(rows, r.next), "move: receptmängden bevarad (med fri dag)");

  // Flytt MELLAN dagar på var sin sida om den fria dagen
  const r2 = planAfterMove(rows, d(0), d(4));   // A före D
  assertEq(layout(r2.next), "BC·AD", "move: rotation över fri dag åt andra hållet");
}

// ── planAfterMove: källa = fri dag avvisas ───────────────────────────────────
{
  const rows = mkRows(["A",null,"B"]);
  assertEq(planAfterMove(rows, d(1), d(0)).error, "src", "move: fri dag kan inte vara källa");
}

// ── changedRows: bara det roterade spannet ───────────────────────────────────
{
  const rows = mkRows(["A","B","C","D","E"]);
  const r = planAfterMove(rows, d(3), d(1));    // D före B
  assertEq(layout(r.next), "ADBCE", "move: D före B");
  const ch = changedRows(rows, r.next).map((x) => x.date);
  assertEq(ch, [d(1), d(2), d(3)], "changedRows: bara dagarna i det roterade spannet");
}

// ── planAfterFree: skjut planen framåt ───────────────────────────────────────
{
  const rows = mkRows(["A","B","C"]);
  const r = planAfterFree(rows, d(1), d(3));
  assertEq(layout(r.next), "A·BC", "free: lucka på dagens plats, allt efter skjuts framåt");
  assertEq(r.next.length, 4, "free: planen förlängs med en dag");
  assertEq(r.next[3].date, d(3), "free: svansen ligger på nya datumet");
  assertEq(r.next[3].recipe_title_snapshot, "C", "free: sista receptet hamnar på svansen");
  assertTrue(sameRecipes(rows, r.next), "free: receptmängden bevarad");

  assertEq(planAfterFree(mkRows(["A", null, "B"]), d(1), d(3)).error, "already_free", "free: redan fri dag avvisas");
  assertEq(planAfterFree(rows, "2099-01-01", d(3)).error, "not_found", "free: okänd dag avvisas");
}

// ── planAfterFree skjuter även andra fria dagar (skjut HELA planen) ─────────
{
  const rows = mkRows(["A", null, "B"]);
  const r = planAfterFree(rows, d(0), d(3));
  assertEq(layout(r.next), "·A·B", "free: även befintliga fria dagar skjuts (skjut planen →)");
}

// ── planAfterUnfree: inversen + round-trip ───────────────────────────────────
{
  const rows = mkRows(["A","B","C"]);
  const freed = planAfterFree(rows, d(1), d(3));
  const restored = planAfterUnfree(freed.next, d(1));
  assertEq(layout(restored.next), "ABC", "round-trip: free→unfree återställer layouten");
  assertEq(restored.removedDate, d(3), "round-trip: svansdagen tas bort");
  assertEq(
    restored.next.map((r) => [r.date, r.recipe_id, r.saving]),
    rows.map((r) => [r.date, r.recipe_id, r.saving]),
    "round-trip: datum, recept och besparing exakt återställda"
  );

  assertEq(planAfterUnfree(rows, d(0)).error, "not_free", "unfree: icke-fri dag avvisas");
  assertEq(planAfterUnfree(mkRows([null]), d(0)).error, "would_empty", "unfree: sista dagen kan inte tas bort");
}

// ── contentOf: bara innehållsfälten, alltid definierade ──────────────────────
{
  const c = contentOf({ date: d(0), blocked: true, locked: true, recipe_id: undefined });
  assertEq(c, { recipe_id: null, recipe_title_snapshot: null, saving: null, saving_matches: null },
    "contentOf: nullar odefinierade fält, tar inte med date/blocked/locked");
}

// ── Resultat ──────────────────────────────────────────────────────────────────
if (failed > 0) {
  console.log(failures.join("\n\n"));
}
console.log(`${passed} passerade, ${failed} failade.`);
if (failed > 0) process.exit(1);
console.log("✓ Alla day-ops-tester godkända.");
