export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Receptanvändning: historik + planerade dagar (Session 148) ──────────────
// recipe_history har EN rad per recept (senaste användning). Den ensam ljög på
// tre sätt: (1) recept på egna dagar (plan_id NULL) skrevs aldrig dit → kunde
// väljas igen dagarna runt omkring; (2) ett ersatt utkast eller en bortslumpad
// rätt låg kvar som "använd" i 14 dagar trots att den aldrig lagades;
// (3) dagflyttar ändrade inte used_on. Här slås historiken ihop med meal_days
// (sanningen om vad som faktiskt är planerat), och historikrader som pekar på
// i dag/framtiden men inte längre finns på någon dag ("spökrader") ignoreras.

export function isoDaysAgo(days, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ── Minnesfönstren (Session 154) ──────────────────────────────────────────
// RECENT_WINDOW_DAYS: recept som lagats/planerats inom 4 veckor väljs inte i
// första hand (tidigare 14 dagar). HARD_WINDOW_DAYS: inom 2 veckor väljs de i
// princip aldrig — bara i sista utvägen. Recept lagade för 2–4 veckor sedan är
// RESERVEN: tar en delpool slut (t.ex. testade kycklingrätter för vardag) tas
// hellre en sådan — längst sedan först, med dagtyp och proteintak kvar — än att
// generatorn släpper kraven. Bortom 4 veckor sköter "längst sedan"-viktningen
// (RECENCY_HORIZON_DAYS = 90 i select-recipes.js) variationen mjukt.
export const RECENT_WINDOW_DAYS = 28;
export const HARD_WINDOW_DAYS = 14;

// Ren funktion (testbar): historikrader + planerade dagar → { usedOn, recentIds, hardIds }.
// usedOn[id] = senaste datum receptet användes/är planerat; recentIds = de med
// usedOn >= cutoff (inkl. framtida planerade); hardIds = delmängden med
// usedOn >= hardCutoff (utan hardCutoff = samma som recentIds, dvs. ingen reserv).
export function buildRecipeUsage(historyRows = [], plannedRows = [], today, cutoff, hardCutoff = cutoff) {
  const plannedFrom = new Set();
  const usedOn = {};
  const bump = (id, date) => {
    const key = String(id);
    if (!usedOn[key] || date > usedOn[key]) usedOn[key] = date;
  };
  for (const d of plannedRows) {
    if (d.recipe_id == null || !d.date) continue;
    if (d.date >= today) plannedFrom.add(String(d.recipe_id));
    bump(d.recipe_id, d.date);
  }
  for (const h of historyRows) {
    if (h.recipe_id == null || !h.used_on) continue;
    if (h.used_on >= today && !plannedFrom.has(String(h.recipe_id))) continue; // spökrad
    bump(h.recipe_id, h.used_on);
  }
  const recentIds = new Set();
  const hardIds = new Set();
  for (const [id, date] of Object.entries(usedOn)) {
    if (date >= cutoff) recentIds.add(parseInt(id, 10));
    if (date >= hardCutoff) hardIds.add(parseInt(id, 10));
  }
  return { usedOn, recentIds, hardIds };
}

// ── Förslagsminne (Session 154, tabell recipe_suggestions — migration 013) ──
// Historiken minns bara vad som faktiskt planerats/lagats. Ett kasserat utkast
// eller en bortbytt rätt släpps (spökrad-städningen) — och kom därför tillbaka
// i nästa förslag. Här minns vi FÖRSLAGEN: suggested_on = dagen receptet senast
// lades i en genererad matsedel, rejected_on = dagen det senast byttes bort.
// Ett sådant recept viktas ner (aldrig spärras) i SUGGESTION_MEMORY_DAYS, mest
// direkt efteråt och linjärt tillbaka till full vikt. Lagas/planeras receptet
// på eller efter förslagsdagen räknas förslaget som accepterat → ingen sänkning.
export const SUGGESTION_MEMORY_DAYS = 28;
const SUGGESTED_FLOOR = 0.5; // med i ett förslag som inte blev av (t.ex. kasserat utkast)
const REJECTED_FLOOR = 0.2;  // aktivt bortbytt

function daysBetween(fromIso, toIso) {
  return (new Date(toIso + "T12:00:00Z") - new Date(fromIso + "T12:00:00Z")) / 864e5;
}

// Ren funktion (testbar): förslagsrader + usedOn → { receptId: vikt (0..1) }.
// Bara recept med sänkt vikt tas med.
export function suggestionPenalties(rows = [], usedOn = {}, today = isoDaysAgo(0)) {
  const out = {};
  for (const row of rows) {
    if (row?.recipe_id == null) continue;
    const used = usedOn[String(row.recipe_id)] || null;
    const factor = (date, floor) => {
      if (!date) return 1;
      if (used && used >= date) return 1;
      const days = Math.max(0, daysBetween(date, today));
      if (days >= SUGGESTION_MEMORY_DAYS) return 1;
      return floor + (1 - floor) * (days / SUGGESTION_MEMORY_DAYS);
    };
    const w = factor(row.suggested_on, SUGGESTED_FLOOR) * factor(row.rejected_on, REJECTED_FLOOR);
    if (w < 1) out[row.recipe_id] = w;
  }
  return out;
}

// Best effort: saknas tabellen (migration 013 ej körd) eller glappar skrivningen
// märks det bara som sämre variation — aldrig ett misslyckat byte/generering.
export async function recordSuggestions(database, householdId, recipeIds, field, date = isoDaysAgo(0)) {
  const ids = [...new Set((recipeIds || []).filter((id) => id != null))];
  if (!ids.length) return;
  try {
    const { error } = await database.from("recipe_suggestions").upsert(
      ids.map((recipe_id) => ({ household_id: householdId, recipe_id, [field]: date })),
      { onConflict: "household_id,recipe_id" });
    if (error) console.warn("recordSuggestions", error.message);
  } catch (e) {
    console.warn("recordSuggestions", e?.message || e);
  }
}

// Hämtar hela historiken + planerade dagar (senaste `lookbackDays` och framåt) + förslagsminnet.
export async function fetchRecipeUsage(database, householdId, {
  windowDays = RECENT_WINDOW_DAYS, hardDays = HARD_WINDOW_DAYS, lookbackDays = 90,
} = {}) {
  const today = isoDaysAgo(0);
  const [hist, planned, sugg] = await Promise.all([
    database.from("recipe_history").select("recipe_id, used_on").eq("household_id", householdId),
    database.from("meal_days").select("recipe_id, date").eq("household_id", householdId)
      .not("recipe_id", "is", null).gte("date", isoDaysAgo(lookbackDays)),
    // En rad per recept (som recipe_history) — liten tabell, läses i sin helhet.
    database.from("recipe_suggestions").select("recipe_id, suggested_on, rejected_on")
      .eq("household_id", householdId),
  ]);
  // Läsfel sväljs (som förr): sämre variation är bättre än en misslyckad generering.
  if (hist.error || planned.error) console.error("fetchRecipeUsage", hist.error || planned.error);
  const usage = buildRecipeUsage(hist.data || [], planned.data || [], today,
    isoDaysAgo(windowDays), isoDaysAgo(hardDays));
  const penaltyById = sugg.error ? {} : suggestionPenalties(sugg.data || [], usage.usedOn, today);
  return { ...usage, penaltyById };
}

// Ren funktion (testbar): vilka recept-id i historiken är spökrader?
// historyRows = recipe_history-rader (recipe_id, used_on), plannedRows =
// meal_days-rader (recipe_id, date). Spökrad = used_on >= today men receptet
// ligger inte på någon dag från today och framåt.
export function orphanHistoryIds(historyRows = [], plannedRows = [], today = isoDaysAgo(0)) {
  const plannedIds = new Set(plannedRows
    .filter((d) => d.recipe_id != null && d.date >= today)
    .map((d) => d.recipe_id));
  return historyRows
    .filter((h) => h.recipe_id != null && h.used_on >= today)
    .map((h) => h.recipe_id)
    .filter((id) => !plannedIds.has(id));
}

// Städar spökrader: historik med used_on >= i dag vars recept inte ligger på
// någon dag från i dag och framåt (ersatt utkast, bortslumpad rätt, raderad dag).
// Best effort — ett fel här får aldrig fälla själva genereringen/bytet.
//
// `orphans` (valfri): anroparen har redan räknat ut spökraderna ur rader den
// läst (replace-recipe.js) → bara DELETE:n körs, inga två extra läsrundor.
// Utan den läses historik + planerade dagar som förr (generate.js, day.js).
export async function pruneOrphanHistory(database, householdId, { orphans: known } = {}) {
  try {
    const today = isoDaysAgo(0);
    let orphans = known;
    if (!Array.isArray(orphans)) {
      const [hist, planned] = await Promise.all([
        database.from("recipe_history").select("recipe_id, used_on").eq("household_id", householdId).gte("used_on", today),
        database.from("meal_days").select("recipe_id, date").eq("household_id", householdId)
          .not("recipe_id", "is", null).gte("date", today),
      ]);
      if (hist.error || planned.error) return { pruned: 0 };
      orphans = orphanHistoryIds(hist.data || [], planned.data || [], today);
    }
    if (!orphans.length) return { pruned: 0 };
    const { error } = await database.from("recipe_history").delete()
      .eq("household_id", householdId).gte("used_on", today).in("recipe_id", orphans);
    return { pruned: error ? 0 : orphans.length };
  } catch (e) {
    console.error("pruneOrphanHistory", e);
    return { pruned: 0 };
  }
}
