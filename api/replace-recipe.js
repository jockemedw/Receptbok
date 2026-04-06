import { createHandler } from "./_shared/handler.js";
import { readFile, readFileRaw, writeFile } from "./_shared/github.js";

// ── Domänlogik (ägs av denna slice) ─────────────────────────────────────────

async function fetchRecipes() {
  const data = await readFileRaw("recipes.json");
  return data.recipes;
}

async function fetchHistory(pat) {
  try {
    const { content: parsed } = await readFile("recipe-history.json", pat);
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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default createHandler(async (req, res, pat) => {
  const { date, currentRecipeId, weekRecipeIds = [], newRecipeId } = req.body || {};
  if (!date) return res.status(400).json({ error: "date saknas" });

  const [allRecipes, { content: plan }] = await Promise.all([
    fetchRecipes(),
    readFile("weekly-plan.json", pat),
  ]);

  let picked;
  if (newRecipeId) {
    picked = allRecipes.find(r => r.id === parseInt(newRecipeId, 10));
    if (!picked) return res.status(404).json({ error: "Receptet hittades inte." });
  } else {
    const history = await fetchHistory(pat);
    const recentIds = recentlyUsedIds(history);
    const weekSet = new Set(weekRecipeIds.filter(id => id !== currentRecipeId));

    let pool = allRecipes.filter(r =>
      r.id !== currentRecipeId &&
      !weekSet.has(r.id) &&
      !recentIds.has(r.id)
    );

    if (!pool.length) {
      const usedOn = history.usedOn || {};
      pool = allRecipes
        .filter(r => r.id !== currentRecipeId && !weekSet.has(r.id))
        .sort((a, b) => (usedOn[a.id] || "0000-00-00") < (usedOn[b.id] || "0000-00-00") ? -1 : 1);
    }

    if (!pool.length) return res.status(409).json({ error: "Inga tillgängliga recept att byta till." });
    picked = shuffle(pool)[0];
  }

  const dayIdx = plan.days.findIndex(d => d.date === date);
  if (dayIdx === -1) return res.status(404).json({ error: "Dagen hittades inte i veckoplanen." });

  plan.days[dayIdx] = {
    ...plan.days[dayIdx],
    recipe: picked.title,
    recipeId: picked.id,
  };

  const today = new Date().toISOString().slice(0, 10);
  await writeFile("weekly-plan.json", plan, pat, `Receptbyte ${today} — autogenererad`);

  return res.status(200).json({ recipe: picked.title, recipeId: picked.id });
});
