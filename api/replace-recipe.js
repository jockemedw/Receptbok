import { buildShoppingList } from "./_shared/shopping-builder.js";
import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";
import { shuffle } from "./_shared/history.js";

export default createSupabaseHandler(async (req, res) => {
  const { date, currentRecipeId, weekRecipeIds = [], newRecipeId, saving, savingMatches } = req.body || {};
  if (!date) return res.status(400).json({ error: "date saknas" });

  const householdId = await getHouseholdId();

  const [{ data: plans }, { data: recipes }] = await Promise.all([
    db.from("weekly_plans").select("id, start_date, end_date, confirmed_at")
      .eq("household_id", householdId).eq("is_active", true).limit(1),
    db.from("recipes").select("id, title, tags, protein, tested, ingredients")
      .eq("household_id", householdId),
  ]);

  const plan = plans?.[0];
  if (!plan) return res.status(404).json({ error: "Ingen aktiv plan hittades." });

  const { data: mealDayRow } = await db
    .from("meal_days")
    .select("blocked")
    .eq("household_id", householdId)
    .eq("plan_id", plan.id)
    .eq("date", date)
    .maybeSingle();

  if (!mealDayRow) return res.status(404).json({ error: "Dagen hittades inte i veckoplanen." });
  if (mealDayRow.blocked) {
    return res.status(400).json({ error: "Blockerade dagar kan inte bytas — avblockera dagen först." });
  }

  const allRecipes = recipes || [];
  let picked;

  if (newRecipeId) {
    picked = allRecipes.find((r) => r.id === parseInt(newRecipeId, 10));
    if (!picked) return res.status(404).json({ error: "Receptet hittades inte." });
  } else {
    // Hämta historik för att undvika nyligen använda recept
    const { data: histRows } = await db
      .from("recipe_history")
      .select("recipe_id, used_on")
      .eq("household_id", householdId);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const recentIds = new Set(
      (histRows || [])
        .filter((r) => r.used_on >= cutoffStr)
        .map((r) => r.recipe_id)
    );

    const weekSet = new Set(weekRecipeIds.filter((id) => id !== currentRecipeId));
    const dow = new Date(date + "T12:00:00").getDay();
    const isWeekend = dow === 0 || dow === 6;
    const requiredTag = isWeekend ? "helg60" : "vardag30";

    const { data: planDays } = await db
      .from("meal_days")
      .select("recipe_id")
      .eq("plan_id", plan.id)
      .not("recipe_id", "is", null);

    const proteinCount = {};
    for (const d of (planDays || [])) {
      if (d.recipe_id !== currentRecipeId) {
        const r = allRecipes.find((x) => x.id === d.recipe_id);
        if (r) proteinCount[r.protein] = (proteinCount[r.protein] || 0) + 1;
      }
    }
    const MAX_PROTEIN = 2;

    const base = allRecipes.filter((r) =>
      r.id !== currentRecipeId && !weekSet.has(r.id) && !recentIds.has(r.id)
    );

    let pool = shuffle(base.filter((r) =>
      (r.tags || []).includes(requiredTag) && (proteinCount[r.protein] || 0) < MAX_PROTEIN
    ));
    if (!pool.length) pool = shuffle(base.filter((r) => (r.tags || []).includes(requiredTag)));
    if (!pool.length) pool = shuffle(base.filter((r) => (proteinCount[r.protein] || 0) < MAX_PROTEIN));
    if (!pool.length) pool = shuffle(base);
    if (!pool.length) {
      const usedOn = {};
      (histRows || []).forEach((r) => { usedOn[r.recipe_id] = r.used_on; });
      pool = allRecipes
        .filter((r) => r.id !== currentRecipeId && !weekSet.has(r.id))
        .sort((a, b) => (usedOn[a.id] || "0000-00-00") < (usedOn[b.id] || "0000-00-00") ? -1 : 1);
    }
    if (!pool.length) return res.status(409).json({ error: "Inga tillgängliga recept att byta till." });
    picked = pool[0];
  }

  const today = new Date().toISOString().slice(0, 10);

  // Vid "Byt in" från Veckans fynd skickas receptets besparing med så den
  // behålls; vid vanligt slumpbyte saknas den → nollställs (priserna gäller
  // bara det specifika receptet).
  const keepSaving = newRecipeId && typeof saving === "number" ? saving : null;
  const keepMatches = newRecipeId && Array.isArray(savingMatches) ? savingMatches : null;

  // Uppdatera meal_days + recipe_history parallellt
  await Promise.all([
    db.from("meal_days").update({
      recipe_id: picked.id,
      recipe_title_snapshot: picked.title,
      saving: keepSaving,
      saving_matches: keepMatches,
    }).eq("household_id", householdId).eq("date", date),
    db.from("recipe_history").upsert(
      { household_id: householdId, recipe_id: picked.id, used_on: today },
      { onConflict: "household_id,recipe_id" }
    ),
  ]);

  // Bygg om inköpslistan om planen är bekräftad
  if (plan.confirmed_at) {
    // allMealDays hämtas efter update → innehåller redan picked.id på rätt dag
    const { data: allMealDays } = await db
      .from("meal_days")
      .select("recipe_id")
      .eq("plan_id", plan.id)
      .not("recipe_id", "is", null);

    const selectedIds = (allMealDays || []).map((d) => d.recipe_id);

    const shoppingCategories = buildShoppingList(selectedIds.filter(Boolean), allRecipes);

    const { data: existingLists } = await db
      .from("shopping_lists").select("id, recipe_items_moved_at")
      .eq("household_id", householdId).eq("is_active", true).limit(1);

    let manualItems = [];
    let checkedItems = {};
    let recipeItemsMovedAt = null;
    if (existingLists?.length) {
      recipeItemsMovedAt = existingLists[0].recipe_items_moved_at || null;
      const { data: existingItems } = await db
        .from("shopping_items").select("name, checked")
        .eq("list_id", existingLists[0].id).eq("source", "manual");
      manualItems = (existingItems || []).map((i) => i.name);
      (existingItems || []).filter((i) => i.checked).forEach((i) => {
        checkedItems[`manual::${i.name}`] = true;
      });
    }

    await db.from("shopping_lists").update({ is_active: false })
      .eq("household_id", householdId).eq("is_active", true);

    const { data: newList, error: listErr } = await db
      .from("shopping_lists")
      .insert({
        household_id: householdId,
        start_date: plan.start_date,
        end_date: plan.end_date,
        generated_at: today,
        recipe_items_moved_at: recipeItemsMovedAt,
        is_active: true,
      })
      .select()
      .single();
    if (listErr) throw listErr;

    const itemRows = [];
    for (const [category, items] of Object.entries(shoppingCategories || {})) {
      (items || []).forEach((name, pos) => {
        itemRows.push({ list_id: newList.id, category, name, source: "recipe", checked: false, position: pos });
      });
    }
    manualItems.forEach((name, idx) => {
      itemRows.push({
        list_id: newList.id, category: "Övrigt", name, source: "manual",
        checked: !!(checkedItems[`manual::${name}`]), position: idx,
      });
    });
    if (itemRows.length > 0) await db.from("shopping_items").insert(itemRows);

    const shoppingList = {
      generated: today, startDate: plan.start_date, endDate: plan.end_date,
      recipeItems: shoppingCategories, recipeItemsMovedAt,
      manualItems, checkedItems,
    };
    return res.status(200).json({ recipe: picked.title, recipeId: picked.id, saving: keepSaving, savingMatches: keepMatches, shoppingList });
  }

  return res.status(200).json({ recipe: picked.title, recipeId: picked.id, saving: keepSaving, savingMatches: keepMatches });
});
