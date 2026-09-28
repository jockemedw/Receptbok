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

// "Längst sedan"-viktning, ALLTID (Session 148). Tidigare var ordningen inom
// poolen ren slump bortom 14-dagarsfönstret — med ~10 testade icke-veg-recept och
// matsedlar var 3–5:e vecka delade två 6-dagarsplaner i snitt ~1,5 rätter
// (simulering; ~0,8 med viktningen). Nu väger ett recept mindre ju närmare i
// tiden det lagades: aldrig lagat = 1, annars linjärt från RECENCY_FLOOR upp
// till 1 vid RECENCY_HORIZON_DAYS dagar.
export const RECENCY_HORIZON_DAYS = 90;
const RECENCY_FLOOR = 0.1;

export function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export function recencyWeight(usedOnDate, today = isoToday()) {
  if (!usedOnDate) return 1;
  const days = (new Date(today + "T12:00:00") - new Date(usedOnDate + "T12:00:00")) / 864e5;
  if (days <= 0) return RECENCY_FLOOR;
  return Math.min(1, Math.max(RECENCY_FLOOR, days / RECENCY_HORIZON_DAYS));
}

function seasonWeight(r, currentSeason) {
  if (!currentSeason) return 1;
  const seasons = r.seasons || [];
  if (seasons.length === 0) return 1;
  return seasons.includes(currentSeason) ? 2 : 0.5;
}

// Viktad slumpordning utan återläggning (Efraimidis–Spirakis: nyckel = u^(1/w)).
// Ett recept med vikt 2 hamnar före ett med vikt 1 i 2 av 3 fall.
// rng är valfri (testerna skickar en seedad) — default Math.random.
export function weightedOrder(list, weightOf, rng = Math.random) {
  return list
    .map((r) => ({ r, key: Math.pow(rng(), 1 / Math.max(weightOf(r), 1e-6)) }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.r);
}

// Prioriterar in rea-recept i matsedeln. Tröskeln mäts på VÄRDEVIKTAD besparing
// (weightedSaving) i stället för rå kr — så att ett recept vars besparing bara är
// billig vitlök/lök inte trycks in, medan dyra protein-/färskvarureor lyfts.
export function bucketBySaving(pool, savingsById, currentSeason = null, usedOn = {}, today = isoToday()) {
  // Säsong och "längst sedan" viktas INOM varje besparings-bucket i stället för
  // att omsortera hela poolen efteråt — rea-recept ligger fortfarande först
  // (buckets konkateneras high→low); vikterna styr bara ordningen inom.
  const order = (arr) => weightedOrder(arr, (r) =>
    seasonWeight(r, currentSeason) * recencyWeight(usedOn[r.id], today));
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

export const hasTure = (r) => (r.tags || []).some((t) => t.toLowerCase() === "ture");

// "Längst sedan använt" först: aldrig använda (saknar usedOn) först, sedan
// äldst datum. Slumpas FÖRE den stabila sorteringen så att lika datum (en hel
// matsedels recept delar ofta datum) inte alltid kommer i databasordning.
export function byLongestAgo(list, usedOn = {}, rng = Math.random) {
  return shuffle(list, rng).sort((a, b) => {
    const da = usedOn[a.id] ?? "", dbv = usedOn[b.id] ?? "";
    return da < dbv ? -1 : da > dbv ? 1 : 0;
  });
}

// ── Slumpa: ersättare för EN dag (api/replace-recipe.js) ──────────────────────
// Ren funktion: returnerar kandidat-id i prioritetsordning (bästa först) så att
// både bytet och en ev. förhandsvisning kan använda samma lista.
//
// Tidigare byggdes poolen bara på tagg + proteintak — testad-status och
// proteinklass ignorerades, och "längst sedan"-viktningen gav aldrig lagade
// (nästan alltid otestade) recept högst vikt. Ett byte av en testad kycklingrätt
// blev då oftast en otestad vegorätt. Nu en kaskad där varje nivå släpper ett krav:
//   1. samma testad-status + exakt samma protein
//   2. samma testad-status + samma klass (vegetariskt vs inte)
//   3. valfri testad-status + samma klass
//   4. valfri klass
// …alla med rätt dagtagg (vardag30/helg60) och inom proteintaket. Därefter de
// gamla reservnivåerna (släpp taket, släpp taggen, släpp båda). Inom varje nivå
// viktas "längst sedan". excludeIds (nyss utbytta recept samma dag) hålls borta
// överallt utom i sista utvägen — det stoppar pingpong A→X→A. Nuvarande recept
// returneras aldrig.
export const MAX_PROTEIN_REPLACE = 2;

export function pickReplacementOrder(recipes, {
  current = null, weekIds = [], recentIds = new Set(), usedOn = {}, proteinCount = {},
  date, excludeIds = [], rng = Math.random, today = isoToday(),
} = {}) {
  const currentId = current?.id ?? null;
  const weekSet = new Set(weekIds);
  const excluded = new Set(excludeIds);
  const dow = new Date(date + "T12:00:00").getDay();
  const requiredTag = dow === 0 || dow === 6 ? "helg60" : "vardag30";

  const hasTag = (r) => (r.tags || []).includes(requiredTag);
  const underCap = (r) => (proteinCount[r.protein] || 0) < MAX_PROTEIN_REPLACE;
  const isVeg = (r) => r.protein === "vegetarisk";
  const sameTested = (r) => !!r.tested === !!current.tested;
  const sameClass = (r) => isVeg(r) === isVeg(current);
  const sameProtein = (r) => r.protein === current.protein;

  const base = recipes.filter((r) =>
    r.id !== currentId && !weekSet.has(r.id) && !recentIds.has(r.id) && !excluded.has(r.id));
  const strict = base.filter((r) => hasTag(r) && underCap(r));

  const tiers = [];
  if (current) {
    tiers.push(strict.filter((r) => sameTested(r) && sameProtein(r)));
    tiers.push(strict.filter((r) => sameTested(r) && sameClass(r)));
    tiers.push(strict.filter(sameClass));
  }
  tiers.push(strict);
  tiers.push(base.filter(hasTag));
  tiers.push(base.filter(underCap));
  tiers.push(base);

  const order = [];
  const seen = new Set();
  const add = (list) => {
    for (const r of list) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      order.push(r.id);
    }
  };
  for (const tier of tiers) add(weightedOrder(tier, (r) => recencyWeight(usedOn[r.id], today), rng));
  // Sista utvägen: allt utom nuvarande och veckans — längst sedan först, lika
  // datum slumpas (ingen deterministisk pingpong).
  add(byLongestAgo(recipes.filter((r) => r.id !== currentId && !weekSet.has(r.id)), usedOn, rng));
  return order;
}

// Slumpa med förhandsval (preview): klienten har redan visat en kandidat ur
// en tidigare preview. Servern räknar om den ordnade poolen (samma filter som
// ovan) och godtar kandidaten bara om den fortfarande är tillåten — annars
// (t.ex. om veckan ändrats under tiden) tar den sitt eget förstaval. null =
// inget tillgängligt recept alls.
export function chooseRandomConfirm(poolIds, requestedId) {
  const order = poolIds || [];
  const req = requestedId == null ? NaN : parseInt(requestedId, 10);
  if (!Number.isNaN(req) && order.includes(req)) return req;
  return order.length ? order[0] : null;
}

export function selectRecipes(recipes, dayList, constraints, recentIds = new Set(), usedOn = {}, savingsById = null, currentSeason = null, today = isoToday()) {
  const MAX_PER_PROTEIN = 2;

  const fresh = recipes.filter((r) => !recentIds.has(r.id));
  let pool;
  if (fresh.length >= dayList.length) {
    pool = fresh;
  } else {
    const needed = dayList.length - fresh.length;
    const oldest = byLongestAgo(recipes.filter((r) => recentIds.has(r.id)), usedOn)
      .slice(0, needed);
    pool = [...fresh, ...oldest];
  }
  // Sista utvägen när en delpool (veg, helg, Ture, testade) är uttömd trots att
  // poolen totalt räckte. Tidigare loopades `recipes` i databasordning — då vann
  // samma nyss lagade recept varje gång. Nu: längst sedan använt först.
  const lastResort = byLongestAgo(recipes, usedOn);
  if (pool.length === 0) pool = recipes;

  const weekdayPool = bucketBySaving(pool.filter((r) => r.tags.includes("vardag30")), savingsById, currentSeason, usedOn, today);
  const weekendPool = bucketBySaving(pool.filter((r) => r.tags.includes("helg60")), savingsById, currentSeason, usedOn, today);

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
    for (const r of lastResort) {
      if (usedIds.has(r.id)) continue;
      if (!tureOk(r)) continue;
      if (!vegOk(r)) continue;
      if (!underUntestedLimit(r)) continue;
      return r;
    }
    for (const r of lastResort) {
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
