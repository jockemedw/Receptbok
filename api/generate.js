import { buildShoppingList } from "./_shared/shopping-builder.js";
import { createHandler } from "./_shared/handler.js";
import { readFile, readFileRaw, writeFile } from "./_shared/github.js";
import { REPO_OWNER, REPO_NAME, BRANCH } from "./_shared/constants.js";
import { fetchHistory, recentlyUsedIds, shuffle } from "./_shared/history.js";
import { normalizeOffers } from "./willys-offers.js";
import { matchRecipe } from "./_shared/willys-matcher.js";

const WILLYS_URL = "https://www.willys.se/search/campaigns/online?q=2160&type=PERSONAL_GENERAL&page=0&size=500";
const SAVING_THRESHOLD = 10; // Recept med ≥10 kr besparing bucketas först i poolen.

function getCurrentSeason(dateStr) {
  const month = new Date(dateStr).getMonth() + 1;
  if (month >= 3 && month <= 5) return "vår";
  if (month >= 6 && month <= 8) return "sommar";
  if (month >= 9 && month <= 11) return "höst";
  return "vinter";
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

const DAY_NAMES = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];

// ── Domänlogik (ägs av denna slice) ─────────────────────────────────────────

function buildDayList(startDate, endDate) {
  const days = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    const dow = current.getDay(); // 0=sun,1=mon...6=sat
    const weekday = dow === 0 ? 6 : dow - 1; // convert to mon=0..sun=6
    days.push({
      date: current.toISOString().slice(0, 10),
      day: DAY_NAMES[weekday],
      is_weekend: weekday >= 5,
    });
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function filterRecipes(recipes, constraints) {
  const allowed = new Set(constraints.allowed_proteins);
  const { untested_count } = constraints;

  return recipes.filter((r) => {
    if (!allowed.has(r.protein)) return false;
    if (!untested_count && !r.tested) return false;
    const tags = r.tags || [];
    return tags.includes("vardag30") || tags.includes("helg60");
  });
}

async function fetchRecipes() {
  const data = await readFileRaw("recipes.json");
  return data.recipes.map((r) => ({
    id: r.id,
    title: r.title,
    time: r.time,
    tags: r.tags || [],
    protein: r.protein,
    tested: r.tested || false,
    ingredients: r.ingredients || [],
    seasons: r.seasons || [],
  }));
}

async function fetchShoppingList() {
  try {
    const data = await readFileRaw("shopping-list.json");
    return data;
  } catch {
    return null;
  }
}

function updateHistory(history, newIds, date) {
  const usedOn = { ...(history.usedOn || {}) };
  for (const id of newIds) usedOn[String(id)] = date;
  return { usedOn };
}

// Arkivera tidigare plan-dagar innan weekly-plan.json skrivs över.
// Plockar dagar som slutar före nya planens start, bundlar dem som en plan-batch
// och lägger i plan-archive.json. Trimmar batches där alla dagar är äldre än 30 dagar.
async function archiveOldPlan(newStartDate, pat) {
  let oldPlan = null;
  try {
    ({ content: oldPlan } = await readFile("weekly-plan.json", pat));
  } catch { return; }
  if (!oldPlan?.days?.length) return;

  const daysToArchive = oldPlan.days.filter((d) => d.date < newStartDate && d.recipeId);
  if (daysToArchive.length === 0) return;

  let archive = { plans: [] };
  try {
    ({ content: archive } = await readFile("plan-archive.json", pat));
    if (!archive?.plans) archive = { plans: [] };
  } catch { /* filen finns inte ännu */ }

  archive.plans.push({
    startDate: daysToArchive[0].date,
    endDate: daysToArchive[daysToArchive.length - 1].date,
    archivedAt: new Date().toISOString(),
    days: daysToArchive.map((d) => ({
      date: d.date,
      day: d.day,
      recipe: d.recipe,
      recipeId: d.recipeId,
      ...(d.saving ? { saving: d.saving } : {}),
    })),
  });

  // Trimma: behåll bara plans där någon dag är inom de senaste 30 dagarna.
  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  archive.plans = archive.plans.filter((p) => p.endDate >= cutoff);

  await writeFile("plan-archive.json", archive, pat, `Arkivera plan ${daysToArchive[0].date}–${daysToArchive[daysToArchive.length - 1].date}`);
}

// Bucketar en pool i två grupper (hög besparing först, övriga efter),
// slumpar inom varje grupp. Ger optimeringen en chans att välja besparande
// recept utan att bryta proteinbalans/veg-slot-logiken.
function bucketBySaving(pool, savingsById) {
  if (!savingsById) return shuffle(pool);
  const high = [], low = [];
  for (const r of pool) {
    const total = savingsById[r.id]?.total || 0;
    if (total >= SAVING_THRESHOLD) high.push(r);
    else low.push(r);
  }
  return [...shuffle(high), ...shuffle(low)];
}

// ── Deterministisk receptväljare ─────────────────────────────────────────────
const hasTure = (r) => (r.tags || []).some((t) => t.toLowerCase() === "ture");

function selectRecipes(recipes, dayList, constraints, recentIds = new Set(), usedOn = {}, savingsById = null, currentSeason = null) {
  const MAX_PER_PROTEIN = 2;

  // ── 1. Historikfiltrering ─────────────────────────────────────────────────
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

  // ── 2. Dela upp poolen per dag-typ ────────────────────────────────────────
  const weekdayPool = applySeasonWeight(bucketBySaving(pool.filter((r) => r.tags.includes("vardag30")), savingsById), currentSeason);
  const weekendPool = applySeasonWeight(bucketBySaving(pool.filter((r) => r.tags.includes("helg60")), savingsById), currentSeason);

  // ── 3. Ture-dagar + Vegetariska dagar ──────────────────────────────────────
  const tureCount = constraints.ture_days;
  const turePool = pool.filter(hasTure);
  const shuffledIndices = shuffle(dayList.map((_, i) => i));
  const tureDaySet = new Set(shuffledIndices.slice(0, tureCount));

  const vegCount = constraints.vegetarian_days;
  const remainingIndices = shuffledIndices.filter((i) => !tureDaySet.has(i));
  const vegDaySet = new Set(remainingIndices.slice(0, vegCount));

  const maxVeg = Math.max(2, vegCount);

  // ── 4. Fyll varje dag ────────────────────────────────────────────────────
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
    // Spara ture-taggade recept åt ture-dagar: på icke-ture-dagar, undvik
    // ture-recept i de första looparna (släpps i loop 2+).
    const saveTure = tureCount > 0 && !mustBeTure;
    const preferNonTure = (r) => !saveTure || !hasTure(r);
    // Loop 1: full constraints (protein limits + untested limit + save ture)
    for (const r of dayPool) {
      if (usedIds.has(r.id)) continue;
      if (!tureOk(r)) continue;
      if (!vegOk(r)) continue;
      if (!preferNonTure(r)) continue;
      if ((proteinUsage[r.protein] || 0) >= maxForProtein(r.protein)) continue;
      if (!underUntestedLimit(r)) continue;
      return r;
    }
    // Loop 2: relax protein limits, keep ture-preference + untested limit
    for (const r of dayPool) {
      if (usedIds.has(r.id)) continue;
      if (!tureOk(r)) continue;
      if (!vegOk(r)) continue;
      if (!preferNonTure(r)) continue;
      if (!underUntestedLimit(r)) continue;
      return r;
    }
    // Loop 3: altPool, keep ture-preference + untested limit
    for (const r of altPool) {
      if (usedIds.has(r.id)) continue;
      if (!tureOk(r)) continue;
      if (!vegOk(r)) continue;
      if (!preferNonTure(r)) continue;
      if (!underUntestedLimit(r)) continue;
      return r;
    }
    // Loop 4: all recipes, keep untested limit
    for (const r of recipes) {
      if (usedIds.has(r.id)) continue;
      if (!tureOk(r)) continue;
      if (!vegOk(r)) continue;
      if (!underUntestedLimit(r)) continue;
      return r;
    }
    // Loop 5: last resort — ignore untested limit (tested pool exhausted)
    for (const r of recipes) {
      if (usedIds.has(r.id)) continue;
      if (!tureOk(r)) continue;
      if (!vegOk(r)) continue;
      return r;
    }
    return null;
  }

  // Bearbeta ture-dagar före vanliga dagar så de får förstval på ture-recepten.
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

// ── Handler ─────────────────────────────────────────────────────────────────

export default createHandler(async (req, res, pat) => {
  const {
    start_date,
    end_date,
    allowed_proteins = "fisk,kyckling,kött,fläsk,vegetarisk",
    untested_count = 0,
    vegetarian_days = 0,
    ture_days = 0,
    skip_shopping = false,
    blocked_dates = [],
    optimize_prices = false,
    season_weight = false,
    dry_run = false,
  } = req.body;

  if (!start_date || !end_date) {
    return res.status(400).json({ error: "start_date och end_date krävs" });
  }
  if (start_date > end_date) {
    return res.status(400).json({ error: "Startdatum måste vara före slutdatum." });
  }

  const constraints = {
    allowed_proteins: allowed_proteins.split(",").map((p) => p.trim()).filter(Boolean),
    untested_count: parseInt(untested_count) || 0,
    vegetarian_days: parseInt(vegetarian_days) || 0,
    ture_days: parseInt(ture_days) || 0,
  };

  const fetches = [fetchRecipes(), fetchHistory(pat)];
  if (!skip_shopping) fetches.push(fetchShoppingList());
  const [allRecipes, historyData, existingShop] = await Promise.all(fetches);

  const filtered = filterRecipes(allRecipes, constraints);

  if (filtered.length === 0) {
    return res.status(400).json({ error: "Inga recept kvar efter filtrering — justera inställningarna." });
  }

  if (constraints.ture_days > 0) {
    const tureAvailable = filtered.filter(hasTure).length;
    if (tureAvailable === 0) {
      return res.status(400).json({ error: "Du har valt Ture-dagar men inga recept har taggen \"ture\". Tagga barnvänliga recept med \"ture\" först, eller sätt Ture-dagar till 0." });
    }
    if (tureAvailable < constraints.ture_days) {
      return res.status(400).json({ error: `Du har valt ${constraints.ture_days} Ture-dagar men bara ${tureAvailable} recept har taggen "ture". Minska antalet eller tagga fler recept.` });
    }
  }

  const recentIds = recentlyUsedIds(historyData);
  const allDays = buildDayList(start_date, end_date);
  const blockedSet = new Set(blocked_dates);
  const activeDays = allDays.filter((d) => !blockedSet.has(d.date));

  // Prisoptimering: hämta Willys-erbjudanden och räkna ut besparing per recept.
  // Fallar graciöst — om hämtningen misslyckas körs vanligt urval utan optimering.
  let savingsById = null;
  if (optimize_prices) {
    try {
      const upstream = await fetch(WILLYS_URL, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Receptbok/1.0 (familjematplanering)",
        },
        signal: AbortSignal.timeout(5000),
      });
      if (upstream.ok) {
        const raw = await upstream.json();
        const offers = normalizeOffers(raw.results || []);
        savingsById = {};
        for (const r of filtered) {
          const m = matchRecipe(r, offers);
          if (m.totalSaving > 0) {
            // Plocka en match per canon (högst savingPerUnit vinner) — samma
            // logik som totalSaving i willys-matcher. Frontend visar produktnamn,
            // priser och giltighet i popovern.
            const byCanon = new Map();
            for (const { canon, offer } of m.matches) {
              const cur = byCanon.get(canon);
              if (!cur || (offer.savingPerUnit || 0) > (cur.savingPerUnit || 0)) {
                byCanon.set(canon, {
                  canon,
                  name: offer.name,
                  brandLine: offer.brandLine || null,
                  regularPrice: offer.regularPrice,
                  promoPrice: offer.promoPrice,
                  savingPerUnit: offer.savingPerUnit,
                  validUntil: offer.validUntil,
                });
              }
            }
            savingsById[r.id] = {
              total: m.totalSaving,
              matches: [...byCanon.values()],
            };
          }
        }
      }
    } catch {
      savingsById = null;
    }
  }

  const currentSeason = season_weight ? getCurrentSeason(start_date) : null;
  const selectedDays = selectRecipes(filtered, activeDays, constraints, recentIds, historyData.usedOn || {}, savingsById, currentSeason);

  // Merge: blockerade dagar infogas med recipe: null
  const days = allDays.map((d) => {
    if (blockedSet.has(d.date)) {
      return { date: d.date, day: d.day, recipe: null, recipeId: null, blocked: true };
    }
    const picked = selectedDays.find((s) => s.date === d.date);
    if (picked && savingsById && savingsById[picked.recipeId]) {
      const entry = savingsById[picked.recipeId];
      return {
        ...picked,
        saving: Math.round(entry.total),
        savingMatches: entry.matches,
      };
    }
    return picked;
  });

  const today = new Date().toISOString().slice(0, 10);
  const weeklyPlan = { generated: today, startDate: start_date, endDate: end_date, days };
  const updatedHistory = updateHistory(historyData, days.map((d) => d.recipeId).filter(Boolean), today);
  const commitMsg = `Matsedel ${today} — autogenererad`;

  const selectedIds = days.map((d) => d.recipeId).filter(Boolean);
  const shoppingCategories = skip_shopping ? null : buildShoppingList(selectedIds, allRecipes);
  const shoppingList = skip_shopping ? null : {
    generated: today, startDate: start_date, endDate: end_date,
    recipeItems: shoppingCategories,
    recipeItemsMovedAt: null,
    manualItems: existingShop?.manualItems || [],
    checkedItems: existingShop?.checkedItems || {},
  };

  if (dry_run) {
    return res.status(200).json({ ok: true, dry_run: true, days: days.length, weeklyPlan, shoppingList });
  }

  // Arkivera den gamla planens passerade dagar innan vi skriver över weekly-plan.json.
  // Fallar tyst — arkiveringen får aldrig blockera en generering.
  try { await archiveOldPlan(start_date, pat); } catch (e) { console.error("archive error:", e); }

  const writes = [
    writeFile("weekly-plan.json", weeklyPlan, pat, commitMsg),
    writeFile("recipe-history.json", updatedHistory, pat, commitMsg),
  ];
  if (shoppingList) writes.push(writeFile("shopping-list.json", shoppingList, pat, commitMsg));
  await Promise.all(writes);

  return res.status(200).json({ ok: true, days: days.length, weeklyPlan, shoppingList });
});
