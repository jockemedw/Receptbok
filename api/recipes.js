import { createHandler } from "./_shared/handler.js";
import { readFile, writeFile } from "./_shared/github.js";

// ── Handler ─────────────────────────────────────────────────────────────────

export default createHandler(async (req, res, pat) => {
  const { action, id, recipe } = req.body || {};

  const { content, sha } = await readFile("recipes.json", pat);
  const recipes = content.recipes;

  if (action === "toggle_tested") {
    const r = recipes.find(r => r.id === id);
    if (!r) return res.status(404).json({ error: "Recept hittades inte." });
    r.tested = !r.tested;
    await writeFile("recipes.json", content, pat, "Receptdatabasen uppdaterad");
    return res.status(200).json({ ok: true, tested: r.tested });

  } else if (action === "update") {
    if (!recipe || !recipe.id) return res.status(400).json({ error: "Recept saknas." });
    const idx = recipes.findIndex(r => r.id === recipe.id);
    if (idx === -1) return res.status(404).json({ error: "Recept hittades inte." });
    recipes[idx] = recipe;
    content.meta.lastUpdated = new Date().toISOString().slice(0, 10);
    await writeFile("recipes.json", content, pat, "Receptdatabasen uppdaterad");
    return res.status(200).json({ ok: true });

  } else if (action === "delete") {
    const idx = recipes.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: "Recept hittades inte." });
    recipes.splice(idx, 1);
    content.meta.totalRecipes = recipes.length;
    content.meta.lastUpdated  = new Date().toISOString().slice(0, 10);
    await writeFile("recipes.json", content, pat, "Receptdatabasen uppdaterad");
    return res.status(200).json({ ok: true });

  } else if (action === "add") {
    if (!recipe) return res.status(400).json({ error: "Recept saknas." });
    const maxId = recipes.reduce((max, r) => Math.max(max, r.id), 0);
    const newRecipe = {
      id: maxId + 1,
      title: recipe.title,
      tested: false,
      servings: recipe.servings || 4,
      time: recipe.time || null,
      timeNote: recipe.timeNote || null,
      tags: recipe.tags || [],
      protein: recipe.protein,
      ingredients: recipe.ingredients || [],
      instructions: recipe.instructions || [],
      notes: recipe.notes || null,
    };
    recipes.push(newRecipe);
    content.meta.totalRecipes = recipes.length;
    content.meta.lastUpdated = new Date().toISOString().slice(0, 10);
    await writeFile("recipes.json", content, pat, "Receptdatabasen uppdaterad");
    return res.status(200).json({ ok: true, recipe: newRecipe });

  } else {
    return res.status(400).json({ error: "Okänd action." });
  }
});
