import { createHandler } from "./_shared/handler.js";
import { readFile, readFileRaw, writeFile } from "./_shared/github.js";
import { fetchHistory, recentlyUsedIds, shuffle } from "./_shared/history.js";

async function fetchRecipes() {
  const data = await readFileRaw("recipes.json");
  return data.recipes;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default createHandler(async (req, res, pat) => {
  const { date, currentRecipeId, weekRecipeIds = [], newRecipeId } = req.body || {};
  if (!date) return res.status(400).json({ error: "date saknas" });

  const [allRecipes, { content: plan }] = await Promise.all([
    fetchRecipes(),
    readFile("weekly-plan.json", pat),
  ]);

  const dayIdx = plan.days.findIndex(d => d.date === date);
  if (dayIdx === -1) return res.status(404).json({ error: "Dagen hittades inte i veckoplanen." });

  let picked;
  if (newRecipeId) {
    picked = allRecipes.find(r => r.id === parseInt(newRecipeId, 10));
    if (!picked) return res.status(404).json({ error: "Receptet hittades inte." });
  } else {
    const history = await fetchHistory(pat);
    const recentIds = recentlyUsedIds(history);
    const weekSet = new Set(weekRecipeIds.filter(id => id !== currentRecipeId));

    // Bestäm om det är vardag eller helg
    const dow = new Date(date + 'T12:00:00').getDay();
    const isWeekend = dow === 0 || dow === 6;
    const requiredTag = isWeekend ? 'helg60' : 'vardag30';

    // Räkna proteiner i resten av veckans plan (exkl. bytta dagen)
    const proteinCount = {};
    for (const d of plan.days) {
      if (d.date !== date && d.recipeId && !d.blocked) {
        const r = allRecipes.find(x => x.id === d.recipeId);
        if (r) proteinCount[r.protein] = (proteinCount[r.protein] || 0) + 1;
      }
    }
    const MAX_PROTEIN = 2;

    // Bygg pool: uteslut nuvarande, övriga veckans och nyligen använda
    const base = allRecipes.filter(r =>
      r.id !== currentRecipeId &&
      !weekSet.has(r.id) &&
      !recentIds.has(r.id)
    );

    // Prioritet 1: rätt tagg + protein inte maxad
    let pool = shuffle(base.filter(r =>
      (r.tags || []).includes(requiredTag) &&
      (proteinCount[r.protein] || 0) < MAX_PROTEIN
    ));

    // Prioritet 2: rätt tagg (protein kan vara maxad)
    if (!pool.length) pool = shuffle(base.filter(r => (r.tags || []).includes(requiredTag)));

    // Prioritet 3: valfri tagg, protein inte maxad
    if (!pool.length) pool = shuffle(base.filter(r => (proteinCount[r.protein] || 0) < MAX_PROTEIN));

    // Prioritet 4: hela basen utan regler
    if (!pool.length) pool = shuffle(base);

    // Prioritet 5: inkludera nyligen använda, äldst först
    if (!pool.length) {
      const usedOn = history.usedOn || {};
      pool = allRecipes
        .filter(r => r.id !== currentRecipeId && !weekSet.has(r.id))
        .sort((a, b) => (usedOn[a.id] || '0000-00-00') < (usedOn[b.id] || '0000-00-00') ? -1 : 1);
    }

    if (!pool.length) return res.status(409).json({ error: "Inga tillgängliga recept att byta till." });
    picked = pool[0];
  }

  plan.days[dayIdx] = {
    ...plan.days[dayIdx],
    recipe: picked.title,
    recipeId: picked.id,
  };

  const today = new Date().toISOString().slice(0, 10);
  await writeFile("weekly-plan.json", plan, pat, `Receptbyte ${today} — autogenererad`);

  return res.status(200).json({ recipe: picked.title, recipeId: picked.id });
});
