#!/usr/bin/env node
// Migrerar Receptboken-data från JSON-filer till Supabase Postgres.
// Fas 7B i Supabase-migrationen (spec: docs/superpowers/specs/2026-05-16-supabase-migration-design.md).
//
// Usage:
//   node scripts/migrate-to-supabase.mjs --dry-run    (default — skriver INGENTING)
//   node scripts/migrate-to-supabase.mjs --commit     (live-import till Supabase)
//   node scripts/migrate-to-supabase.mjs --reset      (raderar all data i migrationstabeller, KÖR EJ utan dubbelkontroll)
//
// Env:
//   SUPABASE_URL                 t.ex. https://zqeznveicagqwblltvsa.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    service-role-key (kringgår RLS)

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const HOUSEHOLD_ID = "71e41d47-0c8e-47c6-83ec-696d256496bf";

const MIGRATION_TABLES_DELETE_ORDER = [
  // Barn före föräldrar; lämna households + household_members orörda.
  "shopping_items",
  "shopping_lists",
  "meal_days",
  "recipe_history",
  "plan_archives",
  "weekly_plans",
  "dispatch_preferences",
  "recipes",
];

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  const modes = ["--dry-run", "--commit", "--reset"].filter((f) => flags.has(f));
  if (modes.length > 1) die(`Välj en av --dry-run/--commit/--reset (fick ${modes.join(" + ")})`);
  return modes[0] || "--dry-run";
}

function die(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

async function readJson(relPath) {
  const full = path.join(REPO_ROOT, relPath);
  const raw = await readFile(full, "utf8");
  return JSON.parse(raw);
}

async function loadAllJson() {
  const [recipes, weeklyPlan, customDays, recipeHistory, planArchive, shoppingList, dispatchPreferences] =
    await Promise.all([
      readJson("recipes.json"),
      readJson("weekly-plan.json"),
      readJson("custom-days.json"),
      readJson("recipe-history.json"),
      readJson("plan-archive.json"),
      readJson("shopping-list.json"),
      readJson("dispatch-preferences.json"),
    ]);
  return { recipes, weeklyPlan, customDays, recipeHistory, planArchive, shoppingList, dispatchPreferences };
}

function buildRecipesRows(recipes) {
  const rows = recipes.recipes.map((r) => ({
    id: r.id,
    household_id: HOUSEHOLD_ID,
    title: r.title,
    tested: r.tested === true,
    servings: r.servings ?? null,
    time: r.time ?? null,
    time_note: r.timeNote ?? null,
    tags: Array.isArray(r.tags) ? r.tags : [],
    protein: r.protein ?? null,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    instructions: Array.isArray(r.instructions) ? r.instructions : [],
    notes: r.notes ?? null,
    seasons: Array.isArray(r.seasons) ? r.seasons : [],
  }));
  // Validera unika id:n
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.id)) die(`Dubblerat recept-id ${row.id}`);
    ids.add(row.id);
    if (!row.title) die(`Recept ${row.id} saknar title`);
  }
  return rows;
}

function buildWeeklyPlanRow(weeklyPlan) {
  return {
    household_id: HOUSEHOLD_ID,
    start_date: weeklyPlan.startDate,
    end_date: weeklyPlan.endDate,
    generated_at: weeklyPlan.generated ? `${weeklyPlan.generated}T00:00:00Z` : new Date().toISOString(),
    confirmed_at: weeklyPlan.confirmedAt || null,
    is_active: true,
  };
}

function buildMealDayRows(weeklyPlan, customDays, planId, recipeIds) {
  const rows = [];

  // 1. Dagar från weekly-plan (plan_id = aktiva planen)
  for (const d of weeklyPlan.days) {
    const recipeId = d.recipeId ?? null;
    if (recipeId !== null && !recipeIds.has(recipeId)) {
      die(`weekly-plan dag ${d.date}: recipeId ${recipeId} finns inte i recipes.json`);
    }
    rows.push({
      household_id: HOUSEHOLD_ID,
      date: d.date,
      plan_id: planId,
      recipe_id: recipeId,
      recipe_title_snapshot: d.recipe ?? null,
      custom_note: null,
      saving: d.saving ?? null,
      saving_matches: d.savingMatches ?? null,
      locked: d.locked === true,
      blocked: d.blocked === true,
    });
  }

  // 2. Custom-days (plan_id = null). Hoppa över helt tomma entries {}.
  const planDates = new Set(weeklyPlan.days.map((d) => d.date));
  const entries = customDays.entries || {};
  for (const date of Object.keys(entries).sort()) {
    const entry = entries[date] || {};
    const hasNote = typeof entry.note === "string" && entry.note.trim();
    const hasRecipe = Number.isInteger(entry.recipeId);
    if (!hasNote && !hasRecipe) continue;

    if (planDates.has(date)) {
      die(`Custom-day ${date} kolliderar med weekly-plan-dag (samma datum). Investigera innan import.`);
    }
    if (hasRecipe && !recipeIds.has(entry.recipeId)) {
      die(`custom-day ${date}: recipeId ${entry.recipeId} finns inte i recipes.json`);
    }
    rows.push({
      household_id: HOUSEHOLD_ID,
      date,
      plan_id: null,
      recipe_id: hasRecipe ? entry.recipeId : null,
      recipe_title_snapshot: hasRecipe ? entry.recipeTitle ?? null : null,
      custom_note: hasNote ? entry.note.trim() : null,
      saving: null,
      saving_matches: null,
      locked: false,
      blocked: false,
    });
  }

  // Validera unika (household, date)
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.date)) die(`Dubblett i meal_days: datum ${r.date}`);
    seen.add(r.date);
  }
  return rows;
}

function buildRecipeHistoryRows(recipeHistory, recipeIds) {
  const used = recipeHistory.usedOn || {};
  const rows = [];
  for (const idStr of Object.keys(used)) {
    const id = Number(idStr);
    if (!Number.isInteger(id)) die(`recipe-history: ogiltigt id-nyckel '${idStr}'`);
    if (!recipeIds.has(id)) {
      console.warn(`⚠️  recipe-history: recipe_id ${id} finns inte i recipes.json — hoppar över`);
      continue;
    }
    rows.push({
      household_id: HOUSEHOLD_ID,
      recipe_id: id,
      used_on: used[idStr],
    });
  }
  return rows;
}

function buildPlanArchiveRows(planArchive) {
  const plans = planArchive.plans || [];
  return plans.map((p) => ({
    household_id: HOUSEHOLD_ID,
    start_date: p.startDate,
    end_date: p.endDate,
    archived_at: p.archivedAt || new Date().toISOString(),
    days: p.days || [],
  }));
}

function buildShoppingListRow(shoppingList) {
  return {
    household_id: HOUSEHOLD_ID,
    start_date: shoppingList.startDate,
    end_date: shoppingList.endDate,
    generated_at: shoppingList.generated ? `${shoppingList.generated}T00:00:00Z` : new Date().toISOString(),
    recipe_items_moved_at: shoppingList.recipeItemsMovedAt || null,
    is_active: true,
  };
}

// Frontend-nyckelformat (js/shopping/shopping-list.js):
//   "recipe::<CATEGORY>::<INDEX>"   (bock på receptvara)
//   "manual::<INDEX>"               (bock på manuell vara)
function buildShoppingItemRows(shoppingList, listId) {
  const rows = [];
  const recipeItems = shoppingList.recipeItems || {};
  const checked = shoppingList.checkedItems || {};

  // Bevara kategori-ordning från JSON (insertion order)
  for (const category of Object.keys(recipeItems)) {
    const items = recipeItems[category] || [];
    items.forEach((name, idx) => {
      const key = `recipe::${category}::${idx}`;
      rows.push({
        list_id: listId,
        category,
        name,
        source: "recipe",
        checked: checked[key] === true,
        position: idx,
      });
    });
  }

  const manualItems = shoppingList.manualItems || [];
  manualItems.forEach((name, idx) => {
    const key = `manual::${idx}`;
    rows.push({
      list_id: listId,
      category: "Övrigt",
      name,
      source: "manual",
      checked: checked[key] === true,
      position: idx,
    });
  });

  return rows;
}

function buildDispatchPreferencesRow(dp) {
  return {
    household_id: HOUSEHOLD_ID,
    blocked_brands: Array.isArray(dp.blockedBrands) ? dp.blockedBrands : [],
    prefer_organic: dp.preferOrganic ?? {},
    prefer_swedish: dp.preferSwedish ?? {},
  };
}

function printPlan(data, plan) {
  console.log("\n📦 Migrationsplan");
  console.log(`   household_id = ${HOUSEHOLD_ID}\n`);
  console.log("   Tabell                  | Rader att infoga");
  console.log("   ─────────────────────── | ───────────────");
  console.log(`   recipes                 | ${plan.recipes.length}`);
  console.log(`   weekly_plans            | 1`);
  console.log(`   meal_days (plan)        | ${plan.mealDays.filter((m) => m.plan_id).length}`);
  console.log(`   meal_days (custom)      | ${plan.mealDays.filter((m) => !m.plan_id).length}`);
  console.log(`   recipe_history          | ${plan.recipeHistory.length}`);
  console.log(`   plan_archives           | ${plan.planArchives.length}`);
  console.log(`   shopping_lists          | 1`);
  console.log(`   shopping_items          | ${plan.shoppingItems.length}`);
  console.log(`   dispatch_preferences    | 1`);
  console.log(`\n   Källa: ${data.recipes.recipes.length} recept i recipes.json (totalRecipes=${data.recipes.meta.totalRecipes})`);
  console.log(`   Weekly-plan range: ${data.weeklyPlan.startDate} → ${data.weeklyPlan.endDate}`);
  console.log(`   Custom-days entries: ${Object.keys(data.customDays.entries || {}).length} (varav ${plan.mealDays.filter((m) => !m.plan_id).length} importeras)`);

  // Sample-utskrift
  console.log("\n🔍 Sample rows:");
  console.log("   recipes[0]:", JSON.stringify({ id: plan.recipes[0].id, title: plan.recipes[0].title, protein: plan.recipes[0].protein, ingredients: plan.recipes[0].ingredients.slice(0, 2) }, null, 0));
  console.log("   meal_days[0]:", JSON.stringify(plan.mealDays[0]));
  console.log("   shopping_items[0]:", JSON.stringify(plan.shoppingItems[0]));
}

function makeClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    die("SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY måste sättas. Hämta från Vercel-dashboarden eller Supabase Settings → API.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function checkPrereqs(db) {
  const { data: household, error: hhErr } = await db
    .from("households")
    .select("id, name")
    .eq("id", HOUSEHOLD_ID)
    .maybeSingle();
  if (hhErr) die(`households-lookup misslyckades: ${hhErr.message}`);
  if (!household) die(`Hittar inte household ${HOUSEHOLD_ID} — Fas 7A måste vara klar först.`);

  const { count: existingRecipes, error: recErr } = await db
    .from("recipes")
    .select("id", { count: "exact", head: true });
  if (recErr) die(`recipes-count misslyckades: ${recErr.message}`);
  if ((existingRecipes ?? 0) > 0) {
    die(`recipes-tabellen har redan ${existingRecipes} rader. Kör --reset först om du vill köra om importen.`);
  }
}

async function resetTables(db) {
  console.log("\n⚠️  RESET — raderar all data i migrationstabeller (households + household_members orörda)");
  for (const t of MIGRATION_TABLES_DELETE_ORDER) {
    const { error } = await db.from(t).delete().neq("household_id", "00000000-0000-0000-0000-000000000000");
    if (error && !/no rows/i.test(error.message)) {
      // Fallback för tabeller utan household_id-kolumn (shopping_items)
      const { error: e2 } = await db.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (e2) die(`Reset av ${t} misslyckades: ${error.message} / ${e2.message}`);
    }
    console.log(`   ✓ raderad: ${t}`);
  }
}

async function insertBatch(db, table, rows, opts = {}) {
  if (!rows.length) {
    console.log(`   • ${table}: inga rader att infoga`);
    return [];
  }
  const q = db.from(table).insert(rows);
  const { data, error } = opts.select ? await q.select(opts.select) : await q;
  if (error) die(`Insert i ${table} misslyckades: ${error.message}`);
  console.log(`   ✓ ${table}: ${rows.length} rader infogade`);
  return data || [];
}

async function runImport(db, plan) {
  console.log("\n🚀 Live-import — kör inserts i FK-ordning");

  await insertBatch(db, "recipes", plan.recipes);

  const wpInserted = await insertBatch(db, "weekly_plans", [plan.weeklyPlan], { select: "id" });
  const planId = wpInserted[0]?.id;
  if (!planId) die("Fick ingen id tillbaka från weekly_plans-insert");

  // Koppla meal_days till nya planId (build skickade in placeholder)
  const mealDaysWithId = plan.mealDays.map((m) => (m.plan_id ? { ...m, plan_id: planId } : m));
  await insertBatch(db, "meal_days", mealDaysWithId);

  await insertBatch(db, "recipe_history", plan.recipeHistory);
  await insertBatch(db, "plan_archives", plan.planArchives);

  const slInserted = await insertBatch(db, "shopping_lists", [plan.shoppingList], { select: "id" });
  const listId = slInserted[0]?.id;
  if (!listId) die("Fick ingen id tillbaka från shopping_lists-insert");

  const itemsWithListId = plan.shoppingItems.map((it) => ({ ...it, list_id: listId }));
  await insertBatch(db, "shopping_items", itemsWithListId);

  await insertBatch(db, "dispatch_preferences", [plan.dispatchPreferences]);

  return { planId, listId };
}

async function validate(db, data, plan) {
  console.log("\n🔎 Post-import-validering");
  const checks = [
    ["recipes", plan.recipes.length],
    ["weekly_plans", 1],
    ["meal_days", plan.mealDays.length],
    ["recipe_history", plan.recipeHistory.length],
    ["plan_archives", plan.planArchives.length],
    ["shopping_lists", 1],
    ["shopping_items", plan.shoppingItems.length],
    ["dispatch_preferences", 1],
  ];

  let failed = false;
  for (const [table, expected] of checks) {
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
    if (error) {
      console.log(`   ❌ ${table}: ${error.message}`);
      failed = true;
      continue;
    }
    const ok = count === expected;
    console.log(`   ${ok ? "✓" : "❌"} ${table}: ${count} (väntade ${expected})`);
    if (!ok) failed = true;
  }

  // Spot-check: 5 första + 5 sista + 10 slump på recipes
  console.log("\n   🔬 Spot-check recipes (5 första, 5 sista, 10 slump):");
  const all = data.recipes.recipes;
  const samples = [
    ...all.slice(0, 5),
    ...all.slice(-5),
    ...pickRandom(all, 10),
  ];
  const seen = new Set();
  const uniqSamples = samples.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  for (const src of uniqSamples) {
    const { data: row, error } = await db
      .from("recipes")
      .select("id, title, protein, ingredients, instructions")
      .eq("id", src.id)
      .maybeSingle();
    if (error || !row) {
      console.log(`   ❌ id ${src.id}: ${error?.message || "saknas"}`);
      failed = true;
      continue;
    }
    const titleOk = row.title === src.title;
    const proteinOk = row.protein === src.protein;
    const ingredientsOk = JSON.stringify(row.ingredients) === JSON.stringify(src.ingredients);
    const instructionsOk = JSON.stringify(row.instructions) === JSON.stringify(src.instructions);
    if (titleOk && proteinOk && ingredientsOk && instructionsOk) {
      console.log(`   ✓ id ${src.id}: "${src.title.slice(0, 50)}"`);
    } else {
      console.log(`   ❌ id ${src.id}: title=${titleOk} protein=${proteinOk} ingredients=${ingredientsOk} instructions=${instructionsOk}`);
      failed = true;
    }
  }

  if (failed) die("Validering misslyckades — importen är INTE komplett. Kör --reset och försök igen.");
  console.log("\n✅ Validering klar — alla rader och spot-checks gröna.");
}

function pickRandom(arr, n) {
  const copy = arr.slice();
  const picked = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(idx, 1)[0]);
  }
  return picked;
}

async function main() {
  const mode = parseArgs(process.argv);
  console.log(`\nReceptboken → Supabase-migration (Fas 7B)  •  mode: ${mode}`);

  const data = await loadAllJson();
  const recipeIds = new Set(data.recipes.recipes.map((r) => r.id));

  const plan = {
    recipes: buildRecipesRows(data.recipes),
    weeklyPlan: buildWeeklyPlanRow(data.weeklyPlan),
    // plan_id sätts till "WEEKLY_PLAN_PLACEHOLDER" här, ersätts efter weekly_plans-insert
    mealDays: buildMealDayRows(data.weeklyPlan, data.customDays, "WEEKLY_PLAN_PLACEHOLDER", recipeIds),
    recipeHistory: buildRecipeHistoryRows(data.recipeHistory, recipeIds),
    planArchives: buildPlanArchiveRows(data.planArchive),
    shoppingList: buildShoppingListRow(data.shoppingList),
    // list_id sätts efter shopping_lists-insert
    shoppingItems: buildShoppingItemRows(data.shoppingList, "SHOPPING_LIST_PLACEHOLDER"),
    dispatchPreferences: buildDispatchPreferencesRow(data.dispatchPreferences),
  };

  printPlan(data, plan);

  if (mode === "--dry-run") {
    console.log("\n✅ DRY RUN — inga skrivningar utförda.\n");
    return;
  }

  const db = makeClient();

  if (mode === "--reset") {
    await resetTables(db);
    console.log("\n✅ Reset klar. Kör --commit för att importera på nytt.\n");
    return;
  }

  // --commit
  await checkPrereqs(db);
  await runImport(db, plan);
  await validate(db, data, plan);
  console.log("\n🎉 Fas 7B-import klar. Nästa: Fas 7C — frontend-omskrivning.\n");
}

main().catch((err) => {
  console.error("\n💥 Oväntat fel:", err);
  process.exit(1);
});
