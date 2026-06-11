import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";

// "Gör fri dag" (free) och "Ångra fri dag" (unfree).
//
// free:   Den valda dagen blir fri (inget recept). Allt från och med den dagen
//         skjuts en dag framåt och matsedeln förlängs med en dag i slutet — så
//         inget recept går förlorat ("skjut planen →").
// unfree: Inversen. Den fria luckan tas bort, allt dras bakåt och sista dagen
//         försvinner — matsedeln krymper en dag ("skjut ihop matsedeln").
//
// Receptmängden är oförändrad i båda fallen, så inköpslistan rörs inte (det
// bevarar bockningar). Frontend återanvänder befintlig shop-summering.

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function toWeeklyPlan(plan, orderedRows) {
  return {
    startDate:   orderedRows[0]?.date ?? plan.start_date,
    endDate:     orderedRows[orderedRows.length - 1]?.date ?? plan.end_date,
    confirmedAt: plan.confirmed_at || null,
    days: orderedRows.map((d) => ({
      date:          d.date,
      recipe:        d.recipe_title_snapshot || null,
      recipeId:      d.recipe_id ?? null,
      saving:        d.saving ?? null,
      savingMatches: d.saving_matches ?? null,
      blocked:       d.blocked === true,
    })),
  };
}

export default createSupabaseHandler(async (req, res) => {
  const { date, action } = req.body || {};
  if (!date) return res.status(400).json({ error: "date saknas" });
  if (!["free", "unfree"].includes(action)) {
    return res.status(400).json({ error: "action måste vara 'free' eller 'unfree'" });
  }

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
    .order("date");
  if (!rows?.length) return res.status(404).json({ error: "Inga dagar i planen." });

  const dayIdx = rows.findIndex((d) => d.date === date);
  if (dayIdx === -1) return res.status(404).json({ error: "Dagen finns inte i planen." });

  // Innehåll (recept/blockering) frikopplat från datum, så det kan skiftas
  const content = rows.map((r) => ({
    recipe_id:             r.recipe_id,
    recipe_title_snapshot: r.recipe_title_snapshot,
    saving:                r.saving,
    saving_matches:        r.saving_matches,
    blocked:               r.blocked === true,
  }));
  const dates = rows.map((r) => r.date);

  if (action === "free") {
    if (content[dayIdx].blocked) {
      return res.status(400).json({ error: "Dagen är redan fri." });
    }

    const newDate = addDays(dates[dates.length - 1], 1);

    // Krock: finns redan en rad (t.ex. egen planering) på den nya dagen?
    const { data: clash } = await db
      .from("meal_days")
      .select("date")
      .eq("household_id", householdId)
      .eq("date", newDate)
      .maybeSingle();
    if (clash) {
      return res.status(409).json({ error: "Kan inte förlänga matsedeln — nästa dag är redan inplanerad." });
    }

    // Skjut in en fri lucka vid dayIdx; sista innehållet hamnar på nya dagen
    content.splice(dayIdx, 0, {
      recipe_id: null, recipe_title_snapshot: null,
      saving: null, saving_matches: null, blocked: true,
    });
    const newDates = [...dates, newDate];

    const writes = [];
    for (let i = dayIdx; i < dates.length; i++) {
      writes.push(
        db.from("meal_days").update({
          recipe_id:             content[i].recipe_id,
          recipe_title_snapshot: content[i].recipe_title_snapshot,
          saving:                content[i].saving,
          saving_matches:        content[i].saving_matches,
          blocked:               content[i].blocked,
        }).eq("plan_id", plan.id).eq("date", dates[i])
      );
    }
    const tail = content[content.length - 1];
    writes.push(
      db.from("meal_days").insert({
        household_id: householdId,
        plan_id: plan.id,
        date: newDate,
        recipe_id:             tail.recipe_id,
        recipe_title_snapshot: tail.recipe_title_snapshot,
        saving:                tail.saving,
        saving_matches:        tail.saving_matches,
        blocked:               tail.blocked,
        locked: false,
      })
    );
    writes.push(db.from("weekly_plans").update({ end_date: newDate }).eq("id", plan.id));
    await Promise.all(writes);

    const respRows = newDates.map((dt, i) => ({ date: dt, ...content[i] }));
    return res.status(200).json({ ok: true, weeklyPlan: toWeeklyPlan(plan, respRows) });
  }

  // ── unfree ──
  if (!content[dayIdx].blocked) {
    return res.status(400).json({ error: "Dagen är inte en fri dag." });
  }
  if (rows.length <= 1) {
    return res.status(400).json({ error: "Kan inte ångra — matsedeln skulle bli tom." });
  }

  // Ta bort den fria luckan; allt dras bakåt och sista dagen försvinner
  content.splice(dayIdx, 1);
  const removedDate = dates[dates.length - 1];
  const newDates = dates.slice(0, dates.length - 1);
  const newEnd = newDates[newDates.length - 1];

  const writes = [];
  for (let i = dayIdx; i < newDates.length; i++) {
    writes.push(
      db.from("meal_days").update({
        recipe_id:             content[i].recipe_id,
        recipe_title_snapshot: content[i].recipe_title_snapshot,
        saving:                content[i].saving,
        saving_matches:        content[i].saving_matches,
        blocked:               content[i].blocked,
      }).eq("plan_id", plan.id).eq("date", newDates[i])
    );
  }
  writes.push(
    db.from("meal_days").delete().eq("plan_id", plan.id).eq("date", removedDate)
  );
  writes.push(db.from("weekly_plans").update({ end_date: newEnd }).eq("id", plan.id));
  await Promise.all(writes);

  const respRows = newDates.map((dt, i) => ({ date: dt, ...content[i] }));
  return res.status(200).json({ ok: true, weeklyPlan: toWeeklyPlan(plan, respRows) });
});
