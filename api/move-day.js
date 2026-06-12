import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";
import { planAfterMove, changedRows, contentOf } from "./_shared/day-ops.js";

// "Flytta dag" — lyfter ut en dags recept och klämmer in det före en annan dag.
//
// Datumen ligger fast; det är INNEHÅLLET (recept, besparing) som roteras mellan
// raderna. Fria dagar (blocked) är PINNADE vid sina datum — de är valda för att
// familjen är borta just de kvällarna. Rotationslogiken bor i _shared/day-ops.js
// (enhetstestad) och verifierar att receptmängden är oförändrad innan något
// skrivs. Skrivningen sker som EN bulk-upsert (en SQL-sats → atomär).
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

  const householdId = await getHouseholdId();

  const { data: plans, error: planErr } = await db
    .from("weekly_plans")
    .select("id, start_date, end_date, confirmed_at")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .limit(1);
  if (planErr) throw new Error("Kunde inte läsa matsedeln — prova igen.");
  const plan = plans?.[0];
  if (!plan) return res.status(404).json({ error: "Ingen aktiv plan hittades." });

  const { data: rows, error: rowsErr } = await db
    .from("meal_days")
    .select("date, recipe_id, recipe_title_snapshot, saving, saving_matches, blocked")
    .eq("plan_id", plan.id)
    .order("date");
  if (rowsErr) throw new Error("Kunde inte läsa matsedeln — prova igen.");
  if (!rows?.length) return res.status(404).json({ error: "Inga dagar i planen." });

  const result = planAfterMove(rows, date, before);
  if (result.error === "src")    return res.status(400).json({ error: "Dagen kan inte flyttas." });
  if (result.error === "target") return res.status(400).json({ error: "Måldagen finns inte i planen." });
  if (result.error === "invariant") {
    console.error("move-day: invariant bruten — avbryter utan att skriva", { date, before });
    return res.status(500).json({ error: "Flytten avbröts som säkerhetsåtgärd — ingenting har ändrats. Prova igen." });
  }
  if (result.noop) {
    return res.status(200).json({ ok: true, noop: true, weeklyPlan: toWeeklyPlan(plan, rows) });
  }

  // Bara de roterade raderna skrivs — i EN bulk-upsert mot PK (household_id, date)
  const payload = changedRows(rows, result.next).map((r) => ({
    household_id: householdId,
    plan_id:      plan.id,
    date:         r.date,
    blocked:      false,
    ...contentOf(r),
  }));
  if (payload.length) {
    const { error: writeErr } = await db
      .from("meal_days")
      .upsert(payload, { onConflict: "household_id,date" });
    if (writeErr) {
      console.error("move-day: upsert misslyckades", writeErr);
      throw new Error("Kunde inte spara flytten — prova igen.");
    }
  }

  return res.status(200).json({ ok: true, weeklyPlan: toWeeklyPlan(plan, result.next) });
});
