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
    .select("date, recipe_id, recipe_title_snapshot, saving, saving_matches, blocked, locked")
    .eq("plan_id", plan.id)
    .in("date", [date1, date2]);

  const d1 = rows?.find((r) => r.date === date1);
  const d2 = rows?.find((r) => r.date === date2);

  if (!d1 && !d2) return res.status(404).json({ error: "Ingen av dagarna finns i planen." });
  if (d1?.blocked || d2?.blocked) return res.status(400).json({ error: "Blockerade dagar kan inte bytas." });

  if (d1 && d2) {
    // Båda dagarna finns → klassiskt byte av innehåll
    await Promise.all([
      db.from("meal_days").update({
        recipe_id:             d2.recipe_id,
        recipe_title_snapshot: d2.recipe_title_snapshot,
        saving:                d2.saving,
        saving_matches:        d2.saving_matches,
      }).eq("plan_id", plan.id).eq("date", d1.date),
      db.from("meal_days").update({
        recipe_id:             d1.recipe_id,
        recipe_title_snapshot: d1.recipe_title_snapshot,
        saving:                d1.saving,
        saving_matches:        d1.saving_matches,
      }).eq("plan_id", plan.id).eq("date", d2.date),
    ]);
  } else {
    // En av dagarna är oplanerad → flytta receptet dit; källdagen blir tom.
    // Måldagen får inte vara upptagen av något annat (t.ex. egen planering).
    const src = d1 || d2;
    const emptyDate = d1 ? date2 : date1;
    const { data: clash } = await db
      .from("meal_days")
      .select("date")
      .eq("household_id", householdId)
      .eq("date", emptyDate)
      .maybeSingle();
    if (clash) {
      return res.status(409).json({ error: "Dagen är redan upptagen — välj en annan dag." });
    }
    await db.from("meal_days").insert({
      household_id: householdId,
      plan_id: plan.id,
      date: emptyDate,
      recipe_id:             src.recipe_id,
      recipe_title_snapshot: src.recipe_title_snapshot,
      saving:                src.saving,
      saving_matches:        src.saving_matches,
      blocked: false,
      locked: false,
    });
    await db.from("meal_days").delete().eq("plan_id", plan.id).eq("date", src.date);
  }

  // Bygg svarsplan från uppdaterade rader. Planens gränser kan ha ändrats
  // (flytt till tom dag utanför spannet) → räkna om från raderna och persistera.
  const { data: allRows } = await db
    .from("meal_days")
    .select("date, recipe_id, recipe_title_snapshot, saving, saving_matches, blocked")
    .eq("plan_id", plan.id)
    .order("date");

  const newStart = allRows?.[0]?.date ?? plan.start_date;
  const newEnd   = allRows?.[allRows.length - 1]?.date ?? plan.end_date;
  if (newStart !== plan.start_date || newEnd !== plan.end_date) {
    await db.from("weekly_plans")
      .update({ start_date: newStart, end_date: newEnd })
      .eq("id", plan.id);
  }

  const weeklyPlan = {
    startDate:   newStart,
    endDate:     newEnd,
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
