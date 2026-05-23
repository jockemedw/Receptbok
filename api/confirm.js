import { buildShoppingList } from "./_shared/shopping-builder.js";
import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";

export default createSupabaseHandler(async (req, res) => {
  const householdId = await getHouseholdId();

  // Hämta aktiv plan + dess dagar
  const { data: plans } = await db
    .from("weekly_plans")
    .select("id, start_date, end_date, confirmed_at")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .limit(1);

  const plan = plans?.[0];
  if (!plan) return res.status(400).json({ error: "Ingen veckoplan att bekräfta." });
  if (plan.confirmed_at) return res.status(400).json({ error: "Planen är redan bekräftad." });

  const { data: mealDays } = await db
    .from("meal_days")
    .select("recipe_id")
    .eq("plan_id", plan.id)
    .not("recipe_id", "is", null);

  const selectedIds = (mealDays || []).map((d) => d.recipe_id);
  if (!selectedIds.length) return res.status(400).json({ error: "Planen har inga recept." });

  // Hämta recept för att bygga inköpslistan
  const { data: recipes } = await db
    .from("recipes")
    .select("id, title, ingredients, tags, protein, tested")
    .eq("household_id", householdId);

  const shoppingCategories = buildShoppingList(selectedIds, recipes || []);

  // Bevara manuella varor och bockningar från befintlig aktiv lista
  let manualItems = [];
  let checkedItems = {};
  const { data: existingLists } = await db
    .from("shopping_lists")
    .select("id")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .limit(1);
  if (existingLists?.length) {
    const { data: existingItems } = await db
      .from("shopping_items")
      .select("name, checked")
      .eq("list_id", existingLists[0].id)
      .eq("source", "manual");
    manualItems = (existingItems || []).map((i) => i.name);
    (existingItems || []).filter((i) => i.checked).forEach((i) => {
      checkedItems[`manual::${i.name}`] = true;
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Deaktivera befintliga listor, skapa ny
  await db.from("shopping_lists").update({ is_active: false })
    .eq("household_id", householdId).eq("is_active", true);

  const { data: newList, error: listErr } = await db
    .from("shopping_lists")
    .insert({
      household_id: householdId,
      start_date: plan.start_date,
      end_date: plan.end_date,
      generated_at: today,
      recipe_items_moved_at: null,
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
      list_id: newList.id,
      category: "Övrigt",
      name,
      source: "manual",
      checked: !!(checkedItems[`manual::${name}`]),
      position: idx,
    });
  });

  if (itemRows.length > 0) {
    const { error: itemsErr } = await db.from("shopping_items").insert(itemRows);
    if (itemsErr) throw itemsErr;
  }

  // Sätt confirmed_at på planen
  await db.from("weekly_plans").update({ confirmed_at: new Date().toISOString() }).eq("id", plan.id);

  const shoppingList = {
    generated: today,
    startDate: plan.start_date,
    endDate: plan.end_date,
    recipeItems: shoppingCategories,
    recipeItemsMovedAt: null,
    manualItems,
    checkedItems,
  };

  const confirmedPlan = {
    startDate: plan.start_date,
    endDate: plan.end_date,
    confirmedAt: new Date().toISOString(),
    days: (mealDays || []).map((d) => ({ recipeId: d.recipe_id })),
  };

  return res.status(200).json({ ok: true, weeklyPlan: confirmedPlan, shoppingList });
});
