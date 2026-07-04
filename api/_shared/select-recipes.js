// Deterministiskt receptval — ren logik, ingen I/O och inga Supabase-beroenden.
// Bröts ut ur api/generate.js (tidigare inline + en drift-benägen testkopia) så
// att både handlern och tests/select-recipes.test.js importerar SAMMA källa.
//
// Pipeline: historikfiltrering (14 dagar görs av anroparen via recentIds) →
// proteinfördelning (max 2 per icke-veg-typ) → vardag30/helg60-matchning →
// säsongsvikt → slump. Se selectRecipes nedan.

import { shuffle } from "./history.js";
import { weightedSaving } from "./willys-matcher.js";

export const SAVING_THRESHOLD = 10;

// Prioriterar in rea-recept i matsedeln. Tröskeln mäts på VÄRDEVIKTAD besparing
// (weightedSaving) i stället för rå kr — så att ett recept vars besparing bara är
// billig vitlök/lök inte trycks in, medan dyra protein-/färskvarureor lyfts.
export function bucketBySaving(pool, savingsById, currentSeason = null) {
  // Säsongsvikta INOM varje besparings-bucket i stället för att omsortera hela
  // poolen efteråt — annars kastar säsongsviktningen bort rea-först-ordningen när
  // både optimize_prices och säsongsvikt är på. Rea-recept ligger fortfarande
  // först (buckets konkateneras high→low); säsongen styr bara ordningen inom.
  const order = (arr) => (currentSeason ? applySeasonWeight(arr, currentSeason) : shuffle(arr));
  if (!savingsById) return order(pool);
  const high = [], low = [];
  for (const r of pool) {
    const e = savingsById[r.id];
    const score = e ? weightedSaving(e.matches, e.total) : 0;
    if (score >= SAVING_THRESHOLD) high.push(r);
    else low.push(r);
  }
  return [...order(high), ...order(low)];
}

function applySeasonWeight(pool, currentSeason) {
  if (!currentSeason) return pool;
  const weighted = pool.map((r) => {
    const seasons = r.seasons || [];
    let weight;
    if (seasons.length === 0) weight = 1;
    else if (seasons.includes(currentSeason)) weight = 2;
    else weight = 0.5;
    return { r, sort: Math.random() * weight };
  });
  weighted.sort((a, b) => b.sort - a.sort);
  return weighted.map((w) => w.r);
}

export const hasTure = (r) => (r.tags || []).some((t) => t.toLowerCase() === "ture");

export function selectRecipes(recipes, dayList, constraints, recentIds = new Set(), usedOn = {}, savingsById = null, currentSeason = null) {
  const MAX_PER_PROTEIN = 2;

  const fresh = recipes.filter((r) => !recentIds.has(r.id));
  let pool;
  if (fresh.length >= dayList.length) {
    pool = fresh;
  } else {
    const needed = dayList.length - fresh.length;
    const oldest = recipes
      .filter((r) => recentIds.has(r.id))
      .sort((a, b) => (usedOn[a.id] ?? "") < (usedOn[b.id] ?? "") ? -1 : 1)
      .slice(0, needed);
    pool = [...fresh, ...oldest];
  }
  if (pool.length === 0) pool = recipes;

  const weekdayPool = bucketBySaving(pool.filter((r) => r.tags.includes("vardag30")), savingsById, currentSeason);
  const weekendPool = bucketBySaving(pool.filter((r) => r.tags.includes("helg60")), savingsById, currentSeason);

  const tureCount = constraints.ture_days;
  const shuffledIndices = shuffle(dayList.map((_, i) => i));
  const tureDaySet = new Set(shuffledIndices.slice(0, tureCount));

  const vegCount = constraints.vegetarian_days;
  const remainingIndices = shuffledIndices.filter((i) => !tureDaySet.has(i));
  const vegDaySet = new Set(remainingIndices.slice(0, vegCount));

  const maxVeg = Math.max(2, vegCount);

  const usedIds = new Set();
  const proteinUsage = {};
  const result = [];
  let untestedSoFar = 0;

  function pick(dayPool, altPool, mustBeVeg, mustBeTure) {
    const maxForProtein = (p) => p === "vegetarisk" ? maxVeg : MAX_PER_PROTEIN;
    const underUntestedLimit = (r) => r.tested || untestedSoFar < constraints.untested_count;
    const tureOk = (r) => !mustBeTure || hasTure(r);
    const vegOk = (r) => {
      if (mustBeVeg) return r.protein === "vegetarisk";
      if (!mustBeTure) return r.protein !== "vegetarisk";
      return true;
    };
    const saveTure = tureCount > 0 && !mustBeTure;
    const preferNonTure = (r) => !saveTure || !hasTure(r);
    for (const r of dayPool) {
      if (usedIds.has(r.id)) continue;
      if (!tureOk(r)) continue;
      if (!vegOk(r)) continue;
      if (!preferNonTure(r)) continue;
      if ((proteinUsage[r.protein] || 0) >= maxForProtein(r.protein)) continue;
      if (!underUntestedLimit(r)) continue;
      return r;
    }
    for (const r of dayPool) {
      if (usedIds.has(r.id)) continue;
      if (!tureOk(r)) continue;
      if (!vegOk(r)) continue;
      if (!preferNonTure(r)) continue;
      if (!underUntestedLimit(r)) continue;
      return r;
    }
    for (const r of altPool) {
      if (usedIds.has(r.id)) continue;
      if (!tureOk(r)) continue;
      if (!vegOk(r)) continue;
      if (!preferNonTure(r)) continue;
      if (!underUntestedLimit(r)) continue;
      return r;
    }
    for (const r of recipes) {
      if (usedIds.has(r.id)) continue;
      if (!tureOk(r)) continue;
      if (!vegOk(r)) continue;
      if (!underUntestedLimit(r)) continue;
      return r;
    }
    for (const r of recipes) {
      if (usedIds.has(r.id)) continue;
      if (!tureOk(r)) continue;
      if (!vegOk(r)) continue;
      return r;
    }
    return null;
  }

  const processingOrder = dayList.map((_, i) => i);
  processingOrder.sort((a, b) => (tureDaySet.has(a) ? 0 : 1) - (tureDaySet.has(b) ? 0 : 1));

  for (const i of processingOrder) {
    const day = dayList[i];
    const isVegDay = vegDaySet.has(i);
    const isTureDay = tureDaySet.has(i);
    const dayPool = day.is_weekend ? weekendPool : weekdayPool;
    const altPool = day.is_weekend ? weekdayPool : weekendPool;
    const recipe = pick(dayPool, altPool, isVegDay, isTureDay);
    if (!recipe) {
      throw new Error(
        `Kunde inte hitta recept för ${day.day} (${day.date}) — ` +
        `${isTureDay ? "ture " : ""}${isVegDay ? "vegetarisk " : ""}${day.is_weekend ? "helg" : "vardag"}. ` +
        "Prova att ändra inställningarna."
      );
    }
    usedIds.add(recipe.id);
    proteinUsage[recipe.protein] = (proteinUsage[recipe.protein] || 0) + 1;
    if (!recipe.tested) untestedSoFar++;
    result.push({ date: day.date, day: day.day, recipe: recipe.title, recipeId: recipe.id });
  }

  result.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return result;
}
