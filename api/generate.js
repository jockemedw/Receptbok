import { buildShoppingList } from "./_shared/shopping-builder.js";
import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId, fetchTargetServings } from "./_shared/supabase.js";
import { fetchOffersFromWillys } from "./willys-offers.js";
import { matchRecipe, buildDealCandidates } from "./_shared/willys-matcher.js";
import { selectRecipes, bucketBySaving, hasTure } from "./_shared/select-recipes.js";
import { notifyAlert } from "./_shared/alert.js";

function getCurrentSeason(dateStr) {
  const month = new Date(dateStr).getMonth() + 1;
  if (month >= 3 && month <= 5) return "vår";
  if (month >= 6 && month <= 8) return "sommar";
  if (month >= 9 && month <= 11) return "höst";
  return "vinter";
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
    .select("id, title, time, tags, protein, tested, ingredients, seasons, servings")
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
    servings: r.servings ?? null,
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
export async function archiveOldPlan(newStartDate, householdId, database = db) {
  const { data: plans } = await database
    .from("weekly_plans")
    .select("id, start_date, end_date")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .limit(1);
  if (!plans?.length) return;

  const oldPlan = plans[0];
  const { data: daysToArchive } = await database
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
    await database.from("plan_archives").insert({
      household_id: householdId,
      start_date: daysToArchive[0].date,
      end_date: daysToArchive[daysToArchive.length - 1].date,
      archived_at: new Date().toISOString(),
      days: archiveDays,
    });

    // Trimma plan_archives — behåll bara plans med endDate inom 30 dagar bakåt
    const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const { data: old } = await database
      .from("plan_archives")
      .select("id, end_date")
      .eq("household_id", householdId)
      .lt("end_date", cutoff);
    if (old?.length) {
      await database.from("plan_archives").delete().in("id", old.map((r) => r.id));
    }
  }

  // Deaktivera gammal plan + ta bort dess meal_days (de är arkiverade eller överskrivna)
  await database.from("meal_days").delete().eq("plan_id", oldPlan.id);
  await database.from("weekly_plans").update({ is_active: false }).eq("id", oldPlan.id);
}

export async function savePlanToSupabase(weeklyPlan, householdId, database = db) {
  const today = new Date().toISOString();
  // Plan-raden skapas INAKTIV. Den tas i bruk (activatePlan) först när alla
  // dagar är skrivna — så att en aktiv plan ALDRIG kan sakna sina dagar (ger
  // annars en tom matsedel utan åtgärdsknappar om dag-skrivningen glappar).
  const { data: newPlan, error: planErr } = await database
    .from("weekly_plans")
    .insert({
      household_id: householdId,
      start_date: weeklyPlan.startDate,
      end_date: weeklyPlan.endDate,
      generated_at: today,
      is_active: false,
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

  // UPSERT på (household_id, date): regenerering av en vecka skriver då rent över
  // den föregående (generade) planens dagar i stället för att krocka med PK:n.
  // Custom-dagar (plan_id = null) finns ALDRIG i mealDayRows (de utesluts redan i
  // handlern), så en upsert kan aldrig råka skriva över familjens egna dagar.
  const { error: daysErr } = await database
    .from("meal_days")
    .upsert(mealDayRows, { onConflict: "household_id,date" });
  if (daysErr) {
    // Städa bort den halv-skrivna plan-raden så den aldrig kan dyka upp som
    // en tom aktiv plan. Den gamla planen är ännu orörd (arkiveras senare).
    await database.from("weekly_plans").delete().eq("id", newPlan.id);
    throw daysErr;
  }

  return newPlan.id;
}

// Tar en färdigskriven (inaktiv) plan i bruk allra sist: stäng av alla andra
// aktiva planer och slå på den nya i ett svep. Eftersom dagarna redan sitter har
// en aktiv plan alltid sitt innehåll.
export async function activatePlan(planId, householdId, database = db) {
  await database.from("weekly_plans").update({ is_active: false })
    .eq("household_id", householdId).eq("is_active", true);
  const { error } = await database.from("weekly_plans").update({ is_active: true }).eq("id", planId);
  if (error) throw error;
}

// True om felet betyder "funktionen finns inte i Postgres ännu" — dvs SQL-filen
// i db/migrations/001_activate_plan_atomic.sql inte har körts av Joakim än.
// PostgREST svarar med code PGRST202 (eller en 404/"Could not find the function"-
// text beroende på klientversion) i det läget.
export function isMissingRpcError(error) {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  const msg = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  return msg.includes("could not find the function") || msg.includes("404");
}

// Atomär plan-aktivering (backlog-punkt #3, CLAUDE.md hård regel "Befintlig
// veckoplan får aldrig förstöras"): archiveOldPlan + activatePlan i EN
// Postgres-transaktion via RPC:n activate_plan_atomic (db/migrations/001_*.sql)
// — dör processen mitt i går hela bytet tillbaka i stället för att lämna
// hushållet med noll aktiva planer.
//
// Rollout-säkerhet: RPC:n finns bara i Postgres när Joakim manuellt har kört
// SQL-filen i Supabase SQL Editor (inget migrationsverktyg i det här projektet).
// Push till main deployas direkt (CLAUDE.md), så koden måste fungera BÅDE före
// och efter att SQL:en är körd. Vi försöker RPC:n först; om PostgREST svarar att
// funktionen saknas (isMissingRpcError) faller vi tillbaka till den gamla
// tvåstegs-JS-vägen (archiveOldPlan + activatePlan var för sig) — exakt samma
// beteende som innan den här ändringen. Atomiciteten slår på automatiskt så
// fort SQL:en är körd, utan kodändring.
export async function activatePlanAtomic(newPlanId, startDate, householdId, database = db) {
  const { error } = await database.rpc("activate_plan_atomic", {
    p_household_id: householdId,
    p_new_plan_id: newPlanId,
    p_new_start_date: startDate,
  });
  if (!error) return { usedRpc: true };

  if (!isMissingRpcError(error)) throw error;

  // Fallback: RPC:n är inte upplagd i Supabase än — kör den gamla,
  // icke-atomära tvåstegsvägen så produktionen aldrig går sönder.
  try { await archiveOldPlan(startDate, householdId, database); } catch (e) { console.error("archive error:", e); }
  await activatePlan(newPlanId, householdId, database);
  return { usedRpc: false };
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
  const today = new Date().toISOString().slice(0, 10);
  // Skapa listan INAKTIV, skriv varorna, aktivera SIST (speglar activatePlan) — så
  // en misslyckad vary-insert aldrig lämnar familjen med en aktiv men tom lista.
  // Den gamla listan är kvar aktiv tills den nya är komplett.
  const { data: newList, error: listErr } = await db
    .from("shopping_lists")
    .insert({
      household_id: householdId,
      start_date: startDate,
      end_date: endDate,
      generated_at: today,
      recipe_items_moved_at: null,
      is_active: false,
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

  // Ta den färdiga listan i bruk allra sist: stäng av gamla, slå på nya.
  await db.from("shopping_lists").update({ is_active: false })
    .eq("household_id", householdId).eq("is_active", true);
  const { error: actErr } = await db.from("shopping_lists")
    .update({ is_active: true }).eq("id", newList.id);
  if (actErr) throw actErr;

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

  // Servervalidering (frontenden begränsar redan, men API:t ska stå på egna ben):
  // max 15 dagar, och inställningsvärdena kan aldrig överstiga antalet dagar.
  const spanDays = Math.round(
    (new Date(end_date + "T12:00:00") - new Date(start_date + "T12:00:00")) / 864e5
  ) + 1;
  if (spanDays > 15) {
    return res.status(400).json({ error: "Max 15 dagar per matsedel — välj ett kortare spann." });
  }
  const clampCount = (v) => Math.min(Math.max(parseInt(v) || 0, 0), spanDays);

  const constraints = {
    allowed_proteins: allowed_proteins.split(",").map((p) => p.trim()).filter(Boolean),
    untested_count: clampCount(untested_count),
    vegetarian_days: clampCount(vegetarian_days),
    ture_days: clampCount(ture_days),
  };

  const householdId = await getHouseholdId();
  const [allRecipes, historyData, existingShop, customRows] = await Promise.all([
    fetchRecipes(householdId),
    fetchHistory(householdId),
    skip_shopping ? Promise.resolve(null) : fetchExistingShoppingList(householdId),
    // Dagar familjen redan planerat SJÄLVA (custom days, plan_id = null) i
    // intervallet. De får ALDRIG skrivas över av genereringen (hård regel) — och
    // deras meal_days-rad ligger redan på (household_id, date), så en insert skulle
    // dessutom krocka med primärnyckeln. Generatorn hoppar därför över dem helt och
    // fyller bara de dagar familjen inte redan planerat.
    db.from("meal_days").select("date").eq("household_id", householdId)
      .is("plan_id", null).gte("date", start_date).lte("date", end_date),
  ]);
  const customDates = new Set((customRows?.data || []).map((r) => r.date));

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
  // Blockerade OCH egen-planerade (custom) dagar utesluts ur receptvalet.
  const activeDays = allDays.filter((d) => !blockedSet.has(d.date) && !customDates.has(d.date));

  // Om varenda dag i intervallet redan är planerad (custom) eller blockerad finns
  // inget att generera — begripligt fel i stället för en tom plan/krasch.
  if (activeDays.length === 0) {
    return res.status(400).json({ error: "Alla dagar i intervallet är redan planerade eller blockerade — inget att generera." });
  }

  let savingsById = null;
  // Tyst degradering: prisoptimeringen vilar på en oofficiell Willys-feed som kan
  // sluta svara/ändra format utan förvarning — då blir resultatet 0 erbjudanden,
  // vilket ser ut som "inga reor" snarare än "bruten". pricingDegraded flaggar det
  // (returneras till UI:t) och skickar ett valfritt webhook-pling (notifyAlert).
  let pricingDegraded = false;
  if (optimize_prices) {
    try {
      // Samma feed-klient som /api/willys-offers och dispatchen (ingen egen
      // URL-literal); butik styrs av WILLYS_STORE_ID precis som i dispatchen.
      const store = process.env.WILLYS_STORE_ID || "2160";
      const offers = await fetchOffersFromWillys(store, (url, opts) =>
        fetch(url, { ...opts, signal: AbortSignal.timeout(5000) }));
      if (offers.length === 0) pricingDegraded = true; // 200 men inget parsebart = trolig API-ändring
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
                loyalty: offer.loyalty || false,
                bulk: offer.bulk || false,
                regularPrice: offer.regularPrice, promoPrice: offer.promoPrice,
                savingPerUnit: offer.savingPerUnit, validUntil: offer.validUntil,
              });
            }
          }
          savingsById[r.id] = { total: m.totalSaving, matches: [...byCanon.values()] };
        }
      }
    } catch {
      savingsById = null;
      pricingDegraded = true; // icke-ok HTTP/timeout/nätfel/parsefel
    }
    if (pricingDegraded) {
      await notifyAlert(`Receptboken: prisoptimering gav inga erbjudanden (${start_date}). Willys-feeden kan vara bruten.`);
    }
    // Sparar utfallet så appen kan visa en banner nästa gång NÅGON öppnar den,
    // oavsett om just den personen genererar en ny matsedel (backlog #2,
    // reaktiv in-app-variant vald 2026-07-03 i stället för webhook-larm).
    // Saknas tabellen (migration 004 ej körd) sväljs felet — ingen regression.
    const statusRow = { household_id: householdId, last_checked_at: new Date().toISOString(), degraded: pricingDegraded };
    if (!pricingDegraded) statusRow.last_success_at = statusRow.last_checked_at;
    await db.from("pricing_status").upsert(statusRow); // tabellen saknas → svaret innehåller bara ett fel, ingen krasch
  }

  const currentSeason = season_weight ? getCurrentSeason(start_date) : null;
  const selectedDays = selectRecipes(filtered, activeDays, constraints, recentIds, historyData.usedOn || {}, savingsById, currentSeason);

  const days = allDays
    // Egen-planerade dagar hoppas över helt — de har redan sin meal_days-rad och
    // rörs inte av genereringen (bevaras + ingen PK-krock).
    .filter((d) => !customDates.has(d.date))
    .map((d) => {
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

  // "Veckans fynd": rea-recept som inte hamnade i planen, för popupen i UI:t.
  let deals = null;
  if (optimize_prices && savingsById) {
    const chosenIds = days.map((d) => d.recipeId).filter(Boolean);
    const recipeMap = new Map(filtered.map((r) => [r.id, r]));
    const candidates = buildDealCandidates(savingsById, chosenIds, (id) => recipeMap.get(id));
    if (candidates.length) deals = { candidates };
  }

  if (dry_run) {
    return res.status(200).json({ ok: true, dry_run: true, days: days.length, weeklyPlan, deals, pricingDegraded });
  }

  const selectedIds = days.map((d) => d.recipeId).filter(Boolean);
  const targetServings = skip_shopping ? null : await fetchTargetServings(householdId);
  const shoppingCategories = skip_shopping ? null : buildShoppingList(selectedIds, allRecipes, { targetServings });

  // Skriv nya planen + alla dagar (inaktiv). Glappar dag-skrivningen kastas det
  // här och den gamla aktiva planen är fortfarande orörd — användaren behåller
  // sin matsedel i stället för att få en tom.
  const newPlanId = await savePlanToSupabase(weeklyPlan, householdId);
  // Först nu, när dagarna sitter: byt aktiv plan atomärt (RPC, med JS-fallback
  // — se activatePlanAtomic ovan).
  await activatePlanAtomic(newPlanId, start_date, householdId);
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

  return res.status(200).json({ ok: true, days: days.length, weeklyPlan, shoppingList, deals, pricingDegraded });
});
