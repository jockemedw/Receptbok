export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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

// Ren funktion (testbar): historikrader + planerade dagar → { usedOn, recentIds }.
// usedOn[id] = senaste datum receptet användes/är planerat; recentIds = de med
// usedOn >= cutoff (inkl. framtida planerade).
export function buildRecipeUsage(historyRows = [], plannedRows = [], today, cutoff) {
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
  for (const [id, date] of Object.entries(usedOn)) {
    if (date >= cutoff) recentIds.add(parseInt(id, 10));
  }
  return { usedOn, recentIds };
}

// Hämtar historik + planerade dagar (senaste `lookbackDays` och framåt).
export async function fetchRecipeUsage(database, householdId, { windowDays = 14, lookbackDays = 90 } = {}) {
  const today = isoDaysAgo(0);
  const [hist, planned] = await Promise.all([
    database.from("recipe_history").select("recipe_id, used_on").eq("household_id", householdId),
    database.from("meal_days").select("recipe_id, date").eq("household_id", householdId)
      .not("recipe_id", "is", null).gte("date", isoDaysAgo(lookbackDays)),
  ]);
  // Läsfel sväljs (som förr): sämre variation är bättre än en misslyckad generering.
  if (hist.error || planned.error) console.error("fetchRecipeUsage", hist.error || planned.error);
  return buildRecipeUsage(hist.data || [], planned.data || [], today, isoDaysAgo(windowDays));
}

// Städar spökrader: historik med used_on >= i dag vars recept inte ligger på
// någon dag från i dag och framåt (ersatt utkast, bortslumpad rätt, raderad dag).
// Best effort — ett fel här får aldrig fälla själva genereringen/bytet.
export async function pruneOrphanHistory(database, householdId) {
  try {
    const today = isoDaysAgo(0);
    const [hist, planned] = await Promise.all([
      database.from("recipe_history").select("recipe_id").eq("household_id", householdId).gte("used_on", today),
      database.from("meal_days").select("recipe_id").eq("household_id", householdId)
        .not("recipe_id", "is", null).gte("date", today),
    ]);
    if (hist.error || planned.error) return { pruned: 0 };
    const plannedIds = new Set((planned.data || []).map((d) => d.recipe_id));
    const orphans = (hist.data || []).map((h) => h.recipe_id).filter((id) => !plannedIds.has(id));
    if (!orphans.length) return { pruned: 0 };
    const { error } = await database.from("recipe_history").delete()
      .eq("household_id", householdId).gte("used_on", today).in("recipe_id", orphans);
    return { pruned: error ? 0 : orphans.length };
  } catch (e) {
    console.error("pruneOrphanHistory", e);
    return { pruned: 0 };
  }
}
