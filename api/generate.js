import { buildShoppingList } from "./_shared/shopping-builder.js";
import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";
import { shuffle } from "./_shared/history.js";
import { normalizeOffers } from "./willys-offers.js";
import { matchRecipe } from "./_shared/willys-matcher.js";

const WILLYS_URL = "https://www.willys.se/search/campaigns/online?q=2160&type=PERSONAL_GENERAL&page=0&size=500";
const SAVING_THRESHOLD = 10;

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

function buildDayList(startDate, endDate) {
  const days = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    const dow = current.getDay();
    const weekday = dow === 0 ? 6 : dow - 1;
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

async function fetchRecipes(householdId) {
  const { data, error } = await db
    .from("recipes")
    .select("id, title, time, tags, protein, tested, ingredients, seasons")
    .eq("household_id", householdId);
  if (error) throw error;
  return (data || []).map((r) => ({
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

async function fetchHistory(householdId) {
  const { data } = await db
    .from("recipe_history")
    .select("recipe_id, used_on")
    .eq("household_id", householdId);
  const usedOn = {};
  for (const row of (data || [])) {
    usedOn[String(row.recipe_id)] = row.used_on;
  }
  return { usedOn };
}

function recentlyUsedIds(history, days = 14) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const ids = new Set();
  for (const [id, date] of Object.entries(history.usedOn || {})) {
    if (date >= cutoffStr) ids.add(parseInt(id, 10));
  }
  return ids;
}

async function fetchExistingShoppingList(householdId) {
  const { data: lists } = await db
    .from("shopping_lists")
    .select("id, recipe_items_moved_at")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .limit(1);
  if (!lists?.length) return null;

  const list = lists[0];
  const { data: items } = await db
    .from("shopping_items")
    .select("name, checked")
    .eq("list_id", list.id)
    .eq("source", "manual");

  const manualItems = (items || []).map((i) => i.name);
  const checkedItems = {};
  (items || []).filter((i) => i.checked).forEach((i) => {
    checkedItems[`manual::${i.name}`] = true;
  });

  return { id: list.id, manualItems, checkedItems };
}

// Arkiverar plan-dagar som ligger före newStartDate i plan_archives,
// sedan deaktiveras den gamla planen.
async function archiveOldPlan(newStartDate, householdId) {
  const { data: plans } = await db
    .from("weekly_plans")
    .select("id, start_date, end_date")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .limit(1);
  if (!plans?.length) return;

  const oldPlan = plans[0];
  const { data: daysToArchive } = await db
    .from("meal_days")
    .select("date, recipe_id, recipe_title_snapshot, saving")
    .eq("plan_id", oldPlan.id)
    .lt("date", newStartDate)
    .not("recipe_id", "is", null)
    .order("date");

  if (daysToArchive?.length) {
    const archiveDays = daysToArchive.map((d) => ({
      date: d.date,
      recipe: d.recipe_title_snapshot,
      recipeId: d.recipe_id,
      ...(d.saving ? { saving: d.saving } : {}),
    }));
    await db.from("plan_archives").insert({
      household_id: householdId,
      start_date: daysToArchive[0].date,
      end_date: daysToArchive[daysToArchive.length - 1].date,
      archived_at: new Date().toISOString(),
      days: archiveDays,
    });

    // Trimma plan_archives — behåll bara plans med endDate inom 30 dagar bakåt
    const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const { data: old } = await db
      .from("plan_archives")
      .select("id, end_date")
      .eq("household_id", householdId)
      .lt("end_date", cutoff);
    if (old?.length) {
      await db.from("plan_archives").delete().in("id", old.map((r) => r.id));
    }
  }

  // Deaktivera gammal plan + ta bort dess meal_days (de är arkiverade eller överskrivna)
  await db.from("meal_days").delete().eq("plan_id", oldPlan.id);
  await db.from("weekly_plans").update({ is_active: false }).eq("id", oldPlan.id);
}

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

const hasTure = (r) => (r.tags || []).some((t) => t.toLowerCase() === "ture");

function selectRecipes(recipes, dayList, constraints, recentIds = new Set(), usedOn = {}, savingsById = null, currentSeason = null) {
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

  const weekdayPool = applySeasonWeight(bucketBySaving(pool.filter((r) => r.tags.includes("vardag30")), savingsById), currentSeason);
  const weekendPool = applySeasonWeight(bucketBySaving(pool.filter((r) => r.tags.includes("helg60")), savingsById), currentSeason);

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

async function savePlanToSupabase(weeklyPlan, householdId) {
  // Deaktivera alla eventuellt kvarvarande aktiva planer (skyddar mot misslyckat archiveOldPlan)
  await db.from("weekly_plans").update({ is_active: false })
    .eq("household_id", householdId).eq("is_active", true);

  const today = new Date().toISOString();
  const { data: newPlan, error: planErr } = await db
    .from("weekly_plans")
    .insert({
      household_id: householdId,
      start_date: weeklyPlan.startDate,
      end_date: weeklyPlan.endDate,
      generated_at: today,
      is_active: true,
    })
    .select()
    .single();
  if (planErr) throw planErr;

  const mealDayRows = weeklyPlan.days.map((d) => ({
    household_id: householdId,
    plan_id: newPlan.id,
    date: d.date,
    recipe_id: d.recipeId || null,
    recipe_title_snapshot: d.recipe || null,
    saving: d.saving || null,
    saving_matches: d.savingMatches || null,
    blocked: d.blocked === true,
    locked: false,
  }));

  const { error: daysErr } = await db.from("meal_days").insert(mealDayRows);
  if (daysErr) throw daysErr;

  return newPlan.id;
}

async function saveHistoryToSupabase(days, householdId) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = days
    .filter((d) => d.recipeId)
    .map((d) => ({ household_id: householdId, recipe_id: d.recipeId, used_on: today }));
  if (!rows.length) return;
  await db.from("recipe_history").upsert(rows, { onConflict: "household_id,recipe_id" });
}

async function saveShoppingListToSupabase(shoppingCategories, existingShop, startDate, endDate, householdId) {
  await db.from("shopping_lists").update({ is_active: false })
    .eq("household_id", householdId).eq("is_active", true);

  const today = new Date().toISOString().slice(0, 10);
  const { data: newList, error: listErr } = await db
    .from("shopping_lists")
    .insert({
      household_id: householdId,
      start_date: startDate,
      end_date: endDate,
      generated_at: today,
      recipe_items_moved_at: null,
      is_active: true,
    })
    .select()
    .single();
  if (listErr) throw listErr;

  const itemRows = [];
  for (const [category, items] of Object.entries(shoppingCategories || {})) {
    (items || []).forEach((name, pos) => {
      itemRows.push({ list_id: newList.id, category, name, source: "recipe", checked: false, position: pos });
    });
  }
  (existingShop?.manualItems || []).forEach((name, idx) => {
    itemRows.push({
      list_id: newList.id,
      category: "Övrigt",
      name,
      source: "manual",
      checked: !!(existingShop?.checkedItems?.[`manual::${name}`]),
      position: idx,
    });
  });

  if (itemRows.length > 0) {
    const { error: itemsErr } = await db.from("shopping_items").insert(itemRows);
    if (itemsErr) throw itemsErr;
  }

  return newList.id;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default createSupabaseHandler(async (req, res) => {
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

  const householdId = await getHouseholdId();
  const [allRecipes, historyData, existingShop] = await Promise.all([
    fetchRecipes(householdId),
    fetchHistory(householdId),
    skip_shopping ? Promise.resolve(null) : fetchExistingShoppingList(householdId),
  ]);

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

  let savingsById = null;
  if (optimize_prices) {
    try {
      const upstream = await fetch(WILLYS_URL, {
        headers: { "Accept": "application/json", "User-Agent": "Receptbok/1.0 (familjematplanering)" },
        signal: AbortSignal.timeout(5000),
      });
      if (upstream.ok) {
        const raw = await upstream.json();
        const offers = normalizeOffers(raw.results || []);
        savingsById = {};
        for (const r of filtered) {
          const m = matchRecipe(r, offers);
          if (m.totalSaving > 0) {
            const byCanon = new Map();
            for (const { canon, offer } of m.matches) {
              const cur = byCanon.get(canon);
              if (!cur || (offer.savingPerUnit || 0) > (cur.savingPerUnit || 0)) {
                byCanon.set(canon, {
                  canon, name: offer.name, brandLine: offer.brandLine || null,
                  regularPrice: offer.regularPrice, promoPrice: offer.promoPrice,
                  savingPerUnit: offer.savingPerUnit, validUntil: offer.validUntil,
                });
              }
            }
            savingsById[r.id] = { total: m.totalSaving, matches: [...byCanon.values()] };
          }
        }
      }
    } catch {
      savingsById = null;
    }
  }

  const currentSeason = season_weight ? getCurrentSeason(start_date) : null;
  const selectedDays = selectRecipes(filtered, activeDays, constraints, recentIds, historyData.usedOn || {}, savingsById, currentSeason);

  const days = allDays.map((d) => {
    if (blockedSet.has(d.date)) {
      return { date: d.date, day: d.day, recipe: null, recipeId: null, blocked: true };
    }
    const picked = selectedDays.find((s) => s.date === d.date);
    if (picked && savingsById && savingsById[picked.recipeId]) {
      const entry = savingsById[picked.recipeId];
      return { ...picked, saving: Math.round(entry.total), savingMatches: entry.matches };
    }
    return picked;
  });

  const today = new Date().toISOString().slice(0, 10);
  const weeklyPlan = { generated: today, startDate: start_date, endDate: end_date, days };

  if (dry_run) {
    return res.status(200).json({ ok: true, dry_run: true, days: days.length, weeklyPlan });
  }

  try { await archiveOldPlan(start_date, householdId); } catch (e) { console.error("archive error:", e); }

  const selectedIds = days.map((d) => d.recipeId).filter(Boolean);
  const shoppingCategories = skip_shopping ? null : buildShoppingList(selectedIds, allRecipes);

  await savePlanToSupabase(weeklyPlan, householdId);
  await saveHistoryToSupabase(days, householdId);

  let shoppingList = null;
  if (!skip_shopping && shoppingCategories) {
    await saveShoppingListToSupabase(shoppingCategories, existingShop, start_date, end_date, householdId);
    shoppingList = {
      generated: today, startDate: start_date, endDate: end_date,
      recipeItems: shoppingCategories,
      recipeItemsMovedAt: null,
      manualItems: existingShop?.manualItems || [],
      checkedItems: existingShop?.checkedItems || {},
    };
  }

  return res.status(200).json({ ok: true, days: days.length, weeklyPlan, shoppingList });
});
