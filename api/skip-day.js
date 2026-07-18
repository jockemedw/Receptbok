import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";
import { planAfterFree, planAfterUnfree, changedRows, contentOf } from "./_shared/day-ops.js";

// "Gör fri dag" (free) och "Ångra fri dag" (unfree).
//
// free:   Den valda dagen blir fri (inget recept). Allt från och med den dagen
//         skjuts en dag framåt och matsedeln förlängs med en dag i slutet — så
//         inget recept går förlorat ("skjut planen →").
// unfree: Inversen. Den fria luckan tas bort, allt dras bakåt och sista dagen
//         försvinner — matsedeln krymper en dag ("skjut ihop matsedeln").
//
// Rotationslogiken bor i _shared/day-ops.js (enhetstestad, verifierar att
// receptmängden är oförändrad innan något skrivs). Skrivordningen är vald så
// att ett avbrott mitt i aldrig tappar ett recept: vid free skapas den nya
// svansdagen FÖRE rotationen (värsta fallet = en tillfällig dubblett, inget
// borttappat). Själva rotationen är EN bulk-upsert (en SQL-sats → atomär).
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

function upsertPayload(householdId, planId, rows) {
  return rows.map((r) => ({
    household_id: householdId,
    plan_id:      planId,
    date:         r.date,
    blocked:      r.blocked === true,
    ...contentOf(r),
  }));
}

export default createSupabaseHandler(async (req, res) => {
  const { date, action } = req.body || {};
  if (!date) return res.status(400).json({ error: "date saknas" });
  if (!["free", "unfree"].includes(action)) {
    return res.status(400).json({ error: "action måste vara 'free' eller 'unfree'" });
  }

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
    .select("date, recipe_id, recipe_title_snapshot, saving, saving_matches, blocked, locked, shopped_at, shopping_list_id")
    .eq("plan_id", plan.id)
    .order("date");
  if (rowsErr) throw new Error("Kunde inte läsa matsedeln — prova igen.");
  if (!rows?.length) return res.status(404).json({ error: "Inga dagar i planen." });

  if (action === "free") {
    const newDate = addDays(rows[rows.length - 1].date, 1);

    const result = planAfterFree(rows, date, newDate);
    if (result.error === "not_found")    return res.status(404).json({ error: "Dagen finns inte i planen." });
    if (result.error === "already_free") return res.status(400).json({ error: "Dagen är redan fri." });
    if (result.error) {
      console.error("skip-day free: invariant bruten — avbryter utan att skriva", { date });
      return res.status(500).json({ error: "Ändringen avbröts som säkerhetsåtgärd — ingenting har ändrats. Prova igen." });
    }

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

    // 1) Skapa svansdagen först (avbrott här = inget förlorat, planen orörd)
    const tail = result.next[result.next.length - 1];
    const { error: insErr } = await db.from("meal_days").insert({
      household_id: householdId,
      plan_id:      plan.id,
      date:         newDate,
      blocked:      tail.blocked === true,
      locked:       false,
      ...contentOf(tail),
    });
    if (insErr) {
      console.error("skip-day free: insert misslyckades", insErr);
      throw new Error("Kunde inte spara ändringen — prova igen.");
    }

    // 2) Rotationen i EN bulk-upsert
    const updates = upsertPayload(householdId, plan.id, changedRows(rows, result.next.slice(0, -1)));
    if (updates.length) {
      const { error: upErr } = await db
        .from("meal_days")
        .upsert(updates, { onConflict: "household_id,date" });
      if (upErr) {
        console.error("skip-day free: upsert misslyckades", upErr);
        throw new Error("Kunde inte spara ändringen — prova igen.");
      }
    }

    // 3) Förläng planens slutdatum
    const { error: boundsErr } = await db
      .from("weekly_plans").update({ end_date: newDate }).eq("id", plan.id);
    if (boundsErr) console.error("skip-day free: kunde inte uppdatera end_date", boundsErr);

    return res.status(200).json({ ok: true, weeklyPlan: toWeeklyPlan(plan, result.next) });
  }

  // ── unfree ──
  const result = planAfterUnfree(rows, date);
  if (result.error === "not_found")   return res.status(404).json({ error: "Dagen finns inte i planen." });
  if (result.error === "not_free")    return res.status(400).json({ error: "Dagen är inte en fri dag." });
  if (result.error === "would_empty") return res.status(400).json({ error: "Kan inte ångra — matsedeln skulle bli tom." });
  if (result.error) {
    console.error("skip-day unfree: invariant bruten — avbryter utan att skriva", { date });
    return res.status(500).json({ error: "Ändringen avbröts som säkerhetsåtgärd — ingenting har ändrats. Prova igen." });
  }

  // 1) Rotationen i EN bulk-upsert (avbrott efter = en tom dubblettdag kvar,
  //    inget recept förlorat — borttagningen i steg 2 kan göras om)
  const updates = upsertPayload(householdId, plan.id, changedRows(rows, result.next));
  if (updates.length) {
    const { error: upErr } = await db
      .from("meal_days")
      .upsert(updates, { onConflict: "household_id,date" });
    if (upErr) {
      console.error("skip-day unfree: upsert misslyckades", upErr);
      throw new Error("Kunde inte spara ändringen — prova igen.");
    }
  }

  // 2) Ta bort den övertaliga sista dagen
  const { error: delErr } = await db
    .from("meal_days").delete().eq("plan_id", plan.id).eq("date", result.removedDate);
  if (delErr) {
    console.error("skip-day unfree: delete misslyckades", delErr);
    throw new Error("Kunde inte spara ändringen — prova igen.");
  }

  // 3) Krymp planens slutdatum
  const newEnd = result.next[result.next.length - 1]?.date ?? plan.end_date;
  const { error: boundsErr } = await db
    .from("weekly_plans").update({ end_date: newEnd }).eq("id", plan.id);
  if (boundsErr) console.error("skip-day unfree: kunde inte uppdatera end_date", boundsErr);

  return res.status(200).json({ ok: true, weeklyPlan: toWeeklyPlan(plan, result.next) });
});
