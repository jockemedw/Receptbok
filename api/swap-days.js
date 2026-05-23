import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";

export default createSupabaseHandler(async (req, res) => {
  const { date1, date2 } = req.body || {};
  if (!date1 || !date2) return res.status(400).json({ error: "date1 och date2 krävs" });
  if (date1 === date2) return res.status(400).json({ error: "Välj två olika dagar" });

  const householdId = await getHouseholdId();

  const { data: plans } = await db
    .from("weekly_plans")
    .select("id, start_date, end_date, confirmed_at")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .limit(1);
  const plan = plans?.[0];
  if (!plan) return res.status(404).json({ error: "Ingen aktiv plan hittades." });

  const { data: rows } = await db
    .from("meal_days")
    .select("id, date, recipe_id, recipe_title_snapshot, saving, saving_matches, blocked, locked")
    .eq("plan_id", plan.id)
    .in("date", [date1, date2]);

  const d1 = rows?.find((r) => r.date === date1);
  const d2 = rows?.find((r) => r.date === date2);

  if (!d1 || !d2) return res.status(404).json({ error: "En eller båda dagarna finns inte i planen." });
  if (d1.blocked || d2.blocked) return res.status(400).json({ error: "Blockerade dagar kan inte bytas." });

  // Byt recipe_id, title, saving och saving_matches
  await Promise.all([
    db.from("meal_days").update({
      recipe_id:             d2.recipe_id,
      recipe_title_snapshot: d2.recipe_title_snapshot,
      saving:                d2.saving,
      saving_matches:        d2.saving_matches,
    }).eq("id", d1.id),
    db.from("meal_days").update({
      recipe_id:             d1.recipe_id,
      recipe_title_snapshot: d1.recipe_title_snapshot,
      saving:                d1.saving,
      saving_matches:        d1.saving_matches,
    }).eq("id", d2.id),
  ]);

  // Bygg svarsplan från uppdaterade rader
  const { data: allRows } = await db
    .from("meal_days")
    .select("date, recipe_id, recipe_title_snapshot, saving, saving_matches, blocked")
    .eq("plan_id", plan.id)
    .order("date");

  const weeklyPlan = {
    startDate:   plan.start_date,
    endDate:     plan.end_date,
    confirmedAt: plan.confirmed_at || null,
    days: (allRows || []).map((d) => ({
      date:          d.date,
      recipe:        d.recipe_title_snapshot || null,
      recipeId:      d.recipe_id ?? null,
      saving:        d.saving ?? null,
      savingMatches: d.saving_matches ?? null,
      blocked:       d.blocked === true,
    })),
  };

  return res.status(200).json({ ok: true, weeklyPlan });
});
