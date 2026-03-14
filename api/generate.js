import Anthropic from "@anthropic-ai/sdk";

const REPO_OWNER = "jockemedw";
const REPO_NAME = "Receptbok";
const BRANCH = "main";

const DAY_NAMES = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];

const CATEGORY_KEYWORDS = {
  Mejeri: ["grädde", "mjölk", "smör", "ost", "halloumi", "fetaost", "crème fraiche",
    "yoghurt", "kvarg", "mozzarella", "parmesan", "kokosmjölk", "gruyère", "ricotta", "mascarpone"],
  Grönsaker: ["lök", "vitlök", "morot", "purjolök", "blomkål", "broccoli", "paprika",
    "tomat", "gurka", "sallad", "spenat", "zucchini", "aubergine", "selleri", "salladslök",
    "ingefära", "kål", "potatis", "svamp", "champinjon", "shiitake", "kantarell", "palsternacka",
    "rättika", "squash", "majs", "ärter", "rödlök", "gul lök", "chili", "pak choi", "brysselkål"],
  "Fisk & kött": ["torsk", "lax", "räkor", "tonfisk", "kyckling", "fläsk", "köttfärs",
    "nötkött", "bacon", "pancetta", "chorizo", "biff", "skaldjur", "tofu", "rödspätta",
    "sej", "pollock", "makrill", "sardiner", "fisk", "kycklingfilé", "kycklinglår"],
  Frukt: ["citron", "lime", "äpple", "banan", "apelsin", "mango", "vindruvor", "päron", "persika", "plommon"],
};

function categorize(ingredient) {
  const low = ingredient.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => low.includes(kw))) return cat;
  }
  return "Skafferi";
}

function cleanIngredient(ing) {
  return ing.includes(":") ? ing.split(":")[1].trim() : ing.trim();
}

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

function buildShoppingList(selectedIds, allRecipes) {
  const recipeMap = Object.fromEntries(allRecipes.map((r) => [r.id, r]));
  const categories = { Mejeri: [], Grönsaker: [], "Fisk & kött": [], Frukt: [], Skafferi: [], Övrigt: [] };
  const seen = new Set();

  for (const rid of selectedIds) {
    const recipe = recipeMap[rid];
    if (!recipe) continue;
    for (const rawIng of recipe.ingredients || []) {
      const ing = cleanIngredient(rawIng);
      const key = ing.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const cat = categorize(ing);
      categories[cat].push(ing);
    }
  }
  return categories;
}

async function fetchRecipes() {
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/recipes.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kunde inte läsa recipes.json: ${res.status}`);
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

async function fetchHistory() {
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/recipe-history.json`;
  const res = await fetch(url);
  if (!res.ok) return { history: [] };
  return res.json();
}

// Returns Set of recipe IDs used within the last `days` days
function recentlyUsedIds(history, days = 28) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const ids = new Set();
  for (const entry of history) {
    if (new Date(entry.date) >= cutoff) {
      for (const id of entry.recipeIds) ids.add(id);
    }
  }
  return ids;
}

function updateHistory(history, newIds, date) {
  const updated = [{ date, recipeIds: newIds }, ...history];
  // Keep max 8 entries (covers ~2 months)
  return updated.slice(0, 8);
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
    const err = await putRes.text();
    throw new Error(`GitHub API-fel för ${path}: ${putRes.status} — ${err}`);
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

async function callClaude(recipes, dayList, constraints, instructions, recentIds = new Set()) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const slim = shuffle(recipes).map((r) => ({
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
  if (recentIds.size > 0) {
    const ruleNum = extraRules.length + 6;
    extraRules.push(`${ruleNum}. The following recipe IDs were used in the last 4 weeks — AVOID them if possible, only use as last resort: [${[...recentIds].join(", ")}]`);
  }
  if (instructions?.trim()) {
    const ruleNum = extraRules.length + 6;
    extraRules.push(`${ruleNum}. Additional family instructions: ${instructions.trim()}`);
  }

  const prompt = `You are a meal planner for a Swedish family. Select ${dayList.length} recipes from the recipe database below — one per day — for the period listed.

## Rules
1. Days tagged "vardag30" MUST use recipes tagged "vardag30" (max ${constraints.max_weekday_time} min).
2. Days tagged "helg60" MUST use recipes tagged "helg60" (max ${constraints.max_weekend_time} min).
3. Do not repeat the same recipe or the same protein type more than twice across all days.
4. Vary protein types across the days for nutritional balance.
5. Copy recipe titles and IDs EXACTLY as they appear in the database.
${extraRules.join("\n")}

## Days to plan
${daysText}

## Recipe database
${JSON.stringify(slim, null, 0)}

## Required output format
Return ONLY a JSON array — no other text outside the array:

${daysTemplate}`;

  const models = ["claude-haiku-4-5-20251001", "claude-haiku-4-5"];
  let lastError;
  for (const model of models) {
    try {
      const msg = await client.messages.create({
        model,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });
      let raw = msg.content[0]?.text?.trim() || "";
      if (raw.startsWith("```")) {
        raw = raw.split("```")[1];
        if (raw.startsWith("json")) raw = raw.slice(4);
        raw = raw.trim().replace(/```$/, "").trim();
      }
      const days = JSON.parse(raw);
      if (!Array.isArray(days)) throw new Error("Svar är inte en array");
      return days;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://jockemedw.github.io");
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

    const [allRecipes, historyData] = await Promise.all([fetchRecipes(), fetchHistory()]);
    const filtered = filterRecipes(allRecipes, constraints);

    if (filtered.length === 0) {
      return res.status(400).json({ error: "Inga recept kvar efter filtrering — justera inställningarna." });
    }

    // Pass recently used IDs to Claude so it avoids them
    const recentIds = recentlyUsedIds(historyData.history);

    const dayList = buildDayList(start_date, end_date);
    const days = await callClaude(filtered, dayList, constraints, instructions, recentIds);

    const selectedIds = days.map((d) => d.recipeId).filter(Boolean);
    const shoppingCategories = buildShoppingList(selectedIds, allRecipes);

    const today = new Date().toISOString().slice(0, 10);
    const weeklyPlan = { generated: today, startDate: start_date, endDate: end_date, days };
    const shoppingList = { generated: today, startDate: start_date, endDate: end_date, categories: shoppingCategories };
    const updatedHistory = { history: updateHistory(historyData.history, selectedIds, today) };

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
