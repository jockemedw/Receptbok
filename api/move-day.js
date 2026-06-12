import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";

// "Flytta dag" — lyfter ut en dags recept och klämmer in det före en annan dag.
//
// Datumen ligger fast; det är INNEHÅLLET (recept, besparing) som roteras mellan
// raderna: dagen före målpositionen och allt efter skjuts ett steg framåt, och
// luckan där receptet stod sluts. Fria dagar (blocked) är PINNADE vid sina
// datum — de är valda för att familjen är borta just de kvällarna — så
// rotationen sker bara över icke-fria rader.
//
// Receptmängden är oförändrad → inköpslistan rörs inte (bockningar bevaras).
//
// Body: { date: "<källdag>", before: "<dag att klämmas in före>" | null = sist }

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
  const { date, before = null } = req.body || {};
  if (!date) return res.status(400).json({ error: "date saknas" });
  if (before === date) return res.status(200).json({ ok: true, noop: true });

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
    .select("date, recipe_id, recipe_title_snapshot, saving, saving_matches, blocked")
    .eq("plan_id", plan.id)
    .order("date");
  if (!rows?.length) return res.status(404).json({ error: "Inga dagar i planen." });

  const movable = rows.filter((r) => r.blocked !== true);
  const srcIdx = movable.findIndex((r) => r.date === date);
  if (srcIdx === -1) {
    return res.status(400).json({ error: "Dagen kan inte flyttas." });
  }
  let tgtIdx = movable.length; // before = null → kläm in sist
  if (before) {
    tgtIdx = movable.findIndex((r) => r.date === before);
    if (tgtIdx === -1) {
      return res.status(400).json({ error: "Måldagen finns inte i planen." });
    }
  }

  // Rotera innehållet: lyft ur källan, kläm in på målpositionen
  const contents = movable.map((r) => ({
    recipe_id:             r.recipe_id,
    recipe_title_snapshot: r.recipe_title_snapshot,
    saving:                r.saving,
    saving_matches:        r.saving_matches,
  }));
  const [moved] = contents.splice(srcIdx, 1);
  const insertIdx = tgtIdx - (srcIdx < tgtIdx ? 1 : 0);

  if (insertIdx !== srcIdx) {
    contents.splice(insertIdx, 0, moved);
    // Bara raderna i det roterade spannet ändras
    const lo = Math.min(srcIdx, insertIdx);
    const hi = Math.max(srcIdx, insertIdx);
    const writes = [];
    for (let i = lo; i <= hi; i++) {
      writes.push(
        db.from("meal_days").update(contents[i])
          .eq("plan_id", plan.id).eq("date", movable[i].date)
      );
    }
    await Promise.all(writes);
  } else {
    contents.splice(insertIdx, 0, moved); // no-op-flytt → oförändrat innehåll
  }

  const byDate = new Map(movable.map((r, i) => [r.date, contents[i]]));
  const respRows = rows.map((r) =>
    r.blocked === true ? r : { date: r.date, blocked: false, ...byDate.get(r.date) }
  );
  return res.status(200).json({ ok: true, weeklyPlan: toWeeklyPlan(plan, respRows) });
});
