// Regressiontester för api/_shared/day-ops.js — rotationslogiken bakom alla
// dagoperationer i matsedeln (api/day.js). Körs med `node tests/day-ops.test.js`
// — inga deps.
//
// Bevakar (hård projektregel: befintlig plan får aldrig förstöras):
//   1. insert roterar FULLT innehåll över ALLA dagtyper (plandagar, egna dagar,
//      anteckningar, fria dagar, tomma dagar som vandrande hål) åt båda håll,
//      till slutet, och no-op:ar korrekt — inga pinnade dagtyper
//   2. push gör plats: hålet dras till datumet, allt emellan skjuts framåt —
//      även över plangränsen (plandag → egen dag-hål)
//   3. pull är inversen: markören tas bort, allt dras bakåt; push→pull är en
//      exakt round-trip
//   4. Recept-, noterings-, plan- OCH fri dag-mängden bevaras av varje
//      operation (invariant)
//   5. changedFullRows pekar bara ut rader som faktiskt ändrats + tömda datum
//      som ska raderas
//   6. Inköpsrundor: inhandlat-status följer innehållet, inte datumet
//   7. firstHoleAfter/spanEntries — endpointens spannbyggare

import {
  spanAfterInsert, spanAfterPush, spanAfterPull, changedFullRows,
  fullContent, isEmptyContent, isMarkerContent, rotateMove, spanSignature,
  firstHoleAfter, spanEntries, addDaysIso,
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

const d = (i) => `2026-06-${String(10 + i).padStart(2, "0")}`;

// Bygg spann-entries:
//   'A'–'Z' = plandag (plan_id 'p1') · 'a'–'m' = egen receptdag ·
//   'n'–'z' = egen anteckning (utan recept) · '_' = tom dag (hål) ·
//   '·' = fri dag (blocked, plan_id 'p1')
function mkContent(s) {
  if (s === "_") return null;
  if (s === "·") return fullContent({ plan_id: "p1", blocked: true });
  const isPlan = s === s.toUpperCase();
  const isNote = !isPlan && s >= "n";
  return fullContent({
    plan_id: isPlan ? "p1" : null,
    recipe_id: isNote ? null : s.charCodeAt(0),
    recipe_title_snapshot: isNote ? null : s,
    custom_note: isNote ? `not-${s}` : null,
  });
}
function mkSpan(str) {
  return [...str].map((s, i) => ({ date: d(i), content: mkContent(s) }));
}
function layout(entries) {
  return entries.map((e) => {
    const c = e.content;
    if (isEmptyContent(c)) return "_";
    if (c.blocked) return "·";
    if (c.custom_note != null && c.recipe_id == null) return "n";
    return String.fromCharCode(c.recipe_id);
  }).join("");
}

// ── rotateMove (rena indexmatematiken) ───────────────────────────────────────
assertEq(rotateMove(["A","B","C","D","E"], 4, 1), ["A","E","B","C","D"], "rotateMove: sist → före idx 1");
assertEq(rotateMove(["A","B","C","D","E"], 0, 3), ["B","C","A","D","E"], "rotateMove: först → före idx 3");
assertEq(rotateMove(["A","B","C","D","E"], 1, 5), ["A","C","D","E","B"], "rotateMove: idx 1 → sist");
assertEq(rotateMove(["A","B","C","D","E"], 1, 2), null,                  "rotateMove: före efterföljaren = no-op");
assertEq(rotateMove(["A","B","C","D","E"], 1, 1), null,                  "rotateMove: före sig själv = no-op");

// ── insert: blandade dagtyper ────────────────────────────────────────────────
{
  const span = mkSpan("AB_cD");                 // plan, plan, tom, egen receptdag, plan
  const r1 = spanAfterInsert(span, d(4), d(1)); // D före B
  assertEq(layout(r1.next), "ADB_c", "insert: D före B — allt emellan (även tom + egen dag) skjuts framåt");
  assertEq(spanSignature(r1.next), spanSignature(span), "insert: recept + noteringar + plan-tillhörighet bevarade");
  assertEq(r1.next.map((e) => e.date), span.map((e) => e.date), "insert: datumen ligger fast");

  const r2 = spanAfterInsert(span, d(0), null); // A sist (efter sista innehållsdagen)
  assertEq(layout(r2.next), "B_cDA", "insert: A sist (before=null) — hålet vandrar med");

  assertEq(spanAfterInsert(span, "2099-01-01", d(1)).error, "src",    "insert: okänd källa → error src");
  assertEq(spanAfterInsert(span, d(2), d(0)).error, "src",            "insert: tom dag kan inte vara källa");
  assertEq(spanAfterInsert(span, d(0), "2099-01-01").error, "target", "insert: okänt mål → error target");
}

// ── insert: hålet vandrar till källdatumet ───────────────────────────────────
{
  const r = spanAfterInsert(mkSpan("A_B"), d(0), d(2));  // A före B
  assertEq(layout(r.next), "_AB", "insert: hålet hamnar där källan lämnade");
}

// ── insert: egen anteckning som källa ────────────────────────────────────────
{
  const span = mkSpan("anb");
  const r = spanAfterInsert(span, d(1), d(0));  // anteckningen först
  assertEq(layout(r.next), "nab", "insert: anteckning kläms in före egen receptdag — inga plandagar behövs");
  assertEq(spanSignature(r.next), spanSignature(span), "insert: noteringstexten bevarad");
}

// ── insert: fria dagar deltar som vilket innehåll som helst (ingen pinning) ──
{
  const span = mkSpan("A·BC");
  const r = spanAfterInsert(span, d(3), d(0));  // C före A
  assertEq(layout(r.next), "CA·B", "insert: fri dag roterar med övriga — pinnas inte");
  assertEq(spanSignature(r.next), spanSignature(span), "insert: fri dag-antalet bevarat");

  const r2 = spanAfterInsert(span, d(1), d(3)); // fri dag före C
  assertEq(layout(r2.next), "AB·C", "insert: fri dag kan själv vara källa");
}

// ── insert: no-op-fall ───────────────────────────────────────────────────────
{
  assertTrue(spanAfterInsert(mkSpan("AB"), d(0), d(1)).noop === true, "insert: före direkta efterföljaren = no-op");
  assertTrue(spanAfterInsert(mkSpan("AB"), d(1), null).noop === true, "insert: sista innehållsdagen sist = no-op");
  assertTrue(spanAfterInsert(mkSpan("A"), d(0), null).noop === true,  "insert: ensam dag = no-op");
}

// ── push: gör plats — hålet dras till datumet ────────────────────────────────
{
  const span = mkSpan("ABC_");
  const r = spanAfterPush(span);
  assertEq(layout(r.next), "_ABC", "push: allt skjuts en dag framåt, datumet töms");
  assertEq(spanSignature(r.next), spanSignature(span), "push: innehållsmängden bevarad");
  assertEq(r.next[1].content.recipe_id, "A".charCodeAt(0), "push: receptet hamnar på nästa dag");
}

// ── push: över plangränsen — plandagar följt av egen dag, hål långt fram ─────
{
  const span = mkSpan("AB·cn_");                // plan, plan, fri, egen recept, notering, tom
  const r = spanAfterPush(span);
  assertEq(layout(r.next), "_AB·cn", "push: hela raden (plan + fri + egna) skjuts, plangränsen spelar ingen roll");
  assertEq(r.next[3].content.blocked, true, "push: fri dag följer med (ingen pinning)");
  assertEq(r.next[3].content.plan_id, "p1", "push: plan-tillhörigheten följer innehållet");
}

// ── push: felfall ────────────────────────────────────────────────────────────
{
  assertEq(spanAfterPush(mkSpan("_AB_")).error, "src",  "push: tom källa avvisas");
  assertEq(spanAfterPush(mkSpan("ABC")).error, "hole",  "push: spann utan hål sist avvisas");
  assertTrue(spanAfterPush(mkSpan("A")).noop !== true && spanAfterPush(mkSpan("A")).error === "hole", "push: ensam innehållsdag utan hål");
}

// ── pull: inversen — markören tas bort, allt dras bakåt ──────────────────────
{
  const span = mkSpan("nABC_");                 // notering ("Vi äter ute") + tre recept + hål
  const r = spanAfterPull(span);
  assertEq(layout(r.next), "ABC__", "pull: markören borta, allt efter dras en dag bakåt");
  assertEq(spanSignature(r.next), spanSignature(span.slice(1)), "pull: allt UTOM markören bevarat");
}
{
  const span = mkSpan("·AB_");                  // fri dag först
  const r = spanAfterPull(span);
  assertEq(layout(r.next), "AB__", "pull: fri dag kan dras ihop");
}
{
  const span = mkSpan("_AB_");                  // rent hål först
  const r = spanAfterPull(span);
  assertEq(layout(r.next), "AB__", "pull: rent hål dras ihop");
}
{
  assertEq(layout(spanAfterPull(mkSpan("n_")).next), "__", "pull: markör utan efterföljare = bara markören tas bort");
  assertTrue(spanAfterPull(mkSpan("_")).noop === true, "pull: ensamt hål = no-op");
  assertEq(spanAfterPull(mkSpan("AB_")).error, "src", "pull: dag med recept avvisas");
  assertEq(spanAfterPull(mkSpan("nAB")).error, "hole", "pull: spann utan hål sist avvisas");
}

// ── push→pull round-trip (Ångra) ─────────────────────────────────────────────
{
  const span = mkSpan("AB·C_");
  const pushed = spanAfterPush(span).next;
  pushed[0] = { date: d(0), content: fullContent({ custom_note: "Vi äter ute" }) };
  assertEq(layout(pushed), "nAB·C", "round-trip: efter push + notering");
  // Endpointen bygger pull-spannet t.o.m. NÄSTA hål (firstHoleAfter) → en slot till.
  pushed.push({ date: d(5), content: null });
  const pulled = spanAfterPull(pushed).next;
  assertEq(layout(pulled), "AB·C__", "round-trip: pull återställer layouten exakt");
  assertEq(
    pulled.slice(0, 5).map((e) => [e.date, e.content?.recipe_id ?? null, e.content?.plan_id ?? null, e.content?.blocked ?? null]),
    span.map((e) => [e.date, e.content?.recipe_id ?? null, e.content?.plan_id ?? null, e.content?.blocked ?? null]),
    "round-trip: datum, recept, plan och fri dag exakt återställda"
  );
}

// ── changedFullRows: bara ändrade datum + tömda datum raderas ────────────────
{
  const span = mkSpan("A_B");
  const r = spanAfterInsert(span, d(0), null);  // A sist → [_ , B, A]
  assertEq(layout(r.next), "_BA", "diff-fall: A sist över hålet");
  const { upserts, deletions } = changedFullRows(span, r.next);
  assertEq(deletions, [d(0)], "changedFullRows: tömda källdatumet raderas");
  assertEq(upserts.map((u) => u.date), [d(1), d(2)], "changedFullRows: bara datum med nytt innehåll skrivs");
  assertEq(upserts[0].content.recipe_id, "B".charCodeAt(0), "changedFullRows: rätt innehåll på rätt datum");
}
{
  const span = mkSpan("ABCDE");
  const r = spanAfterInsert(span, d(3), d(1));  // D före B
  assertEq(layout(r.next), "ADBCE", "diff-fall: D före B");
  const { upserts, deletions } = changedFullRows(span, r.next);
  assertEq(upserts.map((u) => u.date), [d(1), d(2), d(3)], "changedFullRows: bara det roterade spannet");
  assertEq(deletions, [], "changedFullRows: inga raderingar när inga datum töms");
}
{
  const span = mkSpan("nAB_");
  const { upserts, deletions } = changedFullRows(span, spanAfterPull(span).next);
  assertEq(deletions, [d(2)], "changedFullRows (pull): sista innehållsdagen töms och raderas");
  assertEq(upserts.map((u) => u.date), [d(0), d(1)], "changedFullRows (pull): markördatumet skrivs över med A");
}

// ── fullContent / isEmptyContent / isMarkerContent ───────────────────────────
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
  assertTrue(isMarkerContent(fullContent({ blocked: true })), "isMarkerContent: fri dag är markör");
  assertTrue(isMarkerContent(fullContent({ custom_note: "Rester" })), "isMarkerContent: notering är markör");
  assertTrue(!isMarkerContent(fullContent({ recipe_id: 1 })), "isMarkerContent: recept är inte markör");
  assertTrue(!isMarkerContent(null), "isMarkerContent: tomt är inte markör");
}

// ── Inköpsrundor: inhandlat-status följer innehållet, inte datumet ───────────
{
  const span = mkSpan("ABC");
  span[0].content.shopped_at = "2026-06-09T10:00:00Z";  // A är inhandlad
  span[0].content.shopping_list_id = "lista-1";

  const r = spanAfterInsert(span, d(0), null);   // A flyttas sist
  assertEq(layout(r.next), "BCA", "rundor: A flyttad sist");
  assertEq(r.next[2].content.shopped_at, "2026-06-09T10:00:00Z", "rundor: shopped_at följer med innehållet vid insert");
  assertEq(r.next[2].content.shopping_list_id, "lista-1", "rundor: shopping_list_id följer med innehållet vid insert");
  assertEq(r.next[0].content.shopped_at ?? null, null, "rundor: nya första dagen är o-inhandlad");

  const { upserts } = changedFullRows(span, r.next);
  const dates = upserts.map((u) => u.date);
  assertTrue(dates.includes(d(0)) && dates.includes(d(2)), "rundor: changedFullRows fångar stämpelflytten");

  const pushSpan = mkSpan("AB_");
  pushSpan[0].content.shopped_at = "2026-06-09T10:00:00Z";
  const pushed = spanAfterPush(pushSpan).next;
  assertEq(pushed[1].content.shopped_at, "2026-06-09T10:00:00Z", "rundor: stämpeln följer receptet vid push");
  assertEq(pushed[0].content, null, "rundor: det tömda datumet har ingen stämpel");
}

// ── firstHoleAfter / spanEntries / addDaysIso (endpointens spannbyggare) ─────
{
  const rows = [
    { date: d(0), recipe_id: 1 },
    { date: d(1), recipe_id: 2 },
    { date: d(2), custom_note: null, recipe_id: null },   // tom rad = hål
    { date: d(4), recipe_id: 3 },
  ];
  const byDate = new Map(rows.map((r) => [r.date, r]));
  assertEq(firstHoleAfter(byDate, d(0), 60), d(2), "firstHoleAfter: tom rad räknas som hål");
  assertEq(firstHoleAfter(byDate, d(2), 60), d(3), "firstHoleAfter: saknad rad räknas som hål");
  assertEq(firstHoleAfter(byDate, d(4), 60), d(5), "firstHoleAfter: dagen efter sista raden");
  assertEq(firstHoleAfter(byDate, d(0), 1), null, "firstHoleAfter: null utanför sökfönstret");

  const entries = spanEntries(byDate, d(0), d(4));
  assertEq(entries.map((e) => e.date), [d(0), d(1), d(2), d(3), d(4)], "spanEntries: kontinuerligt spann");
  assertEq(layout(entries).length, 5, "spanEntries: fem slots");
  assertTrue(entries[2].content === null && entries[3].content === null, "spanEntries: tom rad OCH saknad rad blir null");
  assertEq(addDaysIso("2026-06-30", 1), "2026-07-01", "addDaysIso: månadsskifte");
  assertEq(addDaysIso("2026-01-01", -1), "2025-12-31", "addDaysIso: bakåt över årsskifte");
}

// ── Resultat ──────────────────────────────────────────────────────────────────
if (failed > 0) {
  console.log(failures.join("\n\n"));
}
console.log(`${passed} passerade, ${failed} failade.`);
if (failed > 0) process.exit(1);
console.log("✓ Alla day-ops-tester godkända.");
