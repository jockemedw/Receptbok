// Enhetstester för api/_shared/shopping-store.js — inköpsrundornas motor.
//
// Kör med `node tests/shopping-store.test.js` (kräver node_modules eftersom
// shopping-store.js importerar @supabase/supabase-js via _shared/supabase.js —
// klienten skapas dock aldrig, vi injicerar en mockad db; fetchTargetServings
// fångar sitt eget fel och ger null = ingen skalning).
//
// Låser de nya garantierna (Session 130):
//   1. Färskt bygge: aktiv lista med receptvaror + täckningspekare satta.
//   2. Manuella varor + deras bockar bevaras över ombyggnad (paritet med gamla koden).
//   3. NYTT: receptbock bevaras vid identiskt namn, nollas vid mängdändring.
//   4. Misslyckad varu-insert lämnar gamla listan aktiv (säkerhetsordningen).
//   5. Dagar som faller ur täckningen får pekaren nollad; inhandlade behåller sin.
//   6. markRoundShopped: stämplar exakt de täckta o-inhandlade dagarna, rör inte
//      varorna på listan, konverterar obockade icke-skafferi receptvaror till
//      Egna tillägg (source='manual'), hoppar över bockade + skafferi.
//   7. Hela mitt-i-veckan-scenariot: bygg mån–ons → "Vi har handlat" → lägg till
//      lör → nya listan innehåller BARA lördagens varor + Egna tillägg-rester.
//      (Spärren: de inhandlade dagarna kommer aldrig tillbaka.)

import {
  rebuildActiveList, markRoundShopped, getActiveList, fetchCoverage,
  unshoppedDates, pantryKey,
} from "../api/_shared/shopping-store.js";

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

// ─── Mockad Supabase-db (kedjebar; samma mönster som plan-orchestration) ─────
function makeMockDb(initial = {}) {
  const state = {
    mealDays: (initial.mealDays || []).map((d) => ({ ...d })),
    lists: (initial.lists || []).map((l) => ({ ...l })),
    items: (initial.items || []).map((i) => ({ ...i })),
    recipes: (initial.recipes || []).map((r) => ({ ...r })),
    pantry: (initial.pantry || []).map((p) => ({ ...p })),
    seq: 1000,
    failItemsInsert: false,
  };

  const tableOf = (name) =>
    name === "meal_days" ? state.mealDays
    : name === "shopping_lists" ? state.lists
    : name === "shopping_items" ? state.items
    : name === "recipes" ? state.recipes
    : name === "pantry_items" ? state.pantry
    : null;

  const matches = (row, filters) => filters.every(([kind, col, val]) => {
    if (kind === "eq") return row[col] === val;
    if (kind === "in") return val.includes(row[col]);
    if (kind === "gte") return row[col] >= val;
    if (kind === "lte") return row[col] <= val;
    if (kind === "is") return val === null ? row[col] == null : row[col] === val;
    if (kind === "not-is") return val === null ? row[col] != null : row[col] !== val;
    return true;
  });

  function builder(table) {
    return {
      table, op: "select", payload: null, filters: [], wantSelect: false,
      insert(p) { this.op = "insert"; this.payload = p; return this; },
      update(p) { this.op = "update"; this.payload = p; return this; },
      select() { this.wantSelect = true; return this; },
      eq(c, v) { this.filters.push(["eq", c, v]); return this; },
      in(c, v) { this.filters.push(["in", c, v]); return this; },
      gte(c, v) { this.filters.push(["gte", c, v]); return this; },
      lte(c, v) { this.filters.push(["lte", c, v]); return this; },
      is(c, v) { this.filters.push(["is", c, v]); return this; },
      not(c, _op, v) { this.filters.push(["not-is", c, v]); return this; },
      order() { return this; },
      limit() { return this; },
      single() { return Promise.resolve(this._exec(true)); },
      maybeSingle() { return Promise.resolve(this._exec(true)); },
      then(resolve, reject) { return Promise.resolve(this._exec(false)).then(resolve, reject); },
      _exec(single) {
        const rows = tableOf(this.table);
        if (!rows) return { data: null, error: { message: `okänd tabell: ${this.table}` } };
        if (this.op === "insert") {
          if (this.table === "shopping_items" && state.failItemsInsert) {
            return { data: null, error: { message: "simulerat varu-skrivfel" } };
          }
          const arr = Array.isArray(this.payload) ? this.payload : [this.payload];
          const inserted = arr.map((it) => {
            const row = { ...it };
            if (row.id == null) row.id = ++state.seq;
            rows.push(row);
            return row;
          });
          return { data: single ? inserted[0] : inserted, error: null };
        }
        if (this.op === "update") {
          const hit = rows.filter((r) => matches(r, this.filters));
          hit.forEach((r) => Object.assign(r, this.payload));
          return { data: hit, error: null };
        }
        const out = rows.filter((r) => matches(r, this.filters));
        return { data: single ? (out[0] || null) : out, error: null };
      },
    };
  }

  return { from: builder, _state: state };
}

const HH = "hushall-1";
const RECIPES = [
  { id: 1, title: "Fisk", servings: 4, ingredients: ["400 g torsk", "2 dl grädde"] },
  { id: 2, title: "Sallad", servings: 4, ingredients: ["1 st gurka", "2 dl grädde"] },
  { id: 3, title: "Gryta", servings: 4, ingredients: ["500 g högrev"] },
];
const day = (date, extra = {}) => ({ household_id: HH, date, recipe_id: 1, blocked: false, plan_id: null, ...extra });
const allItems = (db, listId) => db._state.items.filter((i) => i.list_id === listId);
const itemNamed = (db, listId, prefix) =>
  allItems(db, listId).find((i) => i.name.startsWith(prefix));

// ── 1. Färskt bygge: lista + varor + täckningspekare ─────────────────────────
{
  const db = makeMockDb({
    mealDays: [day("2026-07-20", { recipe_id: 1 }), day("2026-07-21", { recipe_id: 2 })],
    recipes: RECIPES,
  });
  const { listId, shoppingList } = await rebuildActiveList({
    householdId: HH, coverDates: ["2026-07-20", "2026-07-21"],
    recipes: RECIPES, stampMovedAt: true, database: db,
  });

  const list = db._state.lists.find((l) => l.id === listId);
  assertTrue(list?.is_active === true, "färskt bygge: nya listan är aktiv");
  assertTrue(!!list?.recipe_items_moved_at, "färskt bygge: stampMovedAt satte recipe_items_moved_at");
  assertEq(shoppingList.coveredDates, ["2026-07-20", "2026-07-21"], "färskt bygge: coveredDates i svaret");
  assertTrue(!!itemNamed(db, listId, "torsk"), "färskt bygge: torsk på listan");
  assertTrue(!!itemNamed(db, listId, "gurka"), "färskt bygge: gurka på listan");
  assertTrue(itemNamed(db, listId, "grädde")?.name.includes("4 dl"), "färskt bygge: grädde merged till 4 dl över recepten");
  assertTrue(
    db._state.mealDays.every((d) => d.shopping_list_id === listId),
    "färskt bygge: båda dagarna pekar på nya listan"
  );
}

// ── 2+3. Ombyggnad: manuella varor + bockar bevaras; receptbock per namn ─────
{
  const db = makeMockDb({
    mealDays: [day("2026-07-20", { recipe_id: 1 }), day("2026-07-21", { recipe_id: 2 })],
    recipes: RECIPES,
  });
  const first = await rebuildActiveList({
    householdId: HH, coverDates: ["2026-07-20", "2026-07-21"],
    recipes: RECIPES, database: db,
  });
  // Bocka torsken + lägg en manuell vara (bockad) på listan
  itemNamed(db, first.listId, "torsk").checked = true;
  db._state.items.push({ id: 9001, list_id: first.listId, category: "Övrigt", name: "blöjor", source: "manual", checked: true, position: 0 });
  db._state.items.push({ id: 9002, list_id: first.listId, category: "Övrigt", name: "tandkräm", source: "manual", checked: false, position: 1 });

  // Bygg om med en extra dag (recept 3) → torskens namn oförändrat, grädden orörd
  db._state.mealDays.push(day("2026-07-22", { recipe_id: 3 }));
  const second = await rebuildActiveList({
    householdId: HH, coverDates: ["2026-07-20", "2026-07-21", "2026-07-22"],
    recipes: RECIPES, database: db,
  });

  assertEq(second.shoppingList.manualItems, ["blöjor", "tandkräm"], "ombyggnad: manuella varor bevarade i ordning");
  assertEq(second.shoppingList.checkedItems["manual::blöjor"], true, "ombyggnad: manuell bock bevarad");
  assertTrue(!second.shoppingList.checkedItems["manual::tandkräm"], "ombyggnad: obockad manuell vara förblir obockad");
  assertTrue(itemNamed(db, second.listId, "torsk")?.checked === true, "ombyggnad: receptbock bevarad vid identiskt namn");
  assertTrue(!!itemNamed(db, second.listId, "högrev"), "ombyggnad: nya dagens vara tillkom");
  const oldList = db._state.lists.find((l) => l.id === first.listId);
  assertTrue(oldList.is_active === false, "ombyggnad: gamla listan deaktiverad");

  // Mängdändring nollar bocken: bocka grädden, ta bort dag 2 (recept 2) →
  // grädden går 4 dl → 2 dl = nytt namn = obockad.
  itemNamed(db, second.listId, "grädde").checked = true;
  const third = await rebuildActiveList({
    householdId: HH, coverDates: ["2026-07-20", "2026-07-22"],
    recipes: RECIPES, database: db,
  });
  const gradde = itemNamed(db, third.listId, "grädde");
  assertTrue(gradde?.name.includes("2 dl"), "mängdändring: grädden är nu 2 dl");
  assertTrue(gradde?.checked === false, "mängdändring: bocken nollad (mer/annat ska köpas)");
  // Dag som föll ur täckningen (2026-07-21) fick pekaren nollad
  const dropped = db._state.mealDays.find((d) => d.date === "2026-07-21");
  assertEq(dropped.shopping_list_id ?? null, null, "ombyggnad: ur-täckt dag fick pekaren nollad");
}

// ── 4. Misslyckad varu-insert lämnar gamla listan aktiv ──────────────────────
{
  const db = makeMockDb({
    mealDays: [day("2026-07-20", { recipe_id: 1 })],
    recipes: RECIPES,
  });
  const first = await rebuildActiveList({
    householdId: HH, coverDates: ["2026-07-20"], recipes: RECIPES, database: db,
  });
  db._state.failItemsInsert = true;
  let threw = false;
  try {
    await rebuildActiveList({ householdId: HH, coverDates: ["2026-07-20"], recipes: RECIPES, database: db });
  } catch { threw = true; }
  db._state.failItemsInsert = false;
  assertTrue(threw, "säkerhetsordning: varu-skrivfel kastar");
  const active = db._state.lists.filter((l) => l.is_active);
  assertEq(active.map((l) => l.id), [first.listId], "säkerhetsordning: gamla listan fortfarande (enda) aktiva");
}

// ── 6. markRoundShopped: stämpel + konvertering till Egna tillägg ────────────
{
  const db = makeMockDb({
    mealDays: [day("2026-07-20", { recipe_id: 1 }), day("2026-07-21", { recipe_id: 2 })],
    recipes: RECIPES,
    pantry: [{ household_id: HH, name: "gurka" }],   // "har hemma" — ska inte konverteras
  });
  const { listId } = await rebuildActiveList({
    householdId: HH, coverDates: ["2026-07-20", "2026-07-21"], recipes: RECIPES, database: db,
  });
  itemNamed(db, listId, "torsk").checked = true;      // köpt — ska förbli receptvara

  const result = await markRoundShopped(HH, db);
  assertEq(result.shoppedDates, ["2026-07-20", "2026-07-21"], "mark_shopped: exakt de täckta dagarna stämplade");
  assertTrue(db._state.mealDays.every((d) => !!d.shopped_at), "mark_shopped: shopped_at satt på båda dagarna");
  assertTrue(itemNamed(db, listId, "torsk").source === "recipe", "mark_shopped: bockad vara konverteras inte");
  assertTrue(itemNamed(db, listId, "gurka").source === "recipe", "mark_shopped: skafferivara (har hemma) konverteras inte");
  assertTrue(itemNamed(db, listId, "grädde").source === "manual", "mark_shopped: obockad receptvara → Egna tillägg");
  assertEq(result.converted, 1, "mark_shopped: en vara konverterad");

  // Dubbeltryck: inga o-inhandlade dagar kvar → no-op
  const again = await markRoundShopped(HH, db);
  assertEq(again.shoppedDates, [], "mark_shopped: dubbeltryck är en no-op");
}

// ── 7. Hela mitt-i-veckan-scenariot (spärren) ────────────────────────────────
{
  const db = makeMockDb({
    mealDays: [
      day("2026-07-20", { recipe_id: 1 }),   // mån
      day("2026-07-21", { recipe_id: 2 }),   // tis
    ],
    recipes: RECIPES,
  });

  // Måndag: bygg lista för mån+tis, handla, "Vi har handlat"
  await rebuildActiveList({ householdId: HH, coverDates: ["2026-07-20", "2026-07-21"], recipes: RECIPES, database: db });
  const beforeList = await getActiveList(HH, db);
  itemNamed(db, beforeList.id, "torsk").checked = true;
  itemNamed(db, beforeList.id, "gurka").checked = true;
  await markRoundShopped(HH, db);   // grädden var obockad → blir Egna tillägg

  // Fredag: familjen planerar en egen lördag och lägger den på listan (add_day-flödet)
  db._state.mealDays.push(day("2026-07-25", { recipe_id: 3 }));
  const list = await getActiveList(HH, db);
  const covered = unshoppedDates(await fetchCoverage(HH, list.id, db));
  assertEq(covered, [], "scenario: inga o-inhandlade täckta dagar efter 'Vi har handlat'");
  const rebuilt = await rebuildActiveList({
    householdId: HH, coverDates: [...new Set([...covered, "2026-07-25"])],
    recipes: RECIPES, stampMovedAt: true, database: db,
  });

  // Spärren: mån/tis varor (torsk, gurka) är BORTA — bara lördagens + resterna
  const names = allItems(db, rebuilt.listId).map((i) => i.name).sort();
  assertTrue(!!itemNamed(db, rebuilt.listId, "högrev"), "scenario: lördagens vara på nya listan");
  assertTrue(!itemNamed(db, rebuilt.listId, "torsk"), "scenario: SPÄRREN — inhandlad torsk kommer inte tillbaka");
  assertTrue(!itemNamed(db, rebuilt.listId, "gurka"), "scenario: SPÄRREN — inhandlad gurka kommer inte tillbaka");
  const rest = allItems(db, rebuilt.listId).find((i) => i.name.startsWith("grädde"));
  assertTrue(rest?.source === "manual", "scenario: o-köpt rest överlever som Eget tillägg");
  assertEq(rebuilt.shoppingList.coveredDates, ["2026-07-25"], "scenario: nya listan täcker bara lördagen");
  assertTrue(names.length === 2, "scenario: exakt två varor på nya listan (högrev + rest)");

  // De inhandlade dagarna är fortfarande stämplade
  const mon = db._state.mealDays.find((d) => d.date === "2026-07-20");
  assertTrue(!!mon.shopped_at, "scenario: måndagens stämpel orörd av ombygget");
}

// ── pantryKey-paritet ────────────────────────────────────────────────────────
assertEq(pantryKey("Grädde (2 dl)"), "grädde", "pantryKey: mängdparentes strippas + lowercase");
assertEq(pantryKey("gurka"), "gurka", "pantryKey: namn utan mängd orört");

// ── Resultat ─────────────────────────────────────────────────────────────────
if (failed > 0) console.log(failures.join("\n\n"));
console.log(`${passed} passerade, ${failed} failade.`);
if (failed > 0) process.exit(1);
