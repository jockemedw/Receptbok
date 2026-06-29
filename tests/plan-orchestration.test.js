// Integrationstest för plan-orkestreringen i api/generate.js:
//   savePlanToSupabase → archiveOldPlan → activatePlan
//
// Kör med `node tests/plan-orchestration.test.js` (kräver node_modules eftersom
// generate.js importerar @supabase/supabase-js via _shared/supabase.js — klienten
// skapas dock aldrig, vi injicerar en mockad db).
//
// Låser den HÅRDA regeln (CLAUDE.md, Session 95): en aktiv plan får aldrig sakna
// sina dagar, och en avbruten skrivning får aldrig förstöra den gamla planen.
// Testar:
//   1. Happy path: planen skapas INAKTIV, dagarna skrivs, aktiveras sist →
//      exakt en aktiv plan, och den har dagar.
//   2. Fel vid dag-skrivning: den halv-skrivna plan-raden städas bort, den gamla
//      aktiva planen är orörd.
//   3. Hela sekvensen: efter archive+activate finns exakt en aktiv plan med dagar.

import { savePlanToSupabase, archiveOldPlan, activatePlan } from "../api/generate.js";

// ─── Mockad Supabase-db (kedjebar query-builder) ─────────────────────────────
// Stödjer exakt de kedjor de tre funktionerna använder. Håller in-memory-tabeller
// och kan tvinga fram fel på meal_days-insert (failMealInsert).
function makeMockDb(initial = {}) {
  const state = {
    plans: initial.plans ? initial.plans.map((p) => ({ ...p })) : [],
    mealDays: initial.mealDays ? initial.mealDays.map((d) => ({ ...d })) : [],
    archives: initial.archives ? initial.archives.map((a) => ({ ...a })) : [],
    seq: initial.seq || 100,
    failMealInsert: !!initial.failMealInsert,
  };

  const tableOf = (name) =>
    name === "weekly_plans" ? state.plans
    : name === "meal_days" ? state.mealDays
    : name === "plan_archives" ? state.archives
    : null;

  const matches = (row, filters) => filters.every(([kind, col, val]) => {
    if (kind === "eq") return row[col] === val;
    if (kind === "lt") return row[col] < val;
    if (kind === "in") return val.includes(row[col]);
    if (kind === "not") return row[col] != null; // bara not(col,"is",null) används
    return true;
  });

  function builder(table) {
    const q = {
      table, op: "select", payload: null, filters: [], wantSelect: false,
      insert(payload) { this.op = "insert"; this.payload = payload; return this; },
      update(payload) { this.op = "update"; this.payload = payload; return this; },
      delete() { this.op = "delete"; return this; },
      select() { this.wantSelect = true; return this; },
      eq(c, v) { this.filters.push(["eq", c, v]); return this; },
      lt(c, v) { this.filters.push(["lt", c, v]); return this; },
      in(c, v) { this.filters.push(["in", c, v]); return this; },
      not(c) { this.filters.push(["not", c]); return this; },
      order() { return this; },
      limit() { return this; },
      single() { return Promise.resolve(this._exec(true)); },
      maybeSingle() { return Promise.resolve(this._exec(true)); },
      then(resolve, reject) { return Promise.resolve(this._exec(false)).then(resolve, reject); },
      _exec(single) {
        const rows = tableOf(this.table);
        if (this.op === "insert") {
          if (this.table === "meal_days" && state.failMealInsert) {
            return { data: null, error: { message: "simulerat dag-skrivfel" } };
          }
          const items = Array.isArray(this.payload) ? this.payload : [this.payload];
          const inserted = items.map((it) => {
            const row = { ...it };
            if (this.table === "weekly_plans" && row.id == null) row.id = ++state.seq;
            rows.push(row);
            return row;
          });
          const data = single ? inserted[0] : inserted;
          return { data, error: null };
        }
        if (this.op === "update") {
          const hit = rows.filter((r) => matches(r, this.filters));
          hit.forEach((r) => Object.assign(r, this.payload));
          return { data: hit, error: null };
        }
        if (this.op === "delete") {
          for (let i = rows.length - 1; i >= 0; i--) {
            if (matches(rows[i], this.filters)) rows.splice(i, 1);
          }
          return { data: null, error: null };
        }
        // select
        const out = rows.filter((r) => matches(r, this.filters));
        return { data: single ? (out[0] || null) : out, error: null };
      },
    };
    return q;
  }

  return { from: (t) => builder(t), _state: state };
}

// ─── Testinfrastruktur ────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];
function assertEq(actual, expected, desc) {
  if (actual === expected) passed++;
  else { failed++; failures.push(`  FAIL ${desc}\n     förväntad: ${JSON.stringify(expected)}\n     faktisk:   ${JSON.stringify(actual)}`); }
}
function assertTrue(cond, desc) { assertEq(!!cond, true, desc); }

const activeCount = (db) => db._state.plans.filter((p) => p.is_active).length;
const daysForPlan = (db, id) => db._state.mealDays.filter((d) => d.plan_id === id).length;

const NEW_PLAN = {
  generated: "2026-07-01", startDate: "2026-07-01", endDate: "2026-07-03",
  days: [
    { date: "2026-07-01", day: "Onsdag",  recipe: "Laxpasta",    recipeId: 2 },
    { date: "2026-07-02", day: "Torsdag", recipe: "Kycklingwok", recipeId: 3 },
    { date: "2026-07-03", day: "Fredag",  recipe: "Tacos",       recipeId: 5 },
  ],
};

function freshDbWithOldPlan() {
  return makeMockDb({
    plans: [{ id: 1, household_id: "h", start_date: "2026-06-24", end_date: "2026-06-26", is_active: true }],
    mealDays: [
      { plan_id: 1, household_id: "h", date: "2026-06-24", recipe_id: 11, recipe_title_snapshot: "Gammal1", saving: null },
      { plan_id: 1, household_id: "h", date: "2026-06-25", recipe_id: 12, recipe_title_snapshot: "Gammal2", saving: null },
    ],
  });
}

// ─── Test 1: savePlanToSupabase skapar planen INAKTIV med alla dagar ─────────
{
  const db = freshDbWithOldPlan();
  const newId = await savePlanToSupabase(NEW_PLAN, "h", db);
  const newRow = db._state.plans.find((p) => p.id === newId);
  assertTrue(newRow !== undefined, "save: ny plan-rad skapas");
  assertEq(newRow.is_active, false, "save: nya planen är INAKTIV direkt efter skrivning (Session 95-invariant)");
  assertEq(daysForPlan(db, newId), 3, "save: alla 3 dagar skrivs för nya planen");
  assertEq(activeCount(db), 1, "save: fortfarande exakt en aktiv plan (den gamla) — nya är inte påslagen än");
  assertEq(db._state.plans.find((p) => p.is_active).id, 1, "save: den gamla planen är fortfarande den aktiva");
}

// ─── Test 2: fel vid dag-skrivning städar bort plan-raden, gammal plan orörd ──
{
  const db = freshDbWithOldPlan();
  db._state.failMealInsert = true;
  let threw = false;
  try {
    await savePlanToSupabase(NEW_PLAN, "h", db);
  } catch { threw = true; }
  assertTrue(threw, "fel-path: savePlanToSupabase kastar vid dag-skrivfel");
  assertEq(db._state.plans.length, 1, "fel-path: den halv-skrivna plan-raden är borttagen (bara gamla kvar)");
  assertEq(db._state.plans[0].id, 1, "fel-path: kvarvarande plan är den gamla");
  assertEq(db._state.plans[0].is_active, true, "fel-path: gamla aktiva planen är orörd (fortfarande aktiv)");
  assertEq(daysForPlan(db, 1), 2, "fel-path: gamla planens dagar är orörda");
}

// ─── Test 3: hela sekvensen → exakt en aktiv plan, och den har dagar ─────────
{
  const db = freshDbWithOldPlan();
  const newId = await savePlanToSupabase(NEW_PLAN, "h", db);
  await archiveOldPlan(NEW_PLAN.startDate, "h", db);
  await activatePlan(newId, "h", db);

  assertEq(activeCount(db), 1, "sekvens: exakt EN aktiv plan efter archive+activate");
  const active = db._state.plans.find((p) => p.is_active);
  assertEq(active.id, newId, "sekvens: den aktiva planen är den nya");
  assertTrue(daysForPlan(db, newId) >= 1, "sekvens: den aktiva planen har dagar (aldrig tom aktiv plan)");
  assertEq(daysForPlan(db, 1), 0, "sekvens: gamla planens dagar är arkiverade/borttagna");
  assertEq(db._state.archives.length, 1, "sekvens: en arkiv-rad skapades för gamla planen");
}

// ─── Slutrapport ──────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\nPASS ${passed}/${total}${failed ? ` — ${failed} FAIL` : ""}`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log("Alla plan-orkestreringstester godkända.");
