import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";

// "Bekräfta matsedeln" — låser förslaget (confirmed_at) så snabbåtgärderna på
// dagkorten försvinner och en ny generering varnar innan den ersätter planen.
//
// Session 134: endpointen bygger INTE längre inköpslistan. Ingredienserna går
// till listan i ett helt manuellt steg där familjen väljer vilka dagar som ska
// handlas (/api/shopping action:set_days) — tidigare hamnade hela planens
// vecka på listan direkt vid bekräftelsen, även när familjen bara tänkte
// handla för ett par dagar.

export default createSupabaseHandler(async (req, res) => {
  const householdId = await getHouseholdId();

  const { data: plans, error: plansErr } = await db
    .from("weekly_plans")
    .select("id, start_date, end_date, confirmed_at")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .limit(1);
  if (plansErr) throw plansErr;

  const plan = plans?.[0];
  if (!plan) return res.status(400).json({ error: "Ingen veckoplan att bekräfta." });
  if (plan.confirmed_at) return res.status(400).json({ error: "Planen är redan bekräftad." });

  const { data: mealDays, error: daysErr } = await db
    .from("meal_days")
    .select("date, recipe_id")
    .eq("plan_id", plan.id)
    .not("recipe_id", "is", null);
  if (daysErr) throw daysErr;
  if (!mealDays?.length) return res.status(400).json({ error: "Planen har inga recept." });

  const confirmedAt = new Date().toISOString();
  const { error: confErr } = await db
    .from("weekly_plans")
    .update({ confirmed_at: confirmedAt })
    .eq("id", plan.id);
  if (confErr) throw new Error("Kunde inte bekräfta matsedeln — prova igen.");

  const confirmedPlan = {
    startDate: plan.start_date,
    endDate: plan.end_date,
    confirmedAt,
    days: (mealDays || []).map((d) => ({ recipeId: d.recipe_id })),
  };

  return res.status(200).json({ ok: true, weeklyPlan: confirmedPlan });
});
