import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";

// Kasserar en opåbörjad (icke-bekräftad) matsedel:
// - Deaktiverar weekly_plan och tar bort dess meal_days
// - Raderar recipe_history-poster för planens recept så de kan väljas igen
// - Rör inte shopping_lists (speglar senast bekräftade plan)
export default createSupabaseHandler(async (req, res) => {
  const householdId = await getHouseholdId();

  const { data: plans } = await db
    .from("weekly_plans")
    .select("id, start_date, end_date, confirmed_at")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .limit(1);

  const plan = plans?.[0];
  if (!plan) return res.status(404).json({ error: "Ingen matsedel att kassera." });
  if (plan.confirmed_at) return res.status(400).json({ error: "Bekräftad matsedel kan inte kasseras." });

  // Hämta planens recept-id:n innan vi raderar
  const { data: mealDays } = await db
    .from("meal_days")
    .select("recipe_id")
    .eq("plan_id", plan.id)
    .not("recipe_id", "is", null);

  const planRecipeIds = (mealDays || []).map((d) => d.recipe_id);

  // Radera meal_days och deaktivera planen
  await db.from("meal_days").delete().eq("plan_id", plan.id);
  await db.from("weekly_plans").update({ is_active: false }).eq("id", plan.id);

  // Rensa recipe_history för planens recept så de kan väljas direkt igen
  if (planRecipeIds.length > 0) {
    await db.from("recipe_history")
      .delete()
      .eq("household_id", householdId)
      .in("recipe_id", planRecipeIds);
  }

  const emptyPlan = { generated: null, startDate: null, endDate: null, days: [] };
  return res.status(200).json({ ok: true, weeklyPlan: emptyPlan });
});
