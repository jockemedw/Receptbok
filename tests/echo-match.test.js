// Regressiontester för js/weekly-plan/echo-match.js — radnivå-ekokontrollen
// som avgör om ett meal_days-realtime-event redan stämmer med det lokala läget
// (vårt eget eko → ingen omhämtning av planen) samt den lokala speglingen av
// inköpslistans täckningspekare efter ett API-svar.
// Körs med `node tests/echo-match.test.js` — inga deps.
//
// Bevakar:
//   1. Exakt eko (plandag + egen dag) känns igen
//   2. Partnerns ändring (annat recept, notering, fri dag, rundstatus, lista)
//      känns INTE igen → omhämtning som förut
//   3. Saknade fält i eventet = okänt → ingen träff (försiktig regel)
//   4. Plandag vs egen dag får inte blandas ihop
//   5. Tidsstämplar jämförs som tidpunkter, id som text
//   6. applyListCoverage speglar serverns täckningspekare (steg 5 i
//      rebuildActiveList) och rör inte inhandlade dagar

import { mealDayRowMatches, applyListCoverage, ECHO_FIELDS } from "../js/weekly-plan/echo-match.js";

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

const plan = () => ({
  days: [
    { date: "2026-09-28", recipeId: 3, blocked: false, shoppedAt: null, listId: "L1" },
    { date: "2026-09-29", recipeId: 7, blocked: false, shoppedAt: "2026-09-27T10:00:00+00:00", listId: "L0" },
    { date: "2026-09-30", recipeId: null, blocked: true, shoppedAt: null, listId: null },
  ],
});
const custom = () => ({
  entries: {
    "2026-10-05": { note: "Pizza hos farmor", recipeId: null, recipeTitle: "", blocked: false, shoppedAt: null, listId: null },
    "2026-10-06": { note: "", recipeId: 42, recipeTitle: "X", blocked: false, shoppedAt: null, listId: "L1" },
  },
});
const planRow = (over = {}) => ({
  id: "md-0", household_id: "h", plan_id: "P", date: "2026-09-28", recipe_id: 3,
  recipe_title_snapshot: "T", blocked: false, custom_note: null, shopped_at: null,
  shopping_list_id: "L1", locked: false, saving: null, ...over,
});
const customRow = (over = {}) => ({
  id: "md-c", household_id: "h", plan_id: null, date: "2026-10-05", recipe_id: null,
  blocked: false, custom_note: "Pizza hos farmor", shopped_at: null, shopping_list_id: null, ...over,
});

// ── 1. Exakt eko ─────────────────────────────────────────────────────────────
{
  assertEq(mealDayRowMatches(planRow(), plan(), custom()), true, "plandag: exakt eko känns igen");
  assertEq(mealDayRowMatches(planRow({ date: "2026-09-30", recipe_id: null, blocked: true, shopping_list_id: null }), plan(), custom()),
    true, "fri plandag: exakt eko känns igen");
  assertEq(mealDayRowMatches(customRow(), plan(), custom()), true, "egen dag (notering): exakt eko känns igen");
  assertEq(mealDayRowMatches(customRow({ date: "2026-10-06", recipe_id: 42, custom_note: null, shopping_list_id: "L1" }), plan(), custom()),
    true, "egen dag (recept): null-notering = tom notering");
}

// ── 2. Partnerns ändring ─────────────────────────────────────────────────────
{
  assertEq(mealDayRowMatches(planRow({ recipe_id: 99 }), plan(), custom()), false, "annat recept → omhämtning");
  assertEq(mealDayRowMatches(planRow({ blocked: true }), plan(), custom()), false, "blev fri dag → omhämtning");
  assertEq(mealDayRowMatches(planRow({ shopped_at: "2026-09-28T08:00:00+00:00" }), plan(), custom()), false, "markerad inhandlad → omhämtning");
  assertEq(mealDayRowMatches(planRow({ shopping_list_id: "L2" }), plan(), custom()), false, "ny lista → omhämtning");
  assertEq(mealDayRowMatches(customRow({ custom_note: "Tacos" }), plan(), custom()), false, "ändrad notering → omhämtning");
  assertEq(mealDayRowMatches(customRow({ date: "2026-10-07" }), plan(), custom()), false, "okänd egen dag → omhämtning");
  assertEq(mealDayRowMatches(planRow({ date: "2026-12-01" }), plan(), custom()), false, "plandag utanför lokal plan → omhämtning");
}

// ── 3. Saknade fält = okänt ─────────────────────────────────────────────────
{
  for (const k of ECHO_FIELDS) {
    const row = planRow();
    delete row[k];
    assertEq(mealDayRowMatches(row, plan(), custom()), false, `saknat fält ${k} → ingen träff`);
  }
  assertEq(mealDayRowMatches(null, plan(), custom()), false, "ingen rad → ingen träff");
  assertEq(mealDayRowMatches({}, plan(), custom()), false, "tom rad (t.ex. DELETE-eventets new) → ingen träff");
  assertEq(mealDayRowMatches(planRow(), null, null), false, "inget lokalt läge → ingen träff");
}

// ── 4. Plandag vs egen dag ───────────────────────────────────────────────────
{
  assertEq(mealDayRowMatches(planRow({ plan_id: null, custom_note: null }), plan(), custom()), false,
    "rad blev egen dag (plan_id NULL) men lokalt plandag → omhämtning");
  assertEq(mealDayRowMatches(customRow({ plan_id: "P" }), plan(), custom()), false,
    "rad fick plan_id men lokalt egen dag → omhämtning");
  assertEq(mealDayRowMatches(planRow({ custom_note: "hej" }), plan(), custom()), false,
    "plandag med notering → okänt → omhämtning");
}

// ── 5. Normalisering ─────────────────────────────────────────────────────────
{
  assertEq(mealDayRowMatches(planRow({ date: "2026-09-29", recipe_id: 7, shopped_at: "2026-09-27T10:00:00.000Z", shopping_list_id: "L0" }), plan(), custom()),
    true, "samma tidpunkt i annan textform → träff");
  assertEq(mealDayRowMatches(planRow({ recipe_id: "3" }), plan(), custom()), true, "id som text vs tal → träff");
  const p = plan();
  delete p.days[0].listId;   // äldre payload utan fältet = null
  assertEq(mealDayRowMatches(planRow({ shopping_list_id: null }), p, custom()), true, "saknat lokalt listId = null");
}

// ── 6. applyListCoverage ─────────────────────────────────────────────────────
{
  const p = plan();
  const c = custom();
  const changed = applyListCoverage(p, c, { listId: "L2", coveredDates: ["2026-09-28", "2026-10-05"] });
  assertEq(changed, true, "täckning: något ändrades");
  assertEq(p.days.map((d) => d.listId), ["L2", "L0", null], "täckning: byggdag → ny lista, inhandlad dag orörd, fri dag orörd");
  assertEq(c.entries["2026-10-05"].listId, "L2", "täckning: egen dag i täckningen pekar på nya listan");
  assertEq(c.entries["2026-10-06"].listId, null, "täckning: o-inhandlad dag utanför täckningen nollas");
  assertEq(applyListCoverage(p, c, { listId: "L2", coveredDates: ["2026-09-28", "2026-10-05"] }), false, "täckning: idempotent");
  assertEq(applyListCoverage(p, c, { listId: "L3" }), false, "täckning: utan coveredDates görs inget");
  assertEq(p.days[0].listId, "L2", "täckning: utan coveredDates orört");
  // Ekot från servern känns sedan igen som eget.
  assertEq(mealDayRowMatches(planRow({ shopping_list_id: "L2" }), p, c), true, "täckning → serverns pekar-eko känns igen");
}

// ── Resultat ──────────────────────────────────────────────────────────────────
if (failed > 0) {
  console.log(failures.join("\n\n"));
}
console.log(`${passed} passerade, ${failed} failade.`);
if (failed > 0) process.exit(1);
console.log("✓ Alla echo-match-tester godkända.");
