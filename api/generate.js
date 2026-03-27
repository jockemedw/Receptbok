import Anthropic from "@anthropic-ai/sdk";
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
  const { untested_count, max_weekday_time, max_weekend_time } = constraints;

  return recipes.filter((r) => {
    if (!allowed.has(r.protein)) return false;
    if (!untested_count && !r.tested) return false;
    const t = r.time || 999;
    const tags = r.tags || [];
    const weekdayOk = tags.includes("vardag30") && t <= max_weekday_time;
    const weekendOk = tags.includes("helg60") && t <= max_weekend_time;
    return weekdayOk || weekendOk;
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

async function callClaude(recipes, dayList, constraints, instructions, recentIds = new Set(), usedOn = {}) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Bygg en snabb-uppslagstabell för validering
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));

  // ── 1. Hårt förval: nyligen använda recept filtreras bort ──────────────────
  // Färska recept (ej använda senaste 14 dagarna) prioriteras alltid.
  // Om poolen är för liten fylls den på med de recept som gick längst sedan —
  // aldrig slumpmässigt eller med Claudes egna preferenser.
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

  // ── 2. Proteinfördelning — ger Claude kontexten den behöver ────────────────
  const proteinCounts = {};
  for (const r of pool) proteinCounts[r.protein] = (proteinCounts[r.protein] || 0) + 1;
  const proteinInfo = Object.entries(proteinCounts)
    .map(([p, n]) => `${p}: ${n} st`)
    .join(", ");

  const slim = shuffle(pool).map((r) => ({
    id: r.id, title: r.title, time: r.time,
    tags: r.tags, protein: r.protein, tested: r.tested,
  }));

  const daysText = dayList
    .map((d) => `- ${d.day} (${d.date}): ${d.is_weekend ? "helg60" : "vardag30"}`)
    .join("\n");

  const daysTemplate = JSON.stringify(
    dayList.map((d) => ({ date: d.date, day: d.day, recipe: "<exact title>", recipeId: 0 })),
    null, 2
  );

  const extraRules = [];
  if (!constraints.untested_count) {
    extraRules.push("6. ONLY select recipes where tested=true.");
  } else {
    extraRules.push(`6. At most ${constraints.untested_count} selected recipe(s) may have tested=false.`);
  }
  if (constraints.vegetarian_days > 0) {
    extraRules.push(
      `7. Exactly ${constraints.vegetarian_days} of the ${dayList.length} days must use a vegetarian recipe (protein='vegetarisk').`
    );
  }
  if (instructions?.trim()) {
    extraRules.push(`${extraRules.length + 6}. Additional family instructions: ${instructions.trim()}`);
  }

  const buildPrompt = (feedbackNote = "") => `You are a meal planner for a Swedish family. Select ${dayList.length} recipes from the recipe database below — one per day — for the period listed.

## Available recipes by protein type
${proteinInfo}

## Rules
1. Days tagged "vardag30" MUST use recipes tagged "vardag30" (max ${constraints.max_weekday_time} min).
2. Days tagged "helg60" MUST use recipes tagged "helg60" (max ${constraints.max_weekend_time} min).
3. Do not repeat the same recipe. Do not use the same protein type more than twice.
4. Vary protein types across the days for nutritional balance.
5. Copy recipe titles and IDs EXACTLY as they appear in the database — do not invent new IDs or titles.
${extraRules.join("\n")}${feedbackNote ? `\n\n## IMPORTANT — fix these errors from your previous attempt\n${feedbackNote}` : ""}

## Days to plan
${daysText}

## Recipe database
${JSON.stringify(slim, null, 0)}

## Required output format
Return ONLY a JSON array — no other text, no markdown, no explanation:

${daysTemplate}`;

  // ── 3. Validera Claudes svar mot databasen ─────────────────────────────────
  function validateAndFix(days) {
    if (!Array.isArray(days)) return { error: "Response is not a JSON array", days: null };
    if (days.length !== dayList.length) return { error: `Expected ${dayList.length} entries, got ${days.length}`, days: null };

    const errors = [];
    const usedIds = new Set();

    for (const d of days) {
      let recipe = recipeMap.get(d.recipeId);

      // Om ID saknas, försök matcha på exakt titel
      if (!recipe) {
        const byTitle = [...recipeMap.values()].find((r) => r.title === d.recipe);
        if (byTitle) {
          d.recipeId = byTitle.id; // korrigera ID
          recipe = byTitle;
        } else {
          errors.push(`Recipe ID ${d.recipeId} ("${d.recipe}") does not exist in the database.`);
          continue;
        }
      }

      // Om titel inte stämmer, korrigera tyst
      if (recipe.title !== d.recipe) d.recipe = recipe.title;

      // Kontrollera dubbletter
      if (usedIds.has(d.recipeId)) {
        errors.push(`Recipe "${d.recipe}" (ID ${d.recipeId}) was selected more than once.`);
      }
      usedIds.add(d.recipeId);
    }

    if (errors.length > 0) return { error: errors.join(" "), days: null };
    return { error: null, days };
  }

  // ── 4. Anropa Claude med retry vid valideringsfel ──────────────────────────
  const models = ["claude-haiku-4-5-20251001", "claude-haiku-4-5"];
  let lastError;
  let feedbackNote = "";

  for (let attempt = 0; attempt < 3; attempt++) {
    const model = models[Math.min(attempt, models.length - 1)];
    try {
      const msg = await client.messages.create({
        model,
        max_tokens: 2048,
        messages: [{ role: "user", content: buildPrompt(feedbackNote) }],
      });

      let raw = msg.content[0]?.text?.trim() || "";
      if (raw.startsWith("```")) {
        raw = raw.split("```")[1];
        if (raw.startsWith("json")) raw = raw.slice(4);
        raw = raw.trim().replace(/```$/, "").trim();
      }

      const parsed = JSON.parse(raw);
      const { error, days } = validateAndFix(parsed);

      if (!error) return days;

      // Valideringsfel — skicka feedback i nästa försök
      feedbackNote = error;
      lastError = new Error(error);
    } catch (e) {
      lastError = e;
      feedbackNote = `Parse error: ${e.message}`;
    }
  }
  throw lastError;
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
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY saknas i env" });

  const {
    start_date,
    end_date,
    instructions = "",
    allowed_proteins = "fisk,kyckling,kött,fläsk,vegetarisk",
    untested_count = 0,
    max_weekday_time = 30,
    max_weekend_time = 60,
    vegetarian_days = 0,
    skip_shopping = false,
  } = req.body;

  if (!start_date || !end_date) {
    return res.status(400).json({ error: "start_date och end_date krävs" });
  }

  try {
    const constraints = {
      allowed_proteins: allowed_proteins.split(",").map((p) => p.trim()).filter(Boolean),
      untested_count: parseInt(untested_count) || 0,
      max_weekday_time: parseInt(max_weekday_time) || 30,
      max_weekend_time: parseInt(max_weekend_time) || 60,
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
    const days = await callClaude(filtered, dayList, constraints, instructions, recentIds, historyData.usedOn || {});

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
