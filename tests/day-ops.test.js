// Regressiontester för api/_shared/day-ops.js — rotationslogiken bakom
// "Flytta dag" och "Fri dag". Körs med `node tests/day-ops.test.js` — inga deps.
//
// Bevakar (hård projektregel: befintlig plan får aldrig förstöras):
//   1. spanAfterInsert roterar FULLT innehåll över alla dagtyper (plandagar,
//      egna dagar, anteckningar, tomma dagar som vandrande hål) åt båda håll,
//      till slutet, och no-op:ar korrekt
//   2. Fria dagar (blocked) är PINNADE vid sina datum vid flytt
//   3. planAfterFree skjuter planen framåt + förlänger; planAfterUnfree är inversen
//   4. Round-trip free→unfree återställer planen exakt
//   5. Recept-, noterings- OCH planmängden bevaras av varje operation (invariant)
//   6. changedFullRows pekar bara ut rader som faktiskt ändrats + tömda datum
//      som ska raderas; changedRows d:o för fri dag-flödet

import {
  spanAfterInsert, changedFullRows, fullContent, isEmptyContent,
  planAfterFree, planAfterUnfree,
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
const d = (i) => `2026-06-${String(10 + i).padStart(2, "0")}`;

// Bygg spann-entries för spanAfterInsert:
//   'A'–'Z' = plandag (plan_id 'p1') · 'a'–'m' = egen receptdag ·
//   'n'–'z' = egen anteckning (utan recept) · '_' = tom dag (hål) ·
//   null = fri dag (pinnad)
function mkSpan(spec) {
  return spec.map((s, i) => {
    const date = d(i);
    if (s === null) return { date, blocked: true, content: null };
    if (s === "_") return { date, blocked: false, content: null };
    const isPlan = s === s.toUpperCase();
    const isNote = !isPlan && s >= "n";
    return {
      date,
      blocked: false,
      content: fullContent({
        plan_id: isPlan ? "p1" : null,
        recipe_id: isNote ? null : s.charCodeAt(0),
        recipe_title_snapshot: isNote ? null : s,
        custom_note: isNote ? `not-${s}` : null,
      }),
    };
  });
}
function spanLayout(entries) {
  return entries.map((e) => {
    if (e.blocked) return "·";
    if (isEmptyContent(e.content)) return "_";
    if (e.content.custom_note != null && e.content.recipe_id == null) return "n";
    return String.fromCharCode(e.content.recipe_id);
  }).join("");
}
// Innehålls-signatur (recept + noteringar + plan-tillhörighet) för invariantkoll
function spanSig(entries) {
  const recs = [], notes = [], plans = [];
  for (const e of entries) {
    const c = e.content;
    if (!c) continue;
    if (c.recipe_id != null) recs.push(c.recipe_id);
    if (c.custom_note != null) notes.push(c.custom_note);
    if (c.plan_id != null) plans.push(c.plan_id);
  }
  return JSON.stringify([recs.sort(), notes.sort(), plans.sort()]);
}

// ── rotateMove (rena indexmatematiken) ───────────────────────────────────────
assertEq(rotateMove(["A","B","C","D","E"], 4, 1), ["A","E","B","C","D"], "rotateMove: sist → före idx 1");
assertEq(rotateMove(["A","B","C","D","E"], 0, 3), ["B","C","A","D","E"], "rotateMove: först → före idx 3");
assertEq(rotateMove(["A","B","C","D","E"], 1, 5), ["A","C","D","E","B"], "rotateMove: idx 1 → sist");
assertEq(rotateMove(["A","B","C","D","E"], 1, 2), null,                  "rotateMove: före efterföljaren = no-op");
assertEq(rotateMove(["A","B","C","D","E"], 1, 1), null,                  "rotateMove: före sig själv = no-op");

// ── spanAfterInsert: blandade dagtyper ───────────────────────────────────────
{
  const span = mkSpan(["A","B","_","c","D"]);   // plan, plan, tom, egen receptdag, plan
  const r1 = spanAfterInsert(span, d(4), d(1)); // D före B
  assertEq(spanLayout(r1.next), "ADB_c", "insert: D före B — allt emellan (även tom + egen dag) skjuts framåt");
  assertEq(spanSig(r1.next), spanSig(span), "insert: recept + noteringar + plan-tillhörighet bevarade");
  assertEq(r1.next.map((e) => e.date), span.map((e) => e.date), "insert: datumen ligger fast");

  const r2 = spanAfterInsert(span, d(0), null); // A sist (efter sista innehållsdagen)
  assertEq(spanLayout(r2.next), "B_cDA", "insert: A sist (before=null) — hålet vandrar med");

  assertEq(spanAfterInsert(span, "2099-01-01", d(1)).error, "src",    "insert: okänd källa → error src");
  assertEq(spanAfterInsert(span, d(2), d(0)).error, "src",            "insert: tom dag kan inte vara källa");
  assertEq(spanAfterInsert(span, d(0), "2099-01-01").error, "target", "insert: okänt mål → error target");
}

// ── spanAfterInsert: hålet vandrar till källdatumet ──────────────────────────
{
  const span = mkSpan(["A","_","B"]);
  const r = spanAfterInsert(span, d(0), d(2));  // A före B
  assertEq(spanLayout(r.next), "_AB", "insert: hålet hamnar där källan lämnade");
}

// ── spanAfterInsert: egen anteckning som källa (Joakims veckotyp) ────────────
{
  const span = mkSpan(["a","n","b"]);           // egen receptdag, anteckning, egen receptdag
  const r = spanAfterInsert(span, d(1), d(0));  // anteckningen först
  assertEq(spanLayout(r.next), "nab", "insert: anteckning kläms in före egen receptdag — inga plandagar behövs");
  assertEq(spanSig(r.next), spanSig(span), "insert: noteringstexten bevarad");
}

// ── spanAfterInsert: fria dagar pinnade ──────────────────────────────────────
{
  const span = mkSpan(["A",null,"B","C"]);
  const r = spanAfterInsert(span, d(3), d(0));  // C före A
  assertEq(spanLayout(r.next), "C·AB", "insert: fri dag kvar på sitt datum, övriga roterar runt den");
  assertTrue(r.next[1].blocked === true, "insert: fri dag fortfarande blockerad");
}

// ── spanAfterInsert: no-op-fall ──────────────────────────────────────────────
{
  assertTrue(spanAfterInsert(mkSpan(["A","B"]), d(0), d(1)).noop === true, "insert: före direkta efterföljaren = no-op");
  assertTrue(spanAfterInsert(mkSpan(["A","B"]), d(1), null).noop === true, "insert: sista innehållsdagen sist = no-op");
  assertTrue(spanAfterInsert(mkSpan(["A"]), d(0), null).noop === true,      "insert: ensam dag = no-op");
}

// ── changedFullRows: bara ändrade datum + tömda datum raderas ────────────────
{
  const span = mkSpan(["A","_","B"]);
  const r = spanAfterInsert(span, d(0), null);  // A sist → [_ , B, A]
  assertEq(spanLayout(r.next), "_BA", "diff-fall: A sist över hålet");
  const { upserts, deletions } = changedFullRows(span, r.next);
  assertEq(deletions, [d(0)], "changedFullRows: tömda källdatumet raderas");
  assertEq(upserts.map((u) => u.date), [d(1), d(2)], "changedFullRows: bara datum med nytt innehåll skrivs");
  assertEq(upserts[0].content.recipe_id, "B".charCodeAt(0), "changedFullRows: rätt innehåll på rätt datum");
}
{
  const span = mkSpan(["A","B","C","D","E"]);
  const r = spanAfterInsert(span, d(3), d(1));  // D före B
  assertEq(spanLayout(r.next), "ADBCE", "diff-fall: D före B");
  const { upserts, deletions } = changedFullRows(span, r.next);
  assertEq(upserts.map((u) => u.date), [d(1), d(2), d(3)], "changedFullRows: bara det roterade spannet");
  assertEq(deletions, [], "changedFullRows: inga raderingar när inga datum töms");
}

// ── fullContent / isEmptyContent ─────────────────────────────────────────────
{
  const c = fullContent({ date: d(0), recipe_id: undefined, locked: true });
  assertEq(c, { plan_id: null, recipe_id: null, recipe_title_snapshot: null, saving: null,
                saving_matches: null, custom_note: null, locked: true, blocked: false,
                shopped_at: null, shopping_list_id: null },
    "fullContent: nullar odefinierade fält, tar inte med date");
  assertTrue(isEmptyContent(null), "isEmptyContent: null är tomt");
  assertTrue(isEmptyContent(fullContent({})), "isEmptyContent: allt-null-innehåll är tomt");
  assertTrue(!isEmptyContent(fullContent({ custom_note: "x" })), "isEmptyContent: notering är innehåll");
  assertTrue(!isEmptyContent(fullContent({ locked: true })), "isEmptyContent: lås är innehåll");
}

// ── planAfterFree: skjut planen framåt ───────────────────────────────────────
{
  const rows = mkRows(["A","B","C"]);
  const r = planAfterFree(rows, d(1), d(3));
  assertEq(r.next.map((x) => x.blocked === true ? "·" : x.recipe_title_snapshot).join(""), "A·BC",
    "free: lucka på dagens plats, allt efter skjuts framåt");
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
  assertEq(r.next.map((x) => x.blocked === true ? "·" : (x.recipe_title_snapshot || "_")).join(""), "·A·B",
    "free: även befintliga fria dagar skjuts (skjut planen →)");
}

// ── planAfterUnfree: inversen + round-trip ───────────────────────────────────
{
  const rows = mkRows(["A","B","C"]);
  const freed = planAfterFree(rows, d(1), d(3));
  const restored = planAfterUnfree(freed.next, d(1));
  assertEq(restored.next.map((x) => x.recipe_title_snapshot).join(""), "ABC", "round-trip: free→unfree återställer layouten");
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
  assertEq(c, { recipe_id: null, recipe_title_snapshot: null, saving: null, saving_matches: null,
                shopped_at: null, shopping_list_id: null },
    "contentOf: nullar odefinierade fält, tar inte med date/blocked/locked");
}

// ── Inköpsrundor: inhandlat-status följer innehållet, inte datumet ───────────
{
  const span = mkSpan(["A","B","C"]);
  span[0].content.shopped_at = "2026-06-09T10:00:00Z";  // A är inhandlad
  span[0].content.shopping_list_id = "lista-1";

  const r = spanAfterInsert(span, d(0), null);   // A flyttas sist
  assertEq(spanLayout(r.next), "BCA", "rundor: A flyttad sist");
  assertEq(r.next[2].content.shopped_at, "2026-06-09T10:00:00Z", "rundor: shopped_at följer med innehållet vid insert");
  assertEq(r.next[2].content.shopping_list_id, "lista-1", "rundor: shopping_list_id följer med innehållet vid insert");
  assertEq(r.next[0].content.shopped_at ?? null, null, "rundor: nya första dagen är o-inhandlad");

  // changedFullRows ser en ren stämpelflytt som ändring (annars skrivs den aldrig)
  const { upserts } = changedFullRows(span, r.next);
  const dates = upserts.map((u) => u.date);
  assertTrue(dates.includes(d(0)) && dates.includes(d(2)), "rundor: changedFullRows fångar stämpelflytten");

  // free: luckan som skjuts in har inga rundfält satta
  const rows = mkRows(["A","B","C"]);
  rows[0].shopped_at = "2026-06-09T10:00:00Z";
  const freed = planAfterFree(rows, d(1), d(3));
  assertEq(freed.next[1].shopped_at ?? null, null, "rundor: fri lucka har ingen inhandlat-stämpel");
  assertEq(freed.next[0].shopped_at, "2026-06-09T10:00:00Z", "rundor: A:s stämpel orörd vid free");

  // changedRows (fri dag-flödet) fångar stämpelflytt
  const ch = changedRows(rows, freed.next.slice(0, 3)).map((x) => x.date);
  assertTrue(ch.includes(d(1)), "rundor: changedRows ser skiftet efter luckan");
}

// ── Resultat ──────────────────────────────────────────────────────────────────
if (failed > 0) {
  console.log(failures.join("\n\n"));
}
console.log(`${passed} passerade, ${failed} failade.`);
if (failed > 0) process.exit(1);
console.log("✓ Alla day-ops-tester godkända.");
