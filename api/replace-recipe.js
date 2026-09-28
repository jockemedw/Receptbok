import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";
import { fetchRecipeUsage, pruneOrphanHistory } from "./_shared/history.js";
import { pickReplacementOrder } from "./_shared/select-recipes.js";
import { getActiveList, fetchCoverage, unshoppedDates, rebuildActiveList } from "./_shared/shopping-store.js";

export default createSupabaseHandler(async (req, res) => {
  const { date, currentRecipeId: rawCurrentId, weekRecipeIds: rawWeekIds = [], newRecipeId, saving, savingMatches, excludeIds: rawExcludeIds } = req.body || {};
  if (!date) return res.status(400).json({ error: "date saknas" });

  // Recept-id från DB är heltal — tvinga inkommande id till heltal så exkluderingen
  // (nuvarande recept + veckans övriga) håller även om klienten skickar strängar.
  const currentRecipeId = rawCurrentId == null ? null : parseInt(rawCurrentId, 10);
  const weekRecipeIds = (rawWeekIds || []).map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));
  // Nyss utbytta recept samma dag (klientens session) — hålls borta vid Slumpa
  // så bytet inte pendlar A→X→A. Högst 10, bara heltal.
  const excludeIds = (Array.isArray(rawExcludeIds) ? rawExcludeIds : [])
    .map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id)).slice(0, 10);

  const householdId = await getHouseholdId();

  const [{ data: plans }, { data: recipes }] = await Promise.all([
    db.from("weekly_plans").select("id, start_date, end_date, confirmed_at")
      .eq("household_id", householdId).eq("is_active", true).limit(1),
    db.from("recipes").select("id, title, tags, protein, tested, ingredients, servings")
      .eq("household_id", householdId),
  ]);

  const plan = plans?.[0];
  if (!plan) return res.status(404).json({ error: "Ingen aktiv plan hittades." });

  const { data: mealDayRow } = await db
    .from("meal_days")
    .select("blocked, shopped_at")
    .eq("household_id", householdId)
    .eq("plan_id", plan.id)
    .eq("date", date)
    .maybeSingle();

  if (!mealDayRow) return res.status(404).json({ error: "Dagen hittades inte i veckoplanen." });
  if (mealDayRow.blocked) {
    return res.status(400).json({ error: "Blockerade dagar kan inte bytas — avblockera dagen först." });
  }

  const allRecipes = recipes || [];
  let picked;

  if (newRecipeId) {
    picked = allRecipes.find((r) => r.id === parseInt(newRecipeId, 10));
    if (!picked) return res.status(404).json({ error: "Receptet hittades inte." });
  } else {
    // Historik + alla planerade dagar (även egna) — samma källa som generate.js.
    const { recentIds, usedOn } = await fetchRecipeUsage(db, householdId);

    const { data: planDays } = await db
      .from("meal_days")
      .select("recipe_id")
      .eq("plan_id", plan.id)
      .not("recipe_id", "is", null);

    const proteinCount = {};
    for (const d of (planDays || [])) {
      if (d.recipe_id !== currentRecipeId) {
        const r = allRecipes.find((x) => x.id === d.recipe_id);
        if (r) proteinCount[r.protein] = (proteinCount[r.protein] || 0) + 1;
      }
    }

    // Kaskaden (samma sort → släpp krav i tur och ordning) bor i en ren
    // funktion i select-recipes.js så den kan testas och återanvändas.
    const order = pickReplacementOrder(allRecipes, {
      current: allRecipes.find((r) => r.id === currentRecipeId) || null,
      weekIds: weekRecipeIds.filter((id) => id !== currentRecipeId),
      recentIds, usedOn, proteinCount, date, excludeIds,
    });
    if (!order.length) return res.status(409).json({ error: "Inga tillgängliga recept att byta till." });
    picked = allRecipes.find((r) => r.id === order[0]);
  }

  // Vid "Byt in" från Veckans fynd skickas receptets besparing med så den
  // behålls; vid vanligt slumpbyte saknas den → nollställs (priserna gäller
  // bara det specifika receptet).
  const keepSaving = newRecipeId && typeof saving === "number" ? saving : null;
  const keepMatches = newRecipeId && Array.isArray(savingMatches) ? savingMatches : null;

  // Uppdatera meal_days + recipe_history parallellt. Kasta vid fel — annars
  // svarar endpointen 200 med nya titeln trots att inget persisterades.
  // shopped_at nollas alltid: ett utbytt recept är per definition o-inhandlat
  // (var dagen redan inhandlad behövs nya varor → tillbaka på listan nedan).
  const [{ error: mdErr }, { error: histErr }] = await Promise.all([
    db.from("meal_days").update({
      recipe_id: picked.id,
      recipe_title_snapshot: picked.title,
      saving: keepSaving,
      saving_matches: keepMatches,
      shopped_at: null,
    }).eq("household_id", householdId).eq("date", date),
    db.from("recipe_history").upsert(
      { household_id: householdId, recipe_id: picked.id, used_on: date }, // dagen den äts (se generate.js)
      { onConflict: "household_id,recipe_id" }
    ),
  ]);
  if (mdErr || histErr) throw mdErr || histErr;
  // Den utbytta rätten lagas inte längre den dagen — släpp dess historikrad.
  await pruneOrphanHistory(db, householdId);

  // Bygg om inköpslistan bara om den utbytta dagen redan ligger på listans
  // o-inhandlade täckning (Session 134, manuellt dagval): listan ska spegla
  // exakt de dagar familjen valt att handla för — varken mer eller mindre.
  // Ligger dagen inte på listan (eller finns ingen aktiv lista) rör vi den inte.
  const activeList = await getActiveList(householdId);
  const coverDates = activeList
    ? unshoppedDates(await fetchCoverage(householdId, activeList.id))
    : [];

  if (coverDates.includes(date)) {
    const { shoppingList } = await rebuildActiveList({
      householdId,
      coverDates,
      span: { startDate: plan.start_date, endDate: plan.end_date },
      recipes: allRecipes,
    });
    return res.status(200).json({ recipe: picked.title, recipeId: picked.id, saving: keepSaving, savingMatches: keepMatches, shoppingList });
  }

  return res.status(200).json({ recipe: picked.title, recipeId: picked.id, saving: keepSaving, savingMatches: keepMatches });
});
