import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";

// Kasserar en opåbörjad (icke-bekräftad) matsedel:
// - Deaktiverar weekly_plan och tar bort dess meal_days
// - Raderar recipe_history-poster för planens recept så de kan väljas igen
// - Rör inte shopping_lists (speglar senast bekräftade plan)
export default createSupabaseHandler(async (req, res) => {
  const householdId = await getHouseholdId();

  const { data: plans, error: plansErr } = await db
    .from("weekly_plans")
    .select("id, start_date, end_date, confirmed_at")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .limit(1);

  if (plansErr) throw new Error("Kunde inte kassera matsedeln — prova igen.");

  const plan = plans?.[0];
  if (!plan) return res.status(404).json({ error: "Ingen matsedel att kassera." });
  if (plan.confirmed_at) return res.status(400).json({ error: "Bekräftad matsedel kan inte kasseras." });

  // Hämta planens recept-id:n innan vi raderar
  const { data: mealDays, error: daysErr } = await db
    .from("meal_days")
    .select("recipe_id")
    .eq("plan_id", plan.id)
    .not("recipe_id", "is", null);

  if (daysErr) throw new Error("Kunde inte kassera matsedeln — prova igen.");

  const planRecipeIds = (mealDays || []).map((d) => d.recipe_id);

  // Deaktivera planen först, radera sedan dagarna (kvarlämnade dagar blir då
  // föräldralösa och visas inte av active-plan-laddaren)
  const { error: deactErr } = await db.from("weekly_plans").update({ is_active: false }).eq("id", plan.id);
  if (deactErr) throw new Error("Kunde inte kassera matsedeln — prova igen.");
  const { error: delErr } = await db.from("meal_days").delete().eq("plan_id", plan.id);
  if (delErr) throw new Error("Kunde inte kassera matsedeln — prova igen.");

  // Rensa recipe_history för planens recept så de kan väljas direkt igen
  if (planRecipeIds.length > 0) {
    const { error: histErr } = await db.from("recipe_history")
      .delete()
      .eq("household_id", householdId)
      .in("recipe_id", planRecipeIds);
    if (histErr) console.warn("discard-plan: kunde inte rensa recipe_history", histErr.message);
  }

  const emptyPlan = { generated: null, startDate: null, endDate: null, days: [] };
  return res.status(200).json({ ok: true, weeklyPlan: emptyPlan });
});
