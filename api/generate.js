import { buildShoppingList } from "./_shared/shopping-builder.js";

const REPO_OWNER = "jockemedw";
const REPO_NAME = "Receptbok";
const BRANCH = "main";

const DAY_NAMES = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];

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
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/recipes.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Kunde inte hämta receptdatabasen — kontrollera att recipes.json finns i repot.");
  const data = await res.json();
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

// Läser historik via GitHub API (inte raw-URL) för att undvika CDN-cache.
// CDN-cachen är ~60s efter en commit, vilket gör att täta genereringar
// skriver ovanpå gammal data och tappar mellanliggande körningar.
async function fetchHistory(pat) {
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/recipe-history.json?ref=${BRANCH}`;
  const res = await fetch(apiUrl, {
    headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return { usedOn: {} };
  try {
    const data = await res.json();
    const parsed = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
    // Migrering från gammalt format { history: [...] } → nytt { usedOn: { id: date } }
    if (parsed.history && !parsed.usedOn) {
      const usedOn = {};
      for (const entry of parsed.history) {
        for (const id of entry.recipeIds || []) {
          if (!usedOn[id] || entry.date > usedOn[id]) usedOn[id] = entry.date;
        }
      }
      return { usedOn };
    }
    return parsed;
  } catch {
    return { usedOn: {} };
  }
}

async function fetchShoppingList() {
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/shopping-list.json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

// Returnerar Set med recept-ID:n använda de senaste `days` dagarna.
// Nytt format: { usedOn: { "5": "2026-03-25", ... } } — ett datum per recept.
// 14 dagar: med ~12-15 recept per generering ger det god variation utan att
// poolen töms. 28 dagar blockerade för många recept och gav tom pool.
function recentlyUsedIds(history, days = 14) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const ids = new Set();
  for (const [id, date] of Object.entries(history.usedOn || {})) {
    if (date >= cutoffStr) ids.add(parseInt(id, 10));
  }
  return ids;
}

function updateHistory(history, newIds, date) {
  const usedOn = { ...(history.usedOn || {}) };
  for (const id of newIds) usedOn[String(id)] = date;
  return { usedOn };
}

async function writeFileToGitHub(path, content, pat) {
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const headers = {
    Authorization: `token ${pat}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
  };
  const encoded = Buffer.from(JSON.stringify(content, null, 2)).toString("base64");
  const message = `Matsedel ${new Date().toISOString().slice(0, 10)} — autogenererad`;

  for (let attempt = 0; attempt < 3; attempt++) {
    let sha;
    const getRes = await fetch(`${apiUrl}?t=${Date.now()}`, { headers });
    if (getRes.ok) sha = (await getRes.json()).sha;

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({ message, content: encoded, branch: BRANCH, ...(sha ? { sha } : {}) }),
    });
    if (putRes.ok) return;
    if (putRes.status === 409 && attempt < 2) continue; // SHA conflict — retry with fresh SHA
    throw new Error(`Kunde inte spara ${path} — prova att generera igen.`);
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Deterministisk receptväljare ─────────────────────────────────────────────
// lockedRecipes: recept som alltid ska ingå, kringgår historik och proteinbegränsning.
function selectRecipes(recipes, dayList, constraints, recentIds = new Set(), usedOn = {}, lockedRecipes = []) {
  const MAX_PER_PROTEIN = 2;
  const usedIds = new Set();
  const proteinUsage = {};

  // ── 0. Förtilldela låsta recept ────────────────────────────────────────────
  const dayAssignments = new Array(dayList.length).fill(null);
  const capped = lockedRecipes.slice(0, dayList.length);
  const unmatched = [];
  for (const recipe of capped) {
    const prefersWeekend = recipe.tags.includes("helg60") && !recipe.tags.includes("vardag30");
    let placed = false;
    for (let i = 0; i < dayList.length; i++) {
      if (dayAssignments[i]) continue;
      if (prefersWeekend && !dayList[i].is_weekend) continue;
      dayAssignments[i] = recipe;
      usedIds.add(recipe.id);
      proteinUsage[recipe.protein] = (proteinUsage[recipe.protein] || 0) + 1;
      placed = true;
      break;
    }
    if (!placed) unmatched.push(recipe);
  }
  for (const recipe of unmatched) {
    for (let i = 0; i < dayList.length; i++) {
      if (dayAssignments[i]) continue;
      dayAssignments[i] = recipe;
      usedIds.add(recipe.id);
      proteinUsage[recipe.protein] = (proteinUsage[recipe.protein] || 0) + 1;
      break;
    }
  }

  // ── 1. Historikfiltrering för återstående slots ────────────────────────────
  const remainingSlots = dayList.length - capped.length;
  const fresh = recipes.filter((r) => !recentIds.has(r.id) && !usedIds.has(r.id));
  let pool;
  if (fresh.length >= remainingSlots) {
    pool = fresh;
  } else {
    const needed = remainingSlots - fresh.length;
    const oldest = recipes
      .filter((r) => recentIds.has(r.id) && !usedIds.has(r.id))
      .sort((a, b) => (usedOn[a.id] ?? "") < (usedOn[b.id] ?? "") ? -1 : 1)
      .slice(0, needed);
    pool = [...fresh, ...oldest];
  }
  if (pool.length === 0) pool = recipes.filter((r) => !usedIds.has(r.id));

  // ── 2. Dela upp poolen per dag-typ ────────────────────────────────────────
  const weekdayPool = shuffle(pool.filter((r) => r.tags.includes("vardag30")));
  const weekendPool = shuffle(pool.filter((r) => r.tags.includes("helg60")));

  // ── 3. Vegetariska dagar — bara bland lediga slots ────────────────────────
  const vegCount = constraints.vegetarian_days;
  const unfilledIndices = dayList.map((_, i) => i).filter((i) => !dayAssignments[i]);
  const vegDaySet = new Set(shuffle([...unfilledIndices]).slice(0, Math.min(vegCount, unfilledIndices.length)));

  // ── 4. Fyll varje dag ─────────────────────────────────────────────────────
  const result = [];
  let untestedSoFar = capped.filter((r) => !r.tested).length;

  function pick(dayPool, mustBeVeg) {
    for (const r of dayPool) {
      if (usedIds.has(r.id)) continue;
      if (mustBeVeg && r.protein !== "vegetarisk") continue;
      if (!mustBeVeg && r.protein === "vegetarisk") continue;
      if ((proteinUsage[r.protein] || 0) >= MAX_PER_PROTEIN) continue;
      if (!r.tested && untestedSoFar >= constraints.untested_count) continue;
      return r;
    }
    // Fallback: släpp proteinbegränsning
    for (const r of dayPool) {
      if (usedIds.has(r.id)) continue;
      if (mustBeVeg && r.protein !== "vegetarisk") continue;
      return r;
    }
    return null;
  }

  for (let i = 0; i < dayList.length; i++) {
    const day = dayList[i];
    if (dayAssignments[i]) {
      const r = dayAssignments[i];
      result.push({ date: day.date, day: day.day, recipe: r.title, recipeId: r.id });
      continue;
    }
    const isVegDay = vegDaySet.has(i);
    const dayPool = day.is_weekend ? weekendPool : weekdayPool;
    const recipe = pick(dayPool, isVegDay);
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pat = process.env.GITHUB_PAT;
  if (!pat) return res.status(500).json({ error: "GITHUB_PAT saknas i env" });

  const {
    start_date,
    end_date,
    allowed_proteins = "fisk,kyckling,kött,fläsk,vegetarisk",
    untested_count = 0,
    vegetarian_days = 0,
    skip_shopping = false,
    locked_ids = "",
  } = req.body;

  if (!start_date || !end_date) {
    return res.status(400).json({ error: "start_date och end_date krävs" });
  }

  try {
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
    const dayList = buildDayList(start_date, end_date);
    const lockedIds = String(locked_ids || "").split(",").map((n) => parseInt(n, 10)).filter((n) => !isNaN(n) && n > 0);
    const lockedRecipes = lockedIds.map((id) => allRecipes.find((r) => r.id === id)).filter(Boolean);
    const days = selectRecipes(filtered, dayList, constraints, recentIds, historyData.usedOn || {}, lockedRecipes);

    const today = new Date().toISOString().slice(0, 10);
    const weeklyPlan = { generated: today, startDate: start_date, endDate: end_date, days };
    const updatedHistory = updateHistory(historyData, days.map((d) => d.recipeId).filter(Boolean), today);

    if (skip_shopping) {
      await Promise.all([
        writeFileToGitHub("weekly-plan.json", weeklyPlan, pat),
        writeFileToGitHub("recipe-history.json", updatedHistory, pat),
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
      writeFileToGitHub("weekly-plan.json", weeklyPlan, pat),
      writeFileToGitHub("shopping-list.json", shoppingList, pat),
      writeFileToGitHub("recipe-history.json", updatedHistory, pat),
    ]);

    return res.status(200).json({ ok: true, days: days.length, weeklyPlan, shoppingList });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
