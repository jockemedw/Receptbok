// Deterministiskt receptval — ren logik, ingen I/O och inga Supabase-beroenden.
// Bröts ut ur api/generate.js (tidigare inline + en drift-benägen testkopia) så
// att både handlern och tests/select-recipes.test.js importerar SAMMA källa.
//
// Pipeline: historikfiltrering (4 veckor via recentIds, se RECENT_WINDOW_DAYS i
// history.js; recept lagade för 2–4 veckor sedan är reserv) → proteinfördelning
// (max 2 per icke-veg-typ) → vardag30/helg60-matchning → säsongsvikt ×
// "längst sedan" × förslagsminne → slump. Se selectRecipes nedan.

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
  const days = (new Date(today + "T12:00:00Z") - new Date(usedOnDate + "T12:00:00Z")) / 864e5;
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
export function bucketBySaving(pool, savingsById, currentSeason = null, usedOn = {}, today = isoToday(), penaltyById = null) {
  // Säsong, "längst sedan" och förslagsminnet (penaltyById, se
  // suggestionPenalties i history.js) viktas INOM varje besparings-bucket i
  // stället för att omsortera hela poolen efteråt — rea-recept ligger
  // fortfarande först (buckets konkateneras high→low); vikterna styr bara
  // ordningen inom.
  const order = (arr) => weightedOrder(arr, (r) =>
    seasonWeight(r, currentSeason) * recencyWeight(usedOn[r.id], today) * (penaltyById?.[r.id] ?? 1));
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
// viktas "längst sedan" × förslagsminnet (penaltyById).
//
// Reserven (Session 154): recept i recentIds (4 veckor) men inte i hardIds
// (2 veckor) — dvs. lagade för 2–4 veckor sedan — kommer med rätt dagtagg och
// inom proteintaket FÖRE nivåerna som släpper testad-status eller taggen.
// Utan hardIds (= recentIds) är reserven tom och ordningen exakt som förr. excludeIds (nyss utbytta recept samma dag) hålls borta
// överallt utom i sista utvägen — det stoppar pingpong A→X→A. Nuvarande recept
// returneras aldrig.
export const MAX_PROTEIN_REPLACE = 2;

export function pickReplacementOrder(recipes, {
  current = null, weekIds = [], recentIds = new Set(), hardIds = recentIds, usedOn = {}, proteinCount = {},
  date, excludeIds = [], rng = Math.random, today = isoToday(), penaltyById = null,
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

  const allowed = (r) => r.id !== currentId && !weekSet.has(r.id) && !excluded.has(r.id);
  const base = recipes.filter((r) => allowed(r) && !recentIds.has(r.id));
  const strict = base.filter((r) => hasTag(r) && underCap(r));
  const reserve = recipes.filter((r) =>
    allowed(r) && recentIds.has(r.id) && !hardIds.has(r.id) && hasTag(r) && underCap(r));

  const tiers = [];
  if (current) {
    tiers.push(strict.filter((r) => sameTested(r) && sameProtein(r)));
    tiers.push(strict.filter((r) => sameTested(r) && sameClass(r)));
    tiers.push(reserve.filter((r) => sameTested(r) && sameClass(r)));
    tiers.push(strict.filter(sameClass));
  }
  tiers.push(strict);
  tiers.push(reserve);
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
  const weight = (r) => recencyWeight(usedOn[r.id], today) * (penaltyById?.[r.id] ?? 1);
  for (const tier of tiers) add(weightedOrder(tier, weight, rng));
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

// opts.coverCanons (Prisoptimera i guiden): Map receptId → Set av de rea-varor
// (canons) familjen valt som receptet använder. Så länge någon vald vara ännu
// saknas i planen föredrar varje dag ett recept som täcker en saknad vara —
// med ALLA vanliga regler kvar (dagtagg, veg-/Ture-dag, proteintak, oprövade).
// Hittas inget sådant fylls dagen som vanligt; anroparen räknar ut vilka varor
// som blev otäckta.
//
// opts.hardIds (Session 154): delmängden av recentIds som lagats/planerats de
// senaste 2 veckorna. recentIds minus hardIds = RESERVEN (lagade för 2–4
// veckor sedan): tar dagens delpool slut tas hellre en reservrätt med alla
// regler kvar (dagtagg, proteintak, oprövade) — längst sedan först — än att
// proteintaket eller dagtaggen släpps. Utan hardIds är reserven tom (som förr).
// opts.penaltyById: förslagsminnet (suggestionPenalties) — vikt i ordningen.
export function selectRecipes(recipes, dayList, constraints, recentIds = new Set(), usedOn = {}, savingsById = null, currentSeason = null, today = isoToday(), opts = {}) {
  const MAX_PER_PROTEIN = 2;
  const coverCanons = opts.coverCanons || null;
  const hardIds = opts.hardIds || recentIds;
  const penaltyById = opts.penaltyById || null;
  const uncovered = new Set();
  if (coverCanons) for (const set of coverCanons.values()) for (const c of set) uncovered.add(c);
  const coversUncovered = (r) => {
    const set = coverCanons?.get(r.id);
    if (!set) return false;
    for (const c of set) if (uncovered.has(c)) return true;
    return false;
  };

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

  const weekdayPool = bucketBySaving(pool.filter((r) => r.tags.includes("vardag30")), savingsById, currentSeason, usedOn, today, penaltyById);
  const weekendPool = bucketBySaving(pool.filter((r) => r.tags.includes("helg60")), savingsById, currentSeason, usedOn, today, penaltyById);
  // Reserven: utanför poolen, inom 4-veckorsfönstret men äldre än 2 veckor.
  // Längst sedan först (ingen slump i ordningen — äldst är bäst här).
  const poolIds = new Set(pool.map((r) => r.id));
  const reserve = byLongestAgo(recipes.filter((r) =>
    !poolIds.has(r.id) && recentIds.has(r.id) && !hardIds.has(r.id)), usedOn);
  const weekdayReserve = reserve.filter((r) => r.tags.includes("vardag30"));
  const weekendReserve = reserve.filter((r) => r.tags.includes("helg60"));

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

  function pick(dayPool, altPool, mustBeVeg, mustBeTure, dayReserve = []) {
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
    if (uncovered.size) {
      for (const r of dayPool) {
        if (usedIds.has(r.id)) continue;
        if (!coversUncovered(r)) continue;
        if (!tureOk(r)) continue;
        if (!vegOk(r)) continue;
        if (!preferNonTure(r)) continue;
        if ((proteinUsage[r.protein] || 0) >= maxForProtein(r.protein)) continue;
        if (!underUntestedLimit(r)) continue;
        return r;
      }
    }
    for (const r of dayPool) {
      if (usedIds.has(r.id)) continue;
      if (!tureOk(r)) continue;
      if (!vegOk(r)) continue;
      if (!preferNonTure(r)) continue;
      if ((proteinUsage[r.protein] || 0) >= maxForProtein(r.protein)) continue;
      if (!underUntestedLimit(r)) continue;
      return r;
    }
    // Reserven (2–4 veckor sedan) med ALLA regler, före nivåerna som släpper
    // proteintaket eller dagtaggen.
    for (const r of dayReserve) {
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
    const dayReserve = day.is_weekend ? weekendReserve : weekdayReserve;
    const recipe = pick(dayPool, altPool, isVegDay, isTureDay, dayReserve);
    if (!recipe) {
      throw new Error(
        `Kunde inte hitta recept för ${day.day} (${day.date}) — ` +
        `${isTureDay ? "ture " : ""}${isVegDay ? "vegetarisk " : ""}${day.is_weekend ? "helg" : "vardag"}. ` +
        "Prova att ändra inställningarna."
      );
    }
    usedIds.add(recipe.id);
    for (const c of coverCanons?.get(recipe.id) || []) uncovered.delete(c);
    proteinUsage[recipe.protein] = (proteinUsage[recipe.protein] || 0) + 1;
    if (!recipe.tested) untestedSoFar++;
    result.push({ date: day.date, day: day.day, recipe: recipe.title, recipeId: recipe.id });
  }

  result.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return result;
}
