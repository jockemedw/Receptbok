import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";
import { contentOf } from "./_shared/day-ops.js";

// "Byt dag" — byter innehåll mellan två dagar i aktiva planen.
//
// Båda dagarna i planen  → innehållet byts i EN bulk-upsert (atomär).
// Ena dagen oplanerad    → receptet flyttas dit genom att radens DATUM byts
//                          (en enda UPDATE → atomär, raden behåller lås m.m.);
//                          källdagen blir tom. Planens gränser räknas om.
//
// Receptmängden är oförändrad → inköpslistan rörs inte.

export default createSupabaseHandler(async (req, res) => {
  const { date1, date2 } = req.body || {};
  if (!date1 || !date2) return res.status(400).json({ error: "date1 och date2 krävs" });
  if (date1 === date2) return res.status(400).json({ error: "Välj två olika dagar" });

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
    .select("date, recipe_id, recipe_title_snapshot, saving, saving_matches, blocked, locked")
    .eq("plan_id", plan.id)
    .in("date", [date1, date2]);
  if (rowsErr) throw new Error("Kunde inte läsa matsedeln — prova igen.");

  const d1 = rows?.find((r) => r.date === date1);
  const d2 = rows?.find((r) => r.date === date2);

  if (!d1 && !d2) return res.status(404).json({ error: "Ingen av dagarna finns i planen." });
  if (d1?.blocked || d2?.blocked) return res.status(400).json({ error: "Blockerade dagar kan inte bytas." });

  if (d1 && d2) {
    // Båda dagarna finns → byt innehåll i EN bulk-upsert (en SQL-sats, atomär)
    const { error: writeErr } = await db.from("meal_days").upsert([
      { household_id: householdId, plan_id: plan.id, date: d1.date, blocked: false, ...contentOf(d2) },
      { household_id: householdId, plan_id: plan.id, date: d2.date, blocked: false, ...contentOf(d1) },
    ], { onConflict: "household_id,date" });
    if (writeErr) {
      console.error("swap-days: upsert misslyckades", writeErr);
      throw new Error("Kunde inte byta dagarna — prova igen.");
    }
  } else {
    // En av dagarna är oplanerad → flytta receptet dit genom att byta radens
    // datum (atomärt, raden behåller allt annat). Källdagen blir tom.
    const src = d1 || d2;
    const emptyDate = d1 ? date2 : date1;

    // Måldagen får inte vara upptagen av något annat (t.ex. egen planering)
    const { data: clash } = await db
      .from("meal_days")
      .select("date")
      .eq("household_id", householdId)
      .eq("date", emptyDate)
      .maybeSingle();
    if (clash) {
      return res.status(409).json({ error: "Dagen är redan upptagen — välj en annan dag." });
    }

    const { error: moveErr } = await db
      .from("meal_days")
      .update({ date: emptyDate })
      .eq("plan_id", plan.id)
      .eq("date", src.date);
    if (moveErr) {
      console.error("swap-days: datumbyte misslyckades", moveErr);
      throw new Error("Kunde inte flytta receptet — prova igen.");
    }
  }

  // Bygg svarsplan från uppdaterade rader. Planens gränser kan ha ändrats
  // (flytt till tom dag utanför spannet) → räkna om från raderna och persistera.
  const { data: allRows, error: reReadErr } = await db
    .from("meal_days")
    .select("date, recipe_id, recipe_title_snapshot, saving, saving_matches, blocked")
    .eq("plan_id", plan.id)
    .order("date");
  if (reReadErr) throw new Error("Bytet sparades, men matsedeln kunde inte läsas om — ladda om sidan.");

  const newStart = allRows?.[0]?.date ?? plan.start_date;
  const newEnd   = allRows?.[allRows.length - 1]?.date ?? plan.end_date;
  if (newStart !== plan.start_date || newEnd !== plan.end_date) {
    const { error: boundsErr } = await db.from("weekly_plans")
      .update({ start_date: newStart, end_date: newEnd })
      .eq("id", plan.id);
    if (boundsErr) console.error("swap-days: kunde inte uppdatera plan-gränser", boundsErr);
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
