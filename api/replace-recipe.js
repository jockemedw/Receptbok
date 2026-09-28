import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId, fetchTargetServings } from "./_shared/supabase.js";
import { buildRecipeUsage, isoDaysAgo, orphanHistoryIds, pruneOrphanHistory } from "./_shared/history.js";
import { pickReplacementOrder } from "./_shared/select-recipes.js";
import { getActiveList, rebuildActiveList } from "./_shared/shopping-store.js";

// Receptbyte (Slumpa / välj själv / Byt in från Veckans fynd).
//
// PRESTANDA (P3): varje databasanrop är en nätverksrunda, och det är
// rundorna — inte datamängden — som kostar. Förr gjordes ~19 anrop i följd
// när dagen låg på inköpslistan. Nu:
//   1. EN parallell läsomgång: aktiv plan, recept (utan ingredienser), dagarna
//      i ett fönster, listans o-inhandlade täckning, historik, aktiv lista,
//      portionsmål. Dagraden, veckans proteiner, receptanvändningen och om
//      dagen ligger på listan räknas sedan fram i minnet.
//   2. Skrivningarna exakt som förr (meal_days-update ‖ historik-upsert). Om
//      listan ska byggas om hämtas samtidigt ingredienser (bara täckta recept)
//      och gamla listans varor — läsningar som skrivningarna inte påverkar.
//   3. Spökhistorik-städningen (bara en DELETE, spökraderna är redan kända)
//      körs parallellt med listombygget — de rör olika tabeller.
// Säkerhetsordningen i rebuildActiveList (ny lista inaktiv → varor → stäng
// gamla → aktivera nya) är orörd.

// Plandagarna ligger alltid nära den bytta dagen; fönstret tar med marginal
// även en plan som började långt innan dagens 90-dagars användningsfönster.
const USAGE_LOOKBACK_DAYS = 90;
const PLAN_MARGIN_DAYS = 62;

function shiftIso(iso, days) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Kärnan, injicerbar för tester (samma mönster som generate.js). Returnerar
// { status, body } — handlern nedan skickar svaret.
export async function replaceRecipe({ database = db, householdId, body = {}, rng = Math.random }) {
  const { date, currentRecipeId: rawCurrentId, weekRecipeIds: rawWeekIds = [], newRecipeId, saving, savingMatches, excludeIds: rawExcludeIds } = body || {};
  if (!date) return { status: 400, body: { error: "date saknas" } };

  // Recept-id från DB är heltal — tvinga inkommande id till heltal så exkluderingen
  // (nuvarande recept + veckans övriga) håller även om klienten skickar strängar.
  const currentRecipeId = rawCurrentId == null ? null : parseInt(rawCurrentId, 10);
  const weekRecipeIds = (rawWeekIds || []).map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));
  // Nyss utbytta recept samma dag (klientens session) — hålls borta vid Slumpa
  // så bytet inte pendlar A→X→A. Högst 10, bara heltal.
  const excludeIds = (Array.isArray(rawExcludeIds) ? rawExcludeIds : [])
    .map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id)).slice(0, 10);

  const today = isoDaysAgo(0);
  const usageFrom = isoDaysAgo(USAGE_LOOKBACK_DAYS);
  const planFrom = shiftIso(date, -PLAN_MARGIN_DAYS);
  const windowFrom = usageFrom < planFrom ? usageFrom : planFrom;

  // 1) EN läsomgång — allt oberoende parallellt.
  const [
    { data: plans, error: planErr },
    { data: recipes, error: recErr },
    { data: windowDays, error: daysErr },
    { data: coveredRows, error: covErr },
    hist,
    activeList,
    targetServings,
  ] = await Promise.all([
    database.from("weekly_plans").select("id, start_date, end_date, confirmed_at")
      .eq("household_id", householdId).eq("is_active", true).limit(1),
    database.from("recipes").select("id, title, tags, protein, tested, servings")
      .eq("household_id", householdId),
    database.from("meal_days").select("date, recipe_id, plan_id, blocked, shopped_at, shopping_list_id")
      .eq("household_id", householdId).gte("date", windowFrom),
    // O-inhandlade dagar med listpekare (oavsett datum) — aktiva listans
    // täckning plockas ut i minnet när vi vet listans id.
    database.from("meal_days").select("date, recipe_id, blocked, shopped_at, shopping_list_id")
      .eq("household_id", householdId).not("shopping_list_id", "is", null).is("shopped_at", null),
    database.from("recipe_history").select("recipe_id, used_on").eq("household_id", householdId),
    getActiveList(householdId, database),
    fetchTargetServings(householdId, database),
  ]);
  if (planErr || recErr) throw new Error("Kunde inte läsa matsedeln — prova igen.");
  if (daysErr) throw new Error("Kunde inte läsa matsedelns dagar — prova igen.");

  const plan = plans?.[0];
  if (!plan) return { status: 404, body: { error: "Ingen aktiv plan hittades." } };

  const days = windowDays || [];
  const mealDayRow = days.find((d) => d.plan_id === plan.id && d.date === date);
  if (!mealDayRow) return { status: 404, body: { error: "Dagen hittades inte i veckoplanen." } };
  if (mealDayRow.blocked) {
    return { status: 400, body: { error: "Blockerade dagar kan inte bytas — avblockera dagen först." } };
  }

  const allRecipes = recipes || [];
  // Läsfel på historiken sväljs (som förr i fetchRecipeUsage): sämre variation
  // är bättre än ett misslyckat byte. Städningen hoppas då över.
  if (hist.error) console.error("replace-recipe: historik", hist.error);
  const historyRows = hist.error ? null : (hist.data || []);
  let picked;

  if (newRecipeId) {
    picked = allRecipes.find((r) => r.id === parseInt(newRecipeId, 10));
    if (!picked) return { status: 404, body: { error: "Receptet hittades inte." } };
  } else {
    // Historik + alla planerade dagar (även egna) — samma källa som generate.js.
    const planned = days.filter((d) => d.recipe_id != null && d.date >= usageFrom);
    const { recentIds, usedOn } = buildRecipeUsage(historyRows || [], planned, today, isoDaysAgo(14));

    const byId = new Map(allRecipes.map((r) => [r.id, r]));
    const proteinCount = {};
    for (const d of days) {
      if (d.plan_id !== plan.id || d.recipe_id == null || d.recipe_id === currentRecipeId) continue;
      const r = byId.get(d.recipe_id);
      if (r) proteinCount[r.protein] = (proteinCount[r.protein] || 0) + 1;
    }

    // Kaskaden (samma sort → släpp krav i tur och ordning) bor i en ren
    // funktion i select-recipes.js så den kan testas och återanvändas.
    const order = pickReplacementOrder(allRecipes, {
      current: byId.get(currentRecipeId) || null,
      weekIds: weekRecipeIds.filter((id) => id !== currentRecipeId),
      recentIds, usedOn, proteinCount, date, excludeIds, rng,
    });
    if (!order.length) return { status: 409, body: { error: "Inga tillgängliga recept att byta till." } };
    picked = byId.get(order[0]);
  }

  // Vid "Byt in" från Veckans fynd skickas receptets besparing med så den
  // behålls; vid vanligt slumpbyte saknas den → nollställs (priserna gäller
  // bara det specifika receptet).
  const keepSaving = newRecipeId && typeof saving === "number" ? saving : null;
  const keepMatches = newRecipeId && Array.isArray(savingMatches) ? savingMatches : null;

  // Ligger dagen på aktiva listan? Efter bytet är dagen alltid o-inhandlad
  // (shopped_at nollas nedan), så pekaren avgör — samma svar som förr gavs av
  // att läsa listans täckning efter skrivningen. Listan ska spegla exakt de
  // dagar familjen valt att handla för (Session 134): ligger dagen inte där
  // (eller finns ingen aktiv lista) rör vi den inte.
  const onList = !!activeList && mealDayRow.shopping_list_id === activeList.id;
  if (onList && covErr) throw new Error("Kunde inte läsa vilka dagar listan täcker — prova igen.");

  // Täckningen EFTER bytet, i minnet: listans o-inhandlade dagar + den bytta
  // dagen (nu o-inhandlad, med nya receptet).
  const coverRows = onList
    ? [
      ...(coveredRows || []).filter((r) => r.shopping_list_id === activeList.id && r.date !== date),
      { date, recipe_id: picked.id, blocked: mealDayRow.blocked },
    ].sort((a, b) => (a.date < b.date ? -1 : 1))
    : [];
  const coverDates = coverRows.map((r) => r.date);
  const coverRecipeIds = [...new Set(coverRows.map((r) => r.recipe_id).filter((id) => id != null))];

  // 2) Uppdatera meal_days + recipe_history parallellt. Kasta vid fel — annars
  // svarar endpointen 200 med nya titeln trots att inget persisterades.
  // shopped_at nollas alltid: ett utbytt recept är per definition o-inhandlat
  // (var dagen redan inhandlad behövs nya varor → tillbaka på listan nedan).
  // Läsningarna för ombygget (ingredienser för täckta recept, gamla listans
  // varor) påverkas inte av skrivningarna och går i samma runda.
  const [{ error: mdErr }, { error: histErr }, ingRes, itemsRes] = await Promise.all([
    database.from("meal_days").update({
      recipe_id: picked.id,
      recipe_title_snapshot: picked.title,
      saving: keepSaving,
      saving_matches: keepMatches,
      shopped_at: null,
    }).eq("household_id", householdId).eq("date", date),
    database.from("recipe_history").upsert(
      { household_id: householdId, recipe_id: picked.id, used_on: date }, // dagen den äts (se generate.js)
      { onConflict: "household_id,recipe_id" }
    ),
    onList && coverRecipeIds.length
      ? database.from("recipes").select("id, title, ingredients, tags, protein, tested, servings")
        .eq("household_id", householdId).in("id", coverRecipeIds)
      : null,
    onList
      ? database.from("shopping_items").select("name, checked, source, position").eq("list_id", activeList.id)
      : null,
  ]);
  if (mdErr || histErr) throw mdErr || histErr;

  // Den utbytta rätten lagas inte längre den dagen — släpp dess historikrad.
  // Spökraderna räknas ur det vi redan läst, med skrivningarna ovan inräknade.
  let prune = Promise.resolve();
  if (historyRows) {
    const histAfter = [
      ...historyRows.filter((h) => h.recipe_id !== picked.id),
      { recipe_id: picked.id, used_on: date },
    ];
    const plannedAfter = days.map((d) => (d.date === date ? { ...d, recipe_id: picked.id } : d));
    const orphans = orphanHistoryIds(histAfter, plannedAfter, today);
    prune = pruneOrphanHistory(database, householdId, { orphans });
  }

  const reply = { recipe: picked.title, recipeId: picked.id, saving: keepSaving, savingMatches: keepMatches };
  if (!onList) {
    await prune;
    return { status: 200, body: reply };
  }

  if (ingRes?.error) throw new Error("Kunde inte läsa recepten — prova igen.");
  if (itemsRes?.error) throw new Error("Kunde inte läsa nuvarande inköpslista — prova igen.");

  // 3) Bygg om listan (säkerhetsordningen i rebuildActiveList) ‖ städningen.
  const [{ shoppingList }] = await Promise.all([
    rebuildActiveList({
      householdId,
      coverDates,
      span: { startDate: plan.start_date, endDate: plan.end_date },
      recipes: ingRes?.data || [],
      database,
      dayRows: coverRows,
      targetServings,
      oldList: activeList,
      existingItems: itemsRes?.data || [],
    }),
    prune,
  ]);
  return { status: 200, body: { ...reply, shoppingList } };
}

export default createSupabaseHandler(async (req, res) => {
  const householdId = req.body?.date ? await getHouseholdId() : null;
  const { status, body } = await replaceRecipe({ householdId, body: req.body || {} });
  return res.status(status).json(body);
});
