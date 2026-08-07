// Integrationstest för plan-orkestreringen i api/generate.js:
//   savePlanToSupabase → activatePlanAtomic (detachOldPlanDays + RPC
//   activate_plan_atomic, med fallback till activatePlan om RPC:n saknas)
//
// Kör med `node tests/plan-orchestration.test.js` (kräver node_modules eftersom
// generate.js importerar @supabase/supabase-js via _shared/supabase.js — klienten
// skapas dock aldrig, vi injicerar en mockad db).
//
// Låser den HÅRDA regeln (CLAUDE.md, Session 95 + backlog #3): en aktiv plan får
// aldrig sakna sina dagar, och en avbruten skrivning får aldrig förstöra den
// gamla planen.
//
// Låser dessutom Session 137-beteendet: den gamla planens kvarvarande dagar
// ARKIVERAS INTE bort — de bevaras som egna dagar (plan_id = null) och förblir
// därmed redigerbara. En matsedel som ännu inte börjat får aldrig låsas bara för
// att en nyare har genererats.
//
// Testar:
//   1. Happy path: planen skapas INAKTIV, dagarna skrivs, aktiveras sist →
//      exakt en aktiv plan, och den har dagar.
//   2. Fel vid dag-skrivning: den halv-skrivna plan-raden städas bort, den gamla
//      aktiva planen är orörd.
//   3. Hela sekvensen (JS-vägen): efter detach+activate finns exakt en aktiv
//      plan med dagar, och gamla dagarna lever kvar som egna dagar.
//   4. activatePlanAtomic, RPC (migration 011) finns och lyckas → exakt en aktiv
//      plan, gamla dagarna bevarade som egna dagar, inget arkiverat.
//   5. activatePlanAtomic mot den GAMLA RPC:n (migration 001, som arkiverar och
//      raderar) → tack vare att detach:en körs FÖRE anropet hittar den inga
//      rader att förstöra. Rollout-säkerheten: fixen gäller redan innan
//      migration 011 har körts.
//   6. activatePlanAtomic, RPC SAKNAS (PGRST202) → faller tillbaka till
//      activatePlan, samma slutresultat som test 3.
//   7. activatePlanAtomic, RPC:n finns men kraschar MITT I (simulerat fel, t.ex.
//      nätfel under transaktionen) → bytet går inte igenom: gamla planen är
//      fortfarande aktiv, nya planen fortfarande inaktiv, och INGEN dag har gått
//      förlorad (de ligger kvar som egna dagar och syns i matsedeln).
//   8. detachOldPlanDays rör bara den gamla planens rader — nya planens dagar
//      och familjens egna dagar lämnas i fred (invariant #1).

import { savePlanToSupabase, detachOldPlanDays, activatePlan, activatePlanAtomic, isMissingRpcError } from "../api/generate.js";

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
    // RPC-simulering för activate_plan_atomic:
    //   "missing" → PostgREST-felet man får innan Joakim har kört SQL-filen
    //   "crash"   → funktionen finns men kraschar MITT I — eftersom en riktig
    //               Postgres-funktion körs i en transaktion ska INGET av dess
    //               delsteg synas i state efteråt (allt-eller-inget)
    //   "legacy"  → den GAMLA funktionen (db/migrations/001_*.sql) som arkiverar
    //               och raderar gamla planens dagar — ligger kvar i Postgres tills
    //               migration 011 körts, så koden måste vara säker mot den
    //   annars    → kör samma logik som db/migrations/011_*.sql mot
    //               in-memory-tabellerna och committar
    rpcMode: initial.rpcMode || null,
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
      upsert(payload, opts) { this.op = "upsert"; this.payload = payload; this.onConflict = opts && opts.onConflict; return this; },
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
        if (this.op === "upsert") {
          // meal_days skrivs numera med UPSERT (onConflict household_id,date) i
          // stället för INSERT — behåll fel-injektionen för dag-skrivningen.
          if (this.table === "meal_days" && state.failMealInsert) {
            return { data: null, error: { message: "simulerat dag-skrivfel" } };
          }
          const items = Array.isArray(this.payload) ? this.payload : [this.payload];
          const conflictCols = (this.onConflict || "").split(",").map((s) => s.trim()).filter(Boolean);
          const upserted = items.map((it) => {
            const existing = conflictCols.length
              ? rows.find((r) => conflictCols.every((c) => r[c] === it[c]))
              : null;
            if (existing) { Object.assign(existing, it); return existing; }
            const row = { ...it };
            if (this.table === "weekly_plans" && row.id == null) row.id = ++state.seq;
            rows.push(row);
            return row;
          });
          const data = single ? upserted[0] : upserted;
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

  // Mockar PostgREST RPC-anropet mot activate_plan_atomic. Replikerar SQL-filens
  // logik (db/migrations/001_activate_plan_atomic.sql) mot in-memory-state, så
  // test 4 verifierar samma beteende som funktionen är tänkt att ge i Postgres.
  function rpc(name, args) {
    if (name !== "activate_plan_atomic") {
      return Promise.resolve({ data: null, error: { message: `okänd RPC: ${name}` } });
    }
    if (state.rpcMode === "missing") {
      // Samma felform som PostgREST ger när funktionen inte finns i databasen.
      return Promise.resolve({
        data: null,
        error: { code: "PGRST202", message: "Could not find the function public.activate_plan_atomic" },
      });
    }
    if (state.rpcMode === "crash") {
      // Simulerar att anropet dör MITT I transaktionen (nätfel/timeout). En
      // riktig Postgres-transaktion rullar då tillbaka alla delsteg — så
      // in-memory-staten ska INTE muteras alls här, exakt som testet förväntar.
      return Promise.resolve({ data: null, error: { message: "simulerat nätverksfel mitt i RPC" } });
    }

    // ── Happy path: replikera SQL-funktionen steg för steg ──
    const { p_household_id: householdId, p_new_plan_id: newPlanId, p_new_start_date: newStartDate } = args;
    const oldPlan = state.plans.find((p) => p.household_id === householdId && p.is_active);

    if (oldPlan) {
      if (state.rpcMode === "legacy") {
        // db/migrations/001: arkivera dagarna före nya startdatumet och radera
        // ALLA gamla planens dagar. Körs den efter detachOldPlanDays finns inga
        // rader kvar med gamla plan_id → båda stegen blir no-op:ar.
        const daysToArchive = state.mealDays
          .filter((d) => d.plan_id === oldPlan.id && d.date < newStartDate && d.recipe_id != null)
          .sort((a, b) => (a.date < b.date ? -1 : 1));

        if (daysToArchive.length) {
          state.archives.push({
            household_id: householdId,
            start_date: daysToArchive[0].date,
            end_date: daysToArchive[daysToArchive.length - 1].date,
            archived_at: new Date().toISOString(),
            days: daysToArchive.map((d) => ({
              date: d.date, recipe: d.recipe_title_snapshot, recipeId: d.recipe_id,
              ...(d.saving ? { saving: d.saving } : {}),
            })),
          });
        }

        for (let i = state.mealDays.length - 1; i >= 0; i--) {
          if (state.mealDays[i].plan_id === oldPlan.id) state.mealDays.splice(i, 1);
        }
      } else {
        // db/migrations/011: bevara gamla planens kvarvarande dagar som EGNA
        // dagar. Inget arkiveras, ingenting raderas.
        for (const d of state.mealDays) {
          if (d.plan_id === oldPlan.id) d.plan_id = null;
        }
      }
      oldPlan.is_active = false;
    }

    const target = state.plans.find((p) => p.id === newPlanId);
    if (!target) {
      return Promise.resolve({ data: null, error: { message: `activate_plan_atomic: hittade ingen plan ${newPlanId}` } });
    }
    target.is_active = true;
    return Promise.resolve({ data: null, error: null });
  }

  return { from: (t) => builder(t), rpc, _state: state };
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
// Egna dagar = plan_id null. Det är hit den gamla planens kvarvarande dagar tar
// vägen numera, i stället för till plan_archives.
const ownDays = (db) => db._state.mealDays.filter((d) => d.plan_id == null);
const hasDay = (db, date) => db._state.mealDays.some((d) => d.date === date);

// Datum RELATIVA till idag — aldrig hårdkodade, annars blir testet en tidsbomb
// (den gamla arkivtrimningen på 30 dagar sänkte det en gång: fixturens frusna
// datum passerade cutoffen och testet blev rött trots korrekt produktkod).
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
const OLD_START = isoDaysAgo(3);   // gamla planens dagar — nyligen, inom 30-dagarsfönstret
const OLD_MID   = isoDaysAgo(2);
const OLD_END   = isoDaysAgo(1);

const NEW_PLAN = {
  generated: isoDaysAgo(0), startDate: isoDaysAgo(0), endDate: isoDaysAgo(-2),
  days: [
    { date: isoDaysAgo(0),  day: "Onsdag",  recipe: "Laxpasta",    recipeId: 2 },
    { date: isoDaysAgo(-1), day: "Torsdag", recipe: "Kycklingwok", recipeId: 3 },
    { date: isoDaysAgo(-2), day: "Fredag",  recipe: "Tacos",       recipeId: 5 },
  ],
};

function freshDbWithOldPlan() {
  return makeMockDb({
    plans: [{ id: 1, household_id: "h", start_date: OLD_START, end_date: OLD_END, is_active: true }],
    mealDays: [
      { plan_id: 1, household_id: "h", date: OLD_START, recipe_id: 11, recipe_title_snapshot: "Gammal1", saving: null },
      { plan_id: 1, household_id: "h", date: OLD_MID,   recipe_id: 12, recipe_title_snapshot: "Gammal2", saving: null },
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

  // Inköpsrundor (migration 009): UPSERT:en på (household_id, date) behåller
  // gamla kolumnvärden vid regenerering över samma vecka — därför MÅSTE varje
  // dagrad explicit nolla shopped_at + shopping_list_id, annars står den nya
  // rättens dag felaktigt som "inhandlad".
  const newDays = db._state.mealDays.filter((d) => d.plan_id === newId);
  assertTrue(
    newDays.every((d) => "shopped_at" in d && d.shopped_at === null),
    "save: varje dagrad nollar shopped_at explicit (upsert-skydd)"
  );
  assertTrue(
    newDays.every((d) => "shopping_list_id" in d && d.shopping_list_id === null),
    "save: varje dagrad nollar shopping_list_id explicit (upsert-skydd)"
  );
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

// ─── Test 3: hela sekvensen (JS-vägen) → en aktiv plan, gamla dagarna kvar ────
{
  const db = freshDbWithOldPlan();
  const newId = await savePlanToSupabase(NEW_PLAN, "h", db);
  await detachOldPlanDays("h", db);
  await activatePlan(newId, "h", db);

  assertEq(activeCount(db), 1, "sekvens: exakt EN aktiv plan efter detach+activate");
  const active = db._state.plans.find((p) => p.is_active);
  assertEq(active.id, newId, "sekvens: den aktiva planen är den nya");
  assertTrue(daysForPlan(db, newId) >= 1, "sekvens: den aktiva planen har dagar (aldrig tom aktiv plan)");
  assertEq(daysForPlan(db, 1), 0, "sekvens: inga dagar hänger kvar på den gamla planen");
  assertEq(ownDays(db).length, 2, "sekvens: gamla planens båda dagar lever kvar som EGNA dagar");
  assertTrue(hasDay(db, OLD_START) && hasDay(db, OLD_MID), "sekvens: exakt de gamla datumen finns kvar");
  assertEq(db._state.archives.length, 0, "sekvens: ingenting arkiveras längre");
}

// ─── Test 4: activatePlanAtomic, RPC (migration 011) finns och lyckas ────────
{
  const db = freshDbWithOldPlan();
  const newId = await savePlanToSupabase(NEW_PLAN, "h", db);
  const result = await activatePlanAtomic(newId, NEW_PLAN.startDate, "h", db);

  assertTrue(result.usedRpc, "rpc-happy: activatePlanAtomic körde RPC-vägen");
  assertEq(activeCount(db), 1, "rpc-happy: exakt EN aktiv plan efter RPC");
  const active = db._state.plans.find((p) => p.is_active);
  assertEq(active.id, newId, "rpc-happy: den aktiva planen är den nya");
  assertTrue(daysForPlan(db, newId) >= 1, "rpc-happy: den aktiva planen har dagar");
  assertEq(daysForPlan(db, 1), 0, "rpc-happy: inga dagar hänger kvar på den gamla planen");
  assertEq(ownDays(db).length, 2, "rpc-happy: gamla planens dagar bevarade som egna dagar");
  assertEq(db._state.archives.length, 0, "rpc-happy: ingen arkiv-rad skapades");
}

// ─── Test 5: activatePlanAtomic mot den GAMLA RPC:n (migration 001) ──────────
// Rollout-säkerheten. Den gamla funktionen arkiverar och RADERAR gamla planens
// dagar — men eftersom detachOldPlanDays körs FÖRE anropet finns inga rader kvar
// med gamla plan_id, så den hittar ingenting att förstöra. Joakims bugg är alltså
// borta redan vid deploy, utan att migration 011 behöver vara körd.
{
  const db = freshDbWithOldPlan();
  db._state.rpcMode = "legacy";
  const newId = await savePlanToSupabase(NEW_PLAN, "h", db);
  const result = await activatePlanAtomic(newId, NEW_PLAN.startDate, "h", db);

  assertTrue(result.usedRpc, "rpc-legacy: RPC-vägen kördes");
  assertEq(activeCount(db), 1, "rpc-legacy: exakt EN aktiv plan");
  assertEq(db._state.plans.find((p) => p.is_active).id, newId, "rpc-legacy: den aktiva planen är den nya");
  assertEq(ownDays(db).length, 2, "rpc-legacy: gamla planens dagar överlevde den gamla funktionen");
  assertTrue(hasDay(db, OLD_START) && hasDay(db, OLD_MID), "rpc-legacy: exakt de gamla datumen finns kvar");
  assertEq(db._state.archives.length, 0, "rpc-legacy: den gamla funktionen hittade inget att arkivera");
}

// ─── Test 6: activatePlanAtomic, RPC SAKNAS → fallback till JS-aktivering ────
// (main måste fungera innan Joakim har kört SQL:en.)
{
  const db = freshDbWithOldPlan();
  db._state.rpcMode = "missing";
  const newId = await savePlanToSupabase(NEW_PLAN, "h", db);
  const result = await activatePlanAtomic(newId, NEW_PLAN.startDate, "h", db);

  assertEq(result.usedRpc, false, "rpc-missing: activatePlanAtomic upptäcker saknad funktion och faller tillbaka");
  assertEq(activeCount(db), 1, "rpc-missing: exakt EN aktiv plan efter fallback");
  const active = db._state.plans.find((p) => p.is_active);
  assertEq(active.id, newId, "rpc-missing: den aktiva planen är den nya");
  assertTrue(daysForPlan(db, newId) >= 1, "rpc-missing: den aktiva planen har dagar");
  assertEq(ownDays(db).length, 2, "rpc-missing: gamla planens dagar bevarade som egna dagar");
}

// ─── Test 7: activatePlanAtomic, RPC kraschar MITT I → inget går förlorat ────
// Utan atomicitet skulle ett fel här ge NOLL aktiva planer (gammal redan
// deaktiverad/borttagen, ny ej aktiverad). Transaktionen rullas tillbaka
// (rpcMode "crash" muterar inget), så den gamla planen står kvar som aktiv.
//
// Detach:en har dock redan körts och ligger UTANFÖR transaktionen: den gamla
// planens dagar är lösgjorda. Det är avsiktligt och ofarligt — ingen dag är
// borta, de visas och går att redigera som egna dagar, och nästa generering
// läker läget. Migration 011 flyttar in steget i transaktionen och stänger även
// det glappet.
{
  const db = freshDbWithOldPlan();
  db._state.rpcMode = "crash";
  const newId = await savePlanToSupabase(NEW_PLAN, "h", db);

  let threw = false;
  try {
    await activatePlanAtomic(newId, NEW_PLAN.startDate, "h", db);
  } catch { threw = true; }

  assertTrue(threw, "rpc-crash: activatePlanAtomic kastar vidare (inte en \"saknad funktion\"-typ av fel)");
  assertEq(activeCount(db), 1, "rpc-crash: exakt EN aktiv plan kvar (aldrig noll!) — den gamla");
  const active = db._state.plans.find((p) => p.is_active);
  assertEq(active.id, 1, "rpc-crash: gamla planen är fortfarande aktiv (transaktionen rullades tillbaka)");
  assertEq(ownDays(db).length, 2, "rpc-crash: INGEN dag förlorad — de gamla ligger kvar som egna dagar");
  assertTrue(hasDay(db, OLD_START) && hasDay(db, OLD_MID), "rpc-crash: exakt de gamla datumen finns kvar");
  assertEq(db._state.archives.length, 0, "rpc-crash: ingen arkiv-rad skapades");
  // Den nya planen finns kvar i databasen (inaktiv, från savePlanToSupabase) —
  // det är OK och förväntat: den kan aktiveras av ett nytt generate()-anrop.
  assertEq(db._state.plans.find((p) => p.id === newId)?.is_active, false, "rpc-crash: nya planen förblir INAKTIV, inte aktiverad halvvägs");
}

// ─── Test 8: detachOldPlanDays rör BARA den gamla planens rader ──────────────
// Invariant #1: familjens egna dagar och den nya planens dagar får aldrig
// påverkas av plan-bytet.
{
  const db = freshDbWithOldPlan();
  db._state.mealDays.push({
    plan_id: null, household_id: "h", date: isoDaysAgo(5),
    recipe_id: 99, recipe_title_snapshot: "Familjens egen dag", saving: null,
  });
  const newId = await savePlanToSupabase(NEW_PLAN, "h", db);
  const { detached } = await detachOldPlanDays("h", db);

  assertEq(detached.length, 2, "detach: exakt gamla planens två dagar lösgjordes");
  assertEq(detached.join(","), [OLD_START, OLD_MID].sort().join(","), "detach: rätt datum lösgjordes");
  assertEq(daysForPlan(db, newId), 3, "detach: nya planens dagar är orörda");
  assertTrue(hasDay(db, isoDaysAgo(5)), "detach: familjens egen dag är orörd");
  assertEq(
    db._state.mealDays.find((d) => d.date === isoDaysAgo(5)).recipe_title_snapshot,
    "Familjens egen dag",
    "detach: familjens egen dag har kvar sitt innehåll"
  );
}

// ─── Test 9: isMissingRpcError känner igen PostgREST-felformerna ─────────────
{
  assertTrue(isMissingRpcError({ code: "PGRST202" }), "isMissingRpcError: PGRST202-kod");
  assertTrue(isMissingRpcError({ message: "Could not find the function public.activate_plan_atomic" }), "isMissingRpcError: meddelandetext");
  assertTrue(isMissingRpcError({ message: "404 not found" }), "isMissingRpcError: 404-text");
  assertEq(isMissingRpcError({ message: "simulerat nätverksfel mitt i RPC" }), false, "isMissingRpcError: vanligt fel ska INTE tolkas som saknad funktion");
  assertEq(isMissingRpcError(null), false, "isMissingRpcError: null-fel → false");
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
