import { createSupabaseHandler } from "./_shared/handler.js";
import { readFileRaw, writeFile } from "./_shared/github.js";
import { db, getHouseholdId } from "./_shared/supabase.js";
import { getActiveList, fetchCoverage, unshoppedDates, rebuildActiveList, markRoundShopped } from "./_shared/shopping-store.js";

// Action-dispatchad inköpsendpoint (mönstret håller api/ under 12-filsgränsen):
//   get_preferences / set_preferences — inköpspreferenser (dispatch-preferences.json)
//   add_day      — lägg en dags ingredienser på listan (custom-dag eller
//                  återläggning av en redan inhandlad dag; nollar spärren)
//   remove_day   — ta bort en dags ingredienser från listan
//   mark_shopped — "Vi har handlat": stämpla täckta dagar som inhandlade och
//                  flytta obockade receptvaror till Egna tillägg

const PREFS_DEFAULTS = { blockedBrands: [], preferOrganic: {}, preferSwedish: {} };

export default createSupabaseHandler(async (req, res) => {
  const { action, preferences, date } = req.body || {};

  if (action === "get_preferences") {
    let prefs;
    try { prefs = await readFileRaw("dispatch-preferences.json"); } catch { prefs = PREFS_DEFAULTS; }
    return res.status(200).json(prefs);
  }

  if (action === "set_preferences") {
    const pat = process.env.GITHUB_PAT;
    if (!pat) return res.status(500).json({ error: "GITHUB_PAT saknas i env" });
    const prefs = {
      blockedBrands: (preferences?.blockedBrands || []).map((b) => b.toLowerCase().trim()).filter(Boolean),
      preferOrganic: preferences?.preferOrganic || {},
      preferSwedish: preferences?.preferSwedish || {},
    };
    await writeFile("dispatch-preferences.json", prefs, pat, "Uppdatera inköpspreferenser");
    return res.status(200).json(prefs);
  }

  if (action === "add_day") {
    if (!date) return res.status(400).json({ error: "date saknas" });
    const householdId = await getHouseholdId();

    const { data: dayRow, error: dayErr } = await db
      .from("meal_days")
      .select("date, recipe_id, blocked, shopped_at")
      .eq("household_id", householdId)
      .eq("date", date)
      .maybeSingle();
    if (dayErr) throw new Error("Kunde inte läsa dagen — prova igen.");
    if (!dayRow) return res.status(404).json({ error: "Dagen finns inte i matsedeln." });
    if (dayRow.blocked === true) return res.status(400).json({ error: "Dagen är en fri dag — inga ingredienser att lägga till." });
    if (!dayRow.recipe_id) return res.status(400).json({ error: "Dagen har inget recept — välj ett recept först." });

    // Återläggning: en redan inhandlad dag får spärren nollad FÖRE ombygget,
    // annars skulle den stå som både "inhandlad" och "på listan".
    if (dayRow.shopped_at) {
      const { error: clrErr } = await db
        .from("meal_days")
        .update({ shopped_at: null })
        .eq("household_id", householdId)
        .eq("date", date);
      if (clrErr) throw new Error("Kunde inte lägga tillbaka dagen — prova igen.");
    }

    const list = await getActiveList(householdId);
    const covered = list ? unshoppedDates(await fetchCoverage(householdId, list.id)) : [];
    const { shoppingList } = await rebuildActiveList({
      householdId,
      coverDates: [...new Set([...covered, date])],
      stampMovedAt: true,
    });
    return res.status(200).json({ ok: true, shoppingList });
  }

  if (action === "remove_day") {
    if (!date) return res.status(400).json({ error: "date saknas" });
    const householdId = await getHouseholdId();

    const list = await getActiveList(householdId);
    if (!list) return res.status(400).json({ error: "Det finns ingen aktiv inköpslista." });
    const covered = unshoppedDates(await fetchCoverage(householdId, list.id));
    if (!covered.includes(date)) {
      return res.status(400).json({ error: "Dagen ligger inte på inköpslistan." });
    }
    const { shoppingList } = await rebuildActiveList({
      householdId,
      coverDates: covered.filter((d) => d !== date),
      span: { startDate: list.start_date, endDate: list.end_date },
    });
    return res.status(200).json({ ok: true, shoppingList });
  }

  if (action === "mark_shopped") {
    const householdId = await getHouseholdId();
    const { shoppedDates, converted } = await markRoundShopped(householdId);
    if (!shoppedDates.length) {
      return res.status(400).json({ error: "Listan täcker inga dagar att markera — bygg inköpslistan först." });
    }
    return res.status(200).json({ ok: true, shoppedDates, converted });
  }

  return res.status(400).json({ error: "Okänd action" });
});
