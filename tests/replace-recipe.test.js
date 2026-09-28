// Tester för api/replace-recipe.js (receptbyte) efter prestandaomläggningen P3.
//
// Kör med `node tests/replace-recipe.test.js` (kräver node_modules — endpointen
// importerar _shared/supabase.js; klienten skapas aldrig, vi injicerar en
// mockad db).
//
// Låser:
//   1. PARITET: nya vägen (en parallell läsomgång + beräkning i minnet) ger
//      EXAKT samma DB-slutläge och samma svar som den gamla sekventiella vägen
//      (återskapad nedan ur samma byggstenar) — både "välj själv" och Slumpa
//      (samma seedade slump), med och utan inköpslista.
//   2. RUNDOR: antalet seriella nätverksrundor mäts i mocken — av listan ≤ 3,
//      på listan ≤ 7 (förr ~19).
//   3. Egna dagar (plan_id NULL) på andra datum rörs aldrig av ett byte.
//   4. Felvägar: blockerad dag, dag utanför planen, ingen aktiv plan.

import { replaceRecipe } from "../api/replace-recipe.js";
import { fetchRecipeUsage, pruneOrphanHistory, isoDaysAgo } from "../api/_shared/history.js";
import { pickReplacementOrder } from "../api/_shared/select-recipes.js";
import { getActiveList, fetchCoverage, unshoppedDates, rebuildActiveList } from "../api/_shared/shopping-store.js";

let passed = 0, failed = 0;
const failures = [];
function assertEq(actual, expected, desc) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; failures.push(`  ❌ ${desc}\n     förväntad: ${e}\n     faktisk:   ${a}`); }
}
function assertTrue(cond, desc) {
  if (cond) passed++;
  else { failed++; failures.push(`  ❌ ${desc}`); }
}

// ─── Mockad Supabase-db med rund-mätning ─────────────────────────────────────
// Varje fråga får ett "djup" = 1 + största djupet bland frågor som hunnit bli
// klara när den startar. Frågor i samma Promise.all startar innan någon av dem
// är klar → samma djup. Max-djupet = antalet seriella nätverksrundor.
function makeMockDb(initial) {
  const state = {
    weekly_plans: [], recipes: [], meal_days: [], recipe_history: [],
    shopping_lists: [], shopping_items: [], households: [],
    ...JSON.parse(JSON.stringify(initial)),
    seq: 1000,
  };
  const stats = { calls: 0, doneDepth: 0, maxDepth: 0 };
  const conflictKeys = { recipe_history: ["household_id", "recipe_id"] };

  const matches = (row, filters) => filters.every(([kind, col, val]) => {
    if (kind === "eq") return row[col] === val;
    if (kind === "in") return val.includes(row[col]);
    if (kind === "gte") return row[col] >= val;
    if (kind === "is") return val === null ? row[col] == null : row[col] === val;
    if (kind === "not-is") return val === null ? row[col] != null : row[col] !== val;
    if (kind === "not-in") return !val.includes(row[col]);
    return true;
  });
  const project = (row, cols) => {
    if (!cols || cols.trim() === "*") return { ...row };
    const out = {};
    for (const c of cols.split(",").map((x) => x.trim())) out[c] = row[c] === undefined ? null : row[c];
    return out;
  };

  function builder(table) {
    return {
      op: "select", payload: null, filters: [], cols: null, opts: null, lim: null,
      insert(p) { this.op = "insert"; this.payload = p; return this; },
      update(p) { this.op = "update"; this.payload = p; return this; },
      upsert(p, o) { this.op = "upsert"; this.payload = p; this.opts = o; return this; },
      delete() { this.op = "delete"; return this; },
      select(c) { if (this.op === "select") this.cols = c; else this.retCols = c ?? "*"; return this; },
      eq(c, v) { this.filters.push(["eq", c, v]); return this; },
      in(c, v) { this.filters.push(["in", c, v]); return this; },
      gte(c, v) { this.filters.push(["gte", c, v]); return this; },
      is(c, v) { this.filters.push(["is", c, v]); return this; },
      not(c, op, v) {
        if (op === "in") this.filters.push(["not-in", c, String(v).replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""))]);
        else this.filters.push(["not-is", c, v]);
        return this;
      },
      order() { return this; },
      limit(n) { this.lim = n; return this; },
      single() { return this._run(true); },
      maybeSingle() { return this._run(true); },
      then(res, rej) { return this._run(false).then(res, rej); },
      _run(single) {
        stats.calls++;
        const depth = stats.doneDepth + 1;
        stats.maxDepth = Math.max(stats.maxDepth, depth);
        return new Promise((resolve) => setTimeout(() => {
          const out = this._exec(single);
          stats.doneDepth = Math.max(stats.doneDepth, depth);
          resolve(out);
        }, 1));
      },
      _exec(single) {
        const rows = state[table];
        if (!rows) return { data: null, error: { message: `okänd tabell: ${table}` } };
        if (this.op === "insert") {
          const arr = Array.isArray(this.payload) ? this.payload : [this.payload];
          const ins = arr.map((it) => { const r = { ...it }; if (r.id == null) r.id = ++state.seq; rows.push(r); return r; });
          const data = ins.map((r) => project(r, this.retCols));
          return { data: single ? data[0] : data, error: null };
        }
        if (this.op === "upsert") {
          const keys = conflictKeys[table];
          const arr = Array.isArray(this.payload) ? this.payload : [this.payload];
          for (const it of arr) {
            const hit = rows.find((r) => keys.every((k) => r[k] === it[k]));
            if (hit) Object.assign(hit, it); else rows.push({ ...it });
          }
          return { data: null, error: null };
        }
        if (this.op === "update") {
          rows.filter((r) => matches(r, this.filters)).forEach((r) => Object.assign(r, this.payload));
          return { data: null, error: null };
        }
        if (this.op === "delete") {
          const keep = rows.filter((r) => !matches(r, this.filters));
          rows.length = 0; rows.push(...keep);
          return { data: null, error: null };
        }
        let out = rows.filter((r) => matches(r, this.filters)).map((r) => project(r, this.cols));
        if (this.lim != null) out = out.slice(0, this.lim);
        return { data: single ? (out[0] || null) : out, error: null };
      },
    };
  }
  return {
    from: builder,
    _state: state,
    stats,
    resetStats() { stats.calls = 0; stats.doneDepth = 0; stats.maxDepth = 0; },
  };
}

// Seedad slump (mulberry32) — samma sekvens i båda vägarna.
function seeded(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Den GAMLA sekventiella vägen, återskapad med injicerad db ───────────────
async function legacyReplace(database, householdId, body, rng) {
  const { date, currentRecipeId: rawCurrentId, weekRecipeIds: rawWeekIds = [], newRecipeId, saving, savingMatches, excludeIds: rawEx } = body;
  const currentRecipeId = rawCurrentId == null ? null : parseInt(rawCurrentId, 10);
  const weekRecipeIds = (rawWeekIds || []).map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));
  const excludeIds = (Array.isArray(rawEx) ? rawEx : []).map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id)).slice(0, 10);
  const [{ data: plans }, { data: recipes }] = await Promise.all([
    database.from("weekly_plans").select("id, start_date, end_date, confirmed_at").eq("household_id", householdId).eq("is_active", true).limit(1),
    database.from("recipes").select("id, title, tags, protein, tested, ingredients, servings").eq("household_id", householdId),
  ]);
  const plan = plans?.[0];
  if (!plan) return { status: 404 };
  const { data: mealDayRow } = await database.from("meal_days").select("blocked, shopped_at")
    .eq("household_id", householdId).eq("plan_id", plan.id).eq("date", date).maybeSingle();
  if (!mealDayRow) return { status: 404 };
  if (mealDayRow.blocked) return { status: 400 };
  const allRecipes = recipes || [];
  let picked;
  if (newRecipeId) {
    picked = allRecipes.find((r) => r.id === parseInt(newRecipeId, 10));
  } else {
    const { recentIds, usedOn } = await fetchRecipeUsage(database, householdId);
    const { data: planDays } = await database.from("meal_days").select("recipe_id").eq("plan_id", plan.id).not("recipe_id", "is", null);
    const proteinCount = {};
    for (const d of (planDays || [])) {
      if (d.recipe_id !== currentRecipeId) {
        const r = allRecipes.find((x) => x.id === d.recipe_id);
        if (r) proteinCount[r.protein] = (proteinCount[r.protein] || 0) + 1;
      }
    }
    const order = pickReplacementOrder(allRecipes, {
      current: allRecipes.find((r) => r.id === currentRecipeId) || null,
      weekIds: weekRecipeIds.filter((id) => id !== currentRecipeId),
      recentIds, usedOn, proteinCount, date, excludeIds, rng,
    });
    picked = allRecipes.find((r) => r.id === order[0]);
  }
  const keepSaving = newRecipeId && typeof saving === "number" ? saving : null;
  const keepMatches = newRecipeId && Array.isArray(savingMatches) ? savingMatches : null;
  await Promise.all([
    database.from("meal_days").update({ recipe_id: picked.id, recipe_title_snapshot: picked.title, saving: keepSaving, saving_matches: keepMatches, shopped_at: null })
      .eq("household_id", householdId).eq("date", date),
    database.from("recipe_history").upsert({ household_id: householdId, recipe_id: picked.id, used_on: date }, { onConflict: "household_id,recipe_id" }),
  ]);
  await pruneOrphanHistory(database, householdId);
  const activeList = await getActiveList(householdId, database);
  const coverDates = activeList ? unshoppedDates(await fetchCoverage(householdId, activeList.id, database)) : [];
  const reply = { recipe: picked.title, recipeId: picked.id, saving: keepSaving, savingMatches: keepMatches };
  if (coverDates.includes(date)) {
    const { shoppingList } = await rebuildActiveList({
      householdId, coverDates, span: { startDate: plan.start_date, endDate: plan.end_date }, recipes: allRecipes, database,
    });
    return { status: 200, body: { ...reply, shoppingList } };
  }
  return { status: 200, body: reply };
}

// ─── Fixtur: en vecka framåt från i dag, en egen dag, lista över två dagar ───
const HH = "hh-1";
const T = (n) => isoDaysAgo(-n); // n dagar framåt
const tags = (weekend) => [weekend ? "helg60" : "vardag30"];
const R = (id, protein, ingredients, extra = {}) => ({
  id, household_id: HH, title: `Rätt ${id}`, protein, tested: true, servings: 4,
  tags: ["vardag30", "helg60"], ingredients, ...extra,
});
const RECIPES = [
  R(1, "fisk", ["400 g torsk", "2 dl grädde"]),
  R(2, "kyckling", ["500 g kycklingfilé", "1 st gurka"]),
  R(3, "kött", ["500 g högrev", "2 st morötter"]),
  R(4, "vegetarisk", ["400 g kikärtor", "1 st lök"]),
  R(5, "fisk", ["400 g lax", "1 dl crème fraiche"]),
  R(6, "fläsk", ["300 g bacon", "2 dl grädde"]),
  R(7, "fisk", ["300 g räkor"], { tested: false }),
  R(8, "vegetarisk", ["2 st paprika", "200 g fetaost"]),
  R(9, "kyckling", ["400 g kycklinglår"]),
  R(10, "kött", ["400 g nötfärs", "1 st lök"]),
];
void tags;

function fixture({ onList = true, shoppedTarget = false } = {}) {
  const md = (date, recipe_id, extra = {}) => ({
    household_id: HH, date, recipe_id, recipe_title_snapshot: `Rätt ${recipe_id}`, plan_id: 7,
    blocked: false, shopped_at: null, shopping_list_id: null, saving: null, saving_matches: null, custom_note: null, ...extra,
  });
  return {
    households: [{ id: HH, target_servings: 4 }],
    weekly_plans: [{ id: 7, household_id: HH, is_active: true, start_date: T(0), end_date: T(6), confirmed_at: null }],
    recipes: RECIPES,
    meal_days: [
      md(isoDaysAgo(20), 3, { plan_id: 2, shopped_at: "2026-01-01T00:00:00Z", shopping_list_id: 40 }),
      md(T(0), 1, { shopping_list_id: 50 }),
      md(T(1), 2, { shopping_list_id: onList ? 50 : null, shopped_at: shoppedTarget ? "2026-09-01T00:00:00Z" : null }),
      md(T(2), 3),
      md(T(3), null, { blocked: true }),
      md(T(4), 4, { plan_id: null, custom_note: "Mormor lagar" }), // egen dag
      md(T(5), 5),
    ],
    recipe_history: [
      { household_id: HH, recipe_id: 1, used_on: T(0) },
      { household_id: HH, recipe_id: 2, used_on: T(1) },
      { household_id: HH, recipe_id: 9, used_on: T(3) },   // spökrad (ingen dag)
      { household_id: HH, recipe_id: 10, used_on: isoDaysAgo(5) },
    ],
    shopping_lists: [
      { id: 50, household_id: HH, is_active: true, start_date: T(0), end_date: T(6), recipe_items_moved_at: T(0), generated_at: T(0) },
      { id: 40, household_id: HH, is_active: false, start_date: isoDaysAgo(20), end_date: isoDaysAgo(14), recipe_items_moved_at: null, generated_at: isoDaysAgo(20) },
    ],
    shopping_items: [
      { id: 500, list_id: 50, category: "Fisk & kött", name: "torsk (400 g)", source: "recipe", checked: true, position: 0 },
      { id: 501, list_id: 50, category: "Övrigt", name: "blöjor", source: "manual", checked: true, position: 0 },
      { id: 502, list_id: 50, category: "Övrigt", name: "kaffe", source: "manual", checked: false, position: 1 },
    ],
  };
}

async function runBoth(label, fx, body, seed = 42) {
  const _dbg = process.env.DBG; // DBG=1 skriver ut val + rundor per fall
  const legacyDb = makeMockDb(fx);
  const newDb = makeMockDb(fx);
  const legacy = await legacyReplace(legacyDb, HH, body, seeded(seed));
  const fresh = await replaceRecipe({ database: newDb, householdId: HH, body, rng: seeded(seed) });
  assertEq(fresh.status, legacy.status, `${label}: samma status`);
  // Svaret: samma som förr. (itemIds är nytt och radid-beroende — jämförs
  // separat; rebuildActiveList delas av båda vägarna.)
  assertEq(fresh.body, legacy.body, `${label}: samma svar`);
  assertEq(newDb._state, legacyDb._state, `${label}: identiskt DB-slutläge`);
  const cap = fresh.body.shoppingList ? 7 : 3;
  assertTrue(newDb.stats.maxDepth <= cap, `${label}: ≤ ${cap} seriella rundor (var ${newDb.stats.maxDepth}, förr ${legacyDb.stats.maxDepth})`);
  if (_dbg) console.log(label, fresh.body.recipeId, "rundor ny/gammal", newDb.stats.maxDepth, legacyDb.stats.maxDepth, "anrop", newDb.stats.calls, legacyDb.stats.calls);
  return { fresh, legacy, newDb, legacyDb };
}

// ── 1. Välj själv, dagen på listan ───────────────────────────────────────────
{
  const { fresh, newDb, legacyDb } = await runBoth("välj själv på listan", fixture(), {
    date: T(1), currentRecipeId: 2, newRecipeId: 6, weekRecipeIds: [1, 2, 3, 5],
  });
  assertEq(fresh.body.recipeId, 6, "välj själv: valt recept används");
  assertTrue(!!fresh.body.shoppingList, "välj själv på listan: listan byggdes om");
  assertTrue(newDb.stats.maxDepth <= 7, `välj själv på listan: ≤ 7 seriella rundor (var ${newDb.stats.maxDepth}, förr ${legacyDb.stats.maxDepth})`);
  assertTrue(newDb.stats.maxDepth < legacyDb.stats.maxDepth, "välj själv på listan: färre rundor än förr");
  const ids = fresh.body.shoppingList.itemIds;
  const items = newDb._state.shopping_items.filter((i) => i.list_id === fresh.body.shoppingList.listId);
  assertEq(Object.keys(ids).length, items.length, "välj själv på listan: itemIds täcker alla nya rader");
  assertEq(ids["manual::blöjor"], items.find((i) => i.name === "blöjor").id, "välj själv på listan: itemIds manuell nyckel");
  assertTrue(items.some((i) => i.name.startsWith("bacon")), "välj själv på listan: nya receptets vara finns");
  assertTrue(!items.some((i) => i.name.startsWith("kycklingfilé")), "välj själv på listan: gamla receptets vara borta");
  assertTrue(!newDb._state.recipe_history.some((h) => h.recipe_id === 2), "välj själv: utbytta rättens historikrad städad");
  assertTrue(!newDb._state.recipe_history.some((h) => h.recipe_id === 9), "välj själv: spökrad städad");
  assertTrue(newDb._state.recipe_history.some((h) => h.recipe_id === 10), "välj själv: passerad historik orörd");
}

// ── 2. Välj själv, dagen INTE på listan ──────────────────────────────────────
{
  const { fresh, newDb, legacyDb } = await runBoth("välj själv av listan", fixture({ onList: false }), {
    date: T(1), currentRecipeId: 2, newRecipeId: 8, saving: 12.5, savingMatches: [{ name: "fetaost" }],
  });
  assertTrue(!fresh.body.shoppingList, "av listan: listan rörs inte");
  assertEq(fresh.body.saving, 12.5, "av listan: besparing följer med vid Byt in");
  assertTrue(newDb.stats.maxDepth <= 3, `av listan: ≤ 3 seriella rundor (var ${newDb.stats.maxDepth}, förr ${legacyDb.stats.maxDepth})`);
}

// ── 3. Inhandlad dag som byts → tillbaka på listan (som förr) ────────────────
await runBoth("inhandlad dag på listan", fixture({ shoppedTarget: true }), { date: T(1), currentRecipeId: 2, newRecipeId: 10 });

// ── 4. Slumpa: samma seedade slump ⇒ samma val och slutläge ──────────────────
for (const seed of [1, 7, 42, 99, 1234]) {
  await runBoth(`slumpa seed ${seed} på listan`, fixture(), {
    date: T(1), currentRecipeId: 2, weekRecipeIds: [1, 2, 3, 5], excludeIds: [9],
  }, seed);
  await runBoth(`slumpa seed ${seed} av listan`, fixture({ onList: false }), {
    date: T(2), currentRecipeId: 3, weekRecipeIds: [1, 2, 3, 5],
  }, seed);
}

// ── 5. Egna dagar rörs aldrig ────────────────────────────────────────────────
{
  const fx = fixture();
  const db = makeMockDb(fx);
  await replaceRecipe({ database: db, householdId: HH, body: { date: T(1), currentRecipeId: 2 }, rng: seeded(3) });
  const own = db._state.meal_days.find((d) => d.date === T(4));
  const ownBefore = fx.meal_days.find((d) => d.date === T(4));
  assertEq(own, ownBefore, "egen dag (plan_id NULL) orörd efter byte");
  const res = await replaceRecipe({ database: db, householdId: HH, body: { date: T(4), newRecipeId: 6 } });
  assertEq(res.status, 404, "egen dag kan inte bytas via replace-recipe (inte i planen)");
  assertEq(db._state.meal_days.find((d) => d.date === T(4)), ownBefore, "egen dag orörd efter avvisat byte");
}

// ── 6. Felvägar ──────────────────────────────────────────────────────────────
{
  const db = makeMockDb(fixture());
  const blocked = await replaceRecipe({ database: db, householdId: HH, body: { date: T(3), newRecipeId: 6 } });
  assertEq(blocked.status, 400, "blockerad dag avvisas");
  const noDate = await replaceRecipe({ database: db, householdId: HH, body: {} });
  assertEq(noDate.status, 400, "saknat datum avvisas");
  const badRecipe = await replaceRecipe({ database: db, householdId: HH, body: { date: T(1), newRecipeId: 999 } });
  assertEq(badRecipe.status, 404, "okänt recept avvisas");
  assertEq(db._state, makeMockDb(fixture())._state, "felvägar: inget skrevs");
  const noPlan = makeMockDb({ ...fixture(), weekly_plans: [] });
  const r = await replaceRecipe({ database: noPlan, householdId: HH, body: { date: T(1), newRecipeId: 6 } });
  assertEq(r.status, 404, "ingen aktiv plan → 404");
}

if (failed > 0) console.log(failures.join("\n\n"));
console.log(`${passed} passerade, ${failed} failade.`);
if (failed > 0) process.exit(1);
