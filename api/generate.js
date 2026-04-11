import { buildShoppingList } from "./_shared/shopping-builder.js";
import { createHandler } from "./_shared/handler.js";
import { readFile, readFileRaw, writeFile } from "./_shared/github.js";
import { REPO_OWNER, REPO_NAME, BRANCH } from "./_shared/constants.js";
import { fetchHistory, recentlyUsedIds, shuffle } from "./_shared/history.js";

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

// ── Deterministisk receptväljare ─────────────────────────────────────────────
function selectRecipes(recipes, dayList, constraints, recentIds = new Set(), usedOn = {}, offerScores = {}) {
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
  const weekdayPool = shuffle(pool.filter((r) => r.tags.includes("vardag30")));
  const weekendPool = shuffle(pool.filter((r) => r.tags.includes("helg60")));

  // ── 3. Vegetariska dagar ──────────────────────────────────────────────────
  const vegCount = constraints.vegetarian_days;
  const vegDaySet = new Set(shuffle(dayList.map((_, i) => i)).slice(0, vegCount));

  const maxVeg = Math.max(2, vegCount);

  // ── 4. Fyll varje dag ────────────────────────────────────────────────────
  const usedIds = new Set();
  const proteinUsage = {};
  const result = [];
  let untestedSoFar = 0;

  const hasOffers = Object.keys(offerScores).length > 0;

  function sortByOffer(candidates) {
    if (hasOffers && candidates.length > 1) {
      candidates.sort((a, b) => (offerScores[b.id] || 0) - (offerScores[a.id] || 0));
    }
    return candidates[0] || null;
  }

  function pick(dayPool, altPool, mustBeVeg) {
    const maxForProtein = (p) => p === "vegetarisk" ? maxVeg : MAX_PER_PROTEIN;

    // Primär pool — alla constraints
    const primary = [];
    for (const r of dayPool) {
      if (usedIds.has(r.id)) continue;
      if (mustBeVeg && r.protein !== "vegetarisk") continue;
      if (!mustBeVeg && r.protein === "vegetarisk") continue;
      if ((proteinUsage[r.protein] || 0) >= maxForProtein(r.protein)) continue;
      if (!r.tested && untestedSoFar >= constraints.untested_count) continue;
      primary.push(r);
    }
    if (primary.length) return sortByOffer(primary);

    // Relaxerad primär — skippa protein/tested-constraints
    const relaxed = [];
    for (const r of dayPool) {
      if (usedIds.has(r.id)) continue;
      if (mustBeVeg && r.protein !== "vegetarisk") continue;
      relaxed.push(r);
    }
    if (relaxed.length) return sortByOffer(relaxed);

    // Alternativ pool
    const alt = [];
    for (const r of altPool) {
      if (usedIds.has(r.id)) continue;
      if (mustBeVeg && r.protein !== "vegetarisk") continue;
      alt.push(r);
    }
    if (alt.length) return sortByOffer(alt);

    // Sista utväg — hela receptlistan
    const any = [];
    for (const r of recipes) {
      if (usedIds.has(r.id)) continue;
      if (mustBeVeg && r.protein !== "vegetarisk") continue;
      any.push(r);
    }
    if (any.length) return sortByOffer(any);

    return null;
  }

  for (let i = 0; i < dayList.length; i++) {
    const day = dayList[i];
    const isVegDay = vegDaySet.has(i);
    const dayPool = day.is_weekend ? weekendPool : weekdayPool;
    const altPool = day.is_weekend ? weekdayPool : weekendPool;
    const recipe = pick(dayPool, altPool, isVegDay);
    if (!recipe) {
      throw new Error(
        `Kunde inte hitta recept för ${day.day} (${day.date}) — ` +
        `${isVegDay ? "vegetarisk " : ""}${day.is_weekend ? "helg" : "vardag"}. ` +
        "Prova att ändra inställningarna."
      );
    }
    usedIds.add(recipe.id);
    proteinUsage[recipe.protein] = (proteinUsage[recipe.protein] || 0) + 1;
    if (!recipe.tested) untestedSoFar++;
    result.push({ date: day.date, day: day.day, recipe: recipe.title, recipeId: recipe.id });
  }

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
    skip_shopping = false,
    blocked_dates = [],
    prefer_offers = true,
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
  };

  const fetches = [fetchRecipes(), fetchHistory(pat)];
  if (!skip_shopping) fetches.push(fetchShoppingList());
  const [allRecipes, historyData, existingShop] = await Promise.all(fetches);

  const filtered = filterRecipes(allRecipes, constraints);

  if (filtered.length === 0) {
    return res.status(400).json({ error: "Inga recept kvar efter filtrering — justera inställningarna." });
  }

  const recentIds = recentlyUsedIds(historyData);

  // Hämta erbjudande-score om prefer_offers är aktivt
  let offerScores = {};
  if (prefer_offers) {
    try {
      const cache = await readFileRaw("offers-cache.json");
      if (cache?.recipeMatches) {
        offerScores = Object.fromEntries(
          Object.entries(cache.recipeMatches).map(([id, m]) => [id, m.offerScore || 0])
        );
      }
    } catch { /* ingen cache — kör utan erbjudanden */ }
  }

  const allDays = buildDayList(start_date, end_date);
  const blockedSet = new Set(blocked_dates);
  const activeDays = allDays.filter((d) => !blockedSet.has(d.date));
  const selectedDays = selectRecipes(filtered, activeDays, constraints, recentIds, historyData.usedOn || {}, offerScores);

  // Merge: blockerade dagar infogas med recipe: null
  const days = allDays.map((d) => {
    if (blockedSet.has(d.date)) {
      return { date: d.date, day: d.day, recipe: null, recipeId: null, blocked: true };
    }
    return selectedDays.find((s) => s.date === d.date);
  });

  const today = new Date().toISOString().slice(0, 10);
  const weeklyPlan = { generated: today, startDate: start_date, endDate: end_date, days };
  const updatedHistory = updateHistory(historyData, days.map((d) => d.recipeId).filter(Boolean), today);
  const commitMsg = `Matsedel ${today} — autogenererad`;

  if (skip_shopping) {
    await Promise.all([
      writeFile("weekly-plan.json", weeklyPlan, pat, commitMsg),
      writeFile("recipe-history.json", updatedHistory, pat, commitMsg),
    ]);
    return res.status(200).json({ ok: true, days: days.length, weeklyPlan, shoppingList: null });
  }

  const selectedIds = days.map((d) => d.recipeId).filter(Boolean);
  const shoppingCategories = buildShoppingList(selectedIds, allRecipes);
  const shoppingList = {
    generated: today, startDate: start_date, endDate: end_date,
    recipeItems: shoppingCategories,
    recipeItemsMovedAt: null,
    manualItems: existingShop?.manualItems || [],
  };

  await Promise.all([
    writeFile("weekly-plan.json", weeklyPlan, pat, commitMsg),
    writeFile("shopping-list.json", shoppingList, pat, commitMsg),
    writeFile("recipe-history.json", updatedHistory, pat, commitMsg),
  ]);

  return res.status(200).json({ ok: true, days: days.length, weeklyPlan, shoppingList });
});
