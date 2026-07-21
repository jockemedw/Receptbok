import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";
import { fullContent } from "./_shared/day-ops.js";
import { RETRO_WINDOW_DAYS } from "./_shared/constants.js";

// "Byt dag" — byter innehåll mellan två dagar i matsedeln.
//
// En dag är en rad i meal_days. Plan-dagar har plan_id = aktiva planen;
// "egen planering"-dagar (egna anteckningar, valfritt med eget recept) har
// plan_id = null. Båda byts likadant: innehållet (recept, anteckning, plan-
// tillhörighet …) byter DATUM, datumen ligger fast.
//
// Båda dagarna finns      → byt fullt innehåll i EN bulk-upsert (atomär).
//                           plan_id följer med, så en plan-dag som byter med
//                           en anteckning lämnar planen och anteckningen går in.
// Ena dagen oplanerad/tom → flytta raden dit genom att byta dess DATUM (en
//                           UPDATE → atomär, raden behåller plan_id/lås/not);
//                           källdagen blir tom. Planens gränser räknas om.
//
// Receptmängden i planen är oförändrad vid varje byte (ett recept lämnar bara
// sin dag och ett annat tar dess plats) → inköpslistan rörs inte.

// fullContent (hela radens innehåll = allt utom datumet, inkl. plan_id och
// custom_note) delas med move-day och bor i _shared/day-ops.js.

export default createSupabaseHandler(async (req, res) => {
  const { date1, date2 } = req.body || {};
  if (!date1 || !date2) return res.status(400).json({ error: "date1 och date2 krävs" });
  if (date1 === date2) return res.status(400).json({ error: "Välj två olika dagar" });

  // Retro-planering (Session 131): familjen planerar ofta om i efterhand, så
  // passerade dagar FÅR bytas — men bara 14 dagar bakåt (samma fönster som
  // recepthistoriken). Gränsen bevarar andemeningen i F024/invariant #1: utan
  // den kunde ett byte mot en gammal, aldrig arkiverad egen-planering-dag dra
  // aktiva planens datumspann långt bak i historien. Servern står på egna ben
  // oavsett klientvalideringen i plan-viewer-deluxe.js/day-drag.js.
  const minIso = new Date(Date.now() - RETRO_WINDOW_DAYS * 86400e3).toISOString().slice(0, 10);
  if (date1 < minIso || date2 < minIso) {
    return res.status(400).json({ error: "Dagar äldre än två veckor är historik och kan inte ändras." });
  }

  const householdId = await getHouseholdId();

  const { data: plans, error: planErr } = await db
    .from("weekly_plans")
    .select("id, start_date, end_date, confirmed_at")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .limit(1);
  if (planErr) throw new Error("Kunde inte läsa matsedeln — prova igen.");
  const plan = plans?.[0] || null;

  // Läs båda dagarna OAVSETT plan_id → fångar både plan-dagar och egna
  // anteckningar (plan_id null), så de kan byta plats med varandra.
  const { data: rows, error: rowsErr } = await db
    .from("meal_days")
    .select("date, plan_id, recipe_id, recipe_title_snapshot, saving, saving_matches, blocked, locked, custom_note, shopped_at, shopping_list_id")
    .eq("household_id", householdId)
    .in("date", [date1, date2]);
  if (rowsErr) throw new Error("Kunde inte läsa matsedeln — prova igen.");

  const d1 = rows?.find((r) => r.date === date1);
  const d2 = rows?.find((r) => r.date === date2);

  if (!d1 && !d2) return res.status(404).json({ error: "Ingen av dagarna finns i matsedeln." });
  if (d1?.blocked || d2?.blocked) return res.status(400).json({ error: "Fria dagar kan inte bytas — ångra fri dag först." });

  if (d1 && d2) {
    // Båda dagarna finns → byt fullt innehåll i EN bulk-upsert (en SQL-sats, atomär)
    const { error: writeErr } = await db.from("meal_days").upsert([
      { household_id: householdId, date: d1.date, ...fullContent(d2) },
      { household_id: householdId, date: d2.date, ...fullContent(d1) },
    ], { onConflict: "household_id,date" });
    if (writeErr) {
      console.error("swap-days: upsert misslyckades", writeErr);
      throw new Error("Kunde inte byta dagarna — prova igen.");
    }
  } else {
    // En av dagarna är oplanerad/tom → flytta raden dit genom att byta dess
    // datum (atomärt, raden behåller plan_id, lås och not). Källdagen blir tom.
    // Matcha på household + datum (INTE plan_id) så att även egen-planering-
    // rader (plan_id null) kan flyttas.
    const src = d1 || d2;
    const emptyDate = d1 ? date2 : date1;

    const { error: moveErr } = await db
      .from("meal_days")
      .update({ date: emptyDate })
      .eq("household_id", householdId)
      .eq("date", src.date);
    if (moveErr) {
      console.error("swap-days: datumbyte misslyckades", moveErr);
      throw new Error("Kunde inte flytta dagen — prova igen.");
    }
  }

  // ── Bygg svar ────────────────────────────────────────────────────────────
  // Plan-delen: läs om planens rader (ett byte kan ha flyttat ett recept utanför
  // det gamla spannet → räkna om gränserna och persistera).
  let weeklyPlan = null;
  if (plan) {
    const { data: planRows, error: reReadErr } = await db
      .from("meal_days")
      .select("date, recipe_id, recipe_title_snapshot, saving, saving_matches, blocked")
      .eq("plan_id", plan.id)
      .order("date");
    if (reReadErr) throw new Error("Bytet sparades, men matsedeln kunde inte läsas om — ladda om sidan.");

    const newStart = planRows?.[0]?.date ?? plan.start_date;
    const newEnd   = planRows?.[planRows.length - 1]?.date ?? plan.end_date;
    if (newStart !== plan.start_date || newEnd !== plan.end_date) {
      const { error: boundsErr } = await db.from("weekly_plans")
        .update({ start_date: newStart, end_date: newEnd })
        .eq("id", plan.id);
      // Kasta i stället för att svara med ett spann som aldrig sparades —
      // annars divergerar klient och DB tills nästa omladdning.
      if (boundsErr) throw new Error("Bytet sparades, men veckans datumspann kunde inte uppdateras — ladda om sidan.");
    }

    weeklyPlan = {
      startDate:   newStart,
      endDate:     newEnd,
      confirmedAt: plan.confirmed_at || null,
      days: (planRows || []).map((d) => ({
        date:          d.date,
        recipe:        d.recipe_title_snapshot || null,
        recipeId:      d.recipe_id ?? null,
        saving:        d.saving ?? null,
        savingMatches: d.saving_matches ?? null,
        blocked:       d.blocked === true,
      })),
    };
  }

  // Egen planering-delen: läs om alla plan_id null-rader så att frontend kan
  // spegla att en anteckning bytt datum (samma form som loadCustomDays).
  const { data: customRows } = await db
    .from("meal_days")
    .select("date, custom_note, recipe_id, recipe_title_snapshot")
    .eq("household_id", householdId)
    .is("plan_id", null);
  const customDays = { entries: {} };
  for (const r of customRows || []) {
    customDays.entries[r.date] = {
      note:        r.custom_note || "",
      recipeId:    r.recipe_id ?? null,
      recipeTitle: r.recipe_title_snapshot || "",
    };
  }

  return res.status(200).json({ ok: true, weeklyPlan, customDays });
});
