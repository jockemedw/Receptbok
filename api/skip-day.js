import { buildShoppingList } from "./_shared/shopping-builder.js";
import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";

export default createSupabaseHandler(async (req, res) => {
  const { date, action } = req.body || {};
  if (!date) return res.status(400).json({ error: "date saknas" });
  if (!["skip", "block", "unblock"].includes(action)) {
    return res.status(400).json({ error: "action måste vara 'skip', 'block' eller 'unblock'" });
  }

  const householdId = await getHouseholdId();

  // Hämta aktiv plan
  const { data: plans } = await db
    .from("weekly_plans")
    .select("id, start_date, end_date, confirmed_at")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .limit(1);
  const plan = plans?.[0];
  if (!plan) return res.status(404).json({ error: "Ingen aktiv plan hittades." });

  // Hämta alla meal_days för planen sorterade på datum
  const { data: rows } = await db
    .from("meal_days")
    .select("id, date, recipe_id, recipe_title_snapshot, saving, saving_matches, blocked, locked")
    .eq("plan_id", plan.id)
    .order("date");

  if (!rows?.length) return res.status(404).json({ error: "Inga dagar i planen." });

  const dayIdx = rows.findIndex((d) => d.date === date);
  if (dayIdx === -1) return res.status(404).json({ error: "Dagen finns inte i planen." });

  const days = rows.map((r) => ({ ...r })); // mutable kopia

  if (action === "skip") {
    for (let i = days.length - 1; i > dayIdx; i--) {
      days[i].recipe_id             = days[i - 1].recipe_id;
      days[i].recipe_title_snapshot = days[i - 1].recipe_title_snapshot;
      days[i].saving                = days[i - 1].saving ?? null;
      days[i].saving_matches        = days[i - 1].saving_matches ?? null;
      days[i].blocked               = days[i - 1].blocked ?? false;
    }
    days[dayIdx].recipe_id             = null;
    days[dayIdx].recipe_title_snapshot = null;
    days[dayIdx].saving                = null;
    days[dayIdx].saving_matches        = null;
    days[dayIdx].blocked               = true;
  } else if (action === "unblock") {
    if (!days[dayIdx].blocked) {
      return res.status(400).json({ error: "Dagen är inte blockerad." });
    }
    for (let i = dayIdx; i < days.length - 1; i++) {
      const next = days[i + 1];
      days[i].recipe_id             = next.recipe_id;
      days[i].recipe_title_snapshot = next.recipe_title_snapshot;
      days[i].saving                = next.saving ?? null;
      days[i].saving_matches        = next.saving_matches ?? null;
      days[i].blocked               = next.blocked ?? false;
    }
    const last = days[days.length - 1];
    last.recipe_id             = null;
    last.recipe_title_snapshot = null;
    last.saving                = null;
    last.saving_matches        = null;
    last.blocked               = false;
  } else {
    // block
    days[dayIdx].recipe_id             = null;
    days[dayIdx].recipe_title_snapshot = null;
    days[dayIdx].blocked               = true;
  }

  // Batch-uppdatera alla ändrade dagar
  await Promise.all(
    days.map((d) =>
      db.from("meal_days").update({
        recipe_id:             d.recipe_id,
        recipe_title_snapshot: d.recipe_title_snapshot,
        saving:                d.saving,
        saving_matches:        d.saving_matches,
        blocked:               d.blocked,
      }).eq("id", d.id)
    )
  );

  // Bygg frontendformat för svar
  const weeklyPlan = {
    startDate:   plan.start_date,
    endDate:     plan.end_date,
    confirmedAt: plan.confirmed_at || null,
    days: days.map((d) => ({
      date:          d.date,
      recipe:        d.recipe_title_snapshot || null,
      recipeId:      d.recipe_id ?? null,
      saving:        d.saving ?? null,
      savingMatches: d.saving_matches ?? null,
      blocked:       d.blocked === true,
    })),
  };

  // Bygg om inköpslistan om planen är bekräftad
  if (plan.confirmed_at) {
    const selectedIds = days.map((d) => d.recipe_id).filter(Boolean);

    const { data: recipes } = await db
      .from("recipes")
      .select("id, title, ingredients, tags, protein, tested")
      .eq("household_id", householdId);
    const shoppingCategories = buildShoppingList(selectedIds, recipes || []);

    const { data: existingLists } = await db
      .from("shopping_lists")
      .select("id, recipe_items_moved_at")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .limit(1);

    let manualItems = [];
    let checkedItems = {};
    let recipeItemsMovedAt = null;
    if (existingLists?.length) {
      recipeItemsMovedAt = existingLists[0].recipe_items_moved_at || null;
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
    return res.status(200).json({ ok: true, weeklyPlan, shoppingList });
  }

  return res.status(200).json({ ok: true, weeklyPlan });
});
