import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";
import { fullContent, spanAfterInsert, changedFullRows } from "./_shared/day-ops.js";
import { RETRO_WINDOW_DAYS } from "./_shared/constants.js";

// "Flytta dag" — lyfter ut en dags INNEHÅLL och klämmer in det före en annan
// dag. Generaliserad (Session 131): roterar FULLT innehåll (plan-recept, egna
// receptdagar, anteckningar, inköpsrundstatus) över ALLA dagtyper i spannet —
// tomma dagar deltar som hål som vandrar. Kräver ingen aktiv plan (familjen
// planerar ofta helt manuellt). Fria dagar (blocked) är PINNADE vid sina datum;
// arkiverade veckor får inte korsas (deras dagar bor i plan_archives, inte i
// meal_days — en rotation över dem skulle skriva innehåll "under" arkivet).
//
// Datumen ligger fast — innehållet roteras → recept-/noterings-/planmängden är
// oförändrad (invariant #1, verifieras av spanAfterInsert FÖRE skrivning) och
// inköpslistan rörs inte. Skrivordning: upsert först, sedan delete av tömda
// datum — ett partiellt fel kan ge en dubblett (synlig, åtgärdbar), aldrig
// förlorat innehåll.
//
// Body: { date: "<källdag>", before: "<dag att klämmas in före>" | null = sist }

const ROW_FIELDS = "date, plan_id, recipe_id, recipe_title_snapshot, saving, saving_matches, blocked, locked, custom_note, shopped_at, shopping_list_id";

function addDaysUtc(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
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
  const { date, before = null } = req.body || {};
  if (!date) return res.status(400).json({ error: "date saknas" });
  if (before === date) return res.status(400).json({ error: "Dagen kan inte flyttas till sin egen plats." });

  // Retro-fönstret — samma gräns som swap-days: äldre än 14 dagar är historik.
  const minIso = new Date(Date.now() - RETRO_WINDOW_DAYS * 86400e3).toISOString().slice(0, 10);
  if (date < minIso || (before && before < minIso)) {
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

  // ALLA hushållets dagar (tabellen är liten) — flytten kan korsa dagtyper.
  const { data: rows, error: rowsErr } = await db
    .from("meal_days")
    .select(ROW_FIELDS)
    .eq("household_id", householdId)
    .order("date");
  if (rowsErr) throw new Error("Kunde inte läsa matsedeln — prova igen.");
  const byDate = new Map((rows || []).map((r) => [r.date, r]));

  const srcRow = byDate.get(date);
  if (!srcRow) return res.status(404).json({ error: "Dagen finns inte i matsedeln." });
  if (srcRow.blocked === true) return res.status(400).json({ error: "Fria dagar är pinnade vid sina datum och kan inte flyttas." });

  // Spannet: källa ↔ mål, eller källa → sista innehållsdagen (before = null).
  let spanStart, spanEnd;
  if (before) {
    spanStart = date < before ? date : before;
    spanEnd   = date < before ? before : date;
  } else {
    const contentDates = (rows || []).filter((r) => r.blocked !== true).map((r) => r.date);
    const last = contentDates[contentDates.length - 1] || null;
    spanStart = date;
    // Källan är redan sist → 1-dagsspann → spanAfterInsert noop:ar, och svaret
    // byggs som vanligt (klienten behöver alltid weeklyPlan + customDays).
    spanEnd = last && last > date ? last : date;
  }

  // Arkivvakt: arkiverade veckors dagar bor i plan_archives — spannet får inte
  // överlappa dem (innehåll skulle hamna "under" arkivkorten i vyn).
  const { data: archives, error: archErr } = await db
    .from("plan_archives")
    .select("start_date, end_date")
    .eq("household_id", householdId);
  if (archErr) throw new Error("Kunde inte läsa matsedeln — prova igen.");
  const hitsArchive = (archives || []).some((a) => a.start_date <= spanEnd && a.end_date >= spanStart);
  if (hitsArchive) {
    return res.status(400).json({ error: "Historiska veckor ligger fast — flytten kan inte korsa en arkiverad matsedel." });
  }

  // Kontinuerligt spann med fullt innehåll (tomma datum = hål som vandrar)
  const entries = [];
  for (let cur = spanStart; cur <= spanEnd; cur = addDaysUtc(cur, 1)) {
    const r = byDate.get(cur);
    entries.push({
      date: cur,
      blocked: r?.blocked === true,
      content: r && r.blocked !== true ? fullContent(r) : null,
    });
  }

  const result = spanAfterInsert(entries, date, before);
  if (result.error === "src")    return res.status(400).json({ error: "Dagen kan inte flyttas." });
  if (result.error === "target") return res.status(400).json({ error: "Måldagen finns inte i matsedeln." });
  if (result.error === "invariant") {
    console.error("move-day: invariant bruten — avbryter utan att skriva", { date, before });
    return res.status(500).json({ error: "Flytten avbröts som säkerhetsåtgärd — ingenting har ändrats. Prova igen." });
  }
  if (!result.noop) {
    const { upserts, deletions } = changedFullRows(entries, result.next);
    if (upserts.length) {
      const payload = upserts.map((u) => ({ household_id: householdId, date: u.date, ...u.content }));
      const { error: writeErr } = await db
        .from("meal_days")
        .upsert(payload, { onConflict: "household_id,date" });
      if (writeErr) {
        console.error("move-day: upsert misslyckades", writeErr);
        throw new Error("Kunde inte spara flytten — prova igen.");
      }
    }
    if (deletions.length) {
      const { error: delErr } = await db
        .from("meal_days")
        .delete()
        .eq("household_id", householdId)
        .in("date", deletions);
      if (delErr) {
        console.error("move-day: städning av tömda dagar misslyckades", delErr);
        throw new Error("Flytten sparades, men en tömd dag kunde inte städas — ladda om sidan.");
      }
    }
  }

  // ── Bygg svar (samma form som swap-days: weeklyPlan + customDays) ──────────
  let weeklyPlan = null;
  if (plan) {
    const { data: planRows, error: reReadErr } = await db
      .from("meal_days")
      .select("date, recipe_id, recipe_title_snapshot, saving, saving_matches, blocked")
      .eq("plan_id", plan.id)
      .order("date");
    if (reReadErr) throw new Error("Flytten sparades, men matsedeln kunde inte läsas om — ladda om sidan.");

    const newStart = planRows?.[0]?.date ?? plan.start_date;
    const newEnd   = planRows?.[planRows.length - 1]?.date ?? plan.end_date;
    if (newStart !== plan.start_date || newEnd !== plan.end_date) {
      const { error: boundsErr } = await db.from("weekly_plans")
        .update({ start_date: newStart, end_date: newEnd })
        .eq("id", plan.id);
      if (boundsErr) throw new Error("Flytten sparades, men veckans datumspann kunde inte uppdateras — ladda om sidan.");
    }
    weeklyPlan = toWeeklyPlan({ ...plan, start_date: newStart, end_date: newEnd }, planRows || []);
  }

  const { data: customRows } = await db
    .from("meal_days")
    .select("date, custom_note, recipe_id, recipe_title_snapshot")
    .eq("household_id", householdId)
    .is("plan_id", null);
  const customDays = { entries: {} };
  for (const r of customRows || []) {
    if (r.custom_note == null && r.recipe_id == null && !r.recipe_title_snapshot) continue;
    customDays.entries[r.date] = {
      note:        r.custom_note || "",
      recipeId:    r.recipe_id ?? null,
      recipeTitle: r.recipe_title_snapshot || "",
    };
  }

  return res.status(200).json({ ok: true, noop: result.noop === true, weeklyPlan, customDays });
});
