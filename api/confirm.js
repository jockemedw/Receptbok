import { buildShoppingList } from "./_shared/shopping-builder.js";
import { createHandler } from "./_shared/handler.js";
import { readFile, readFileRaw, writeFile } from "./_shared/github.js";

// ── Handler ─────────────────────────────────────────────────────────────────

export default createHandler(async (req, res, pat) => {
  const [{ content: plan }, allRecipesData] = await Promise.all([
    readFile("weekly-plan.json", pat),
    readFileRaw("recipes.json"),
  ]);

  if (!plan?.days?.length) return res.status(400).json({ error: "Ingen veckoplan att bekräfta." });

  const allRecipes = allRecipesData.recipes;
  const selectedIds = plan.days.map((d) => d.recipeId).filter(Boolean);
  const shoppingCategories = buildShoppingList(selectedIds, allRecipes);

  const today = new Date().toISOString().slice(0, 10);

  // Hämta befintlig shopping-list för att bevara manuella varor och bockningar
  let existingShop = null;
  try {
    const { content } = await readFile("shopping-list.json", pat);
    existingShop = content;
  } catch { /* ingen befintlig lista — OK */ }

  const shoppingList = {
    generated: today,
    startDate: plan.startDate,
    endDate: plan.endDate,
    recipeItems: shoppingCategories,
    recipeItemsMovedAt: null,
    manualItems: existingShop?.manualItems || [],
    checkedItems: existingShop?.checkedItems || {},
  };

  const confirmedPlan = { ...plan, confirmedAt: new Date().toISOString() };
  const commitMsg = `Bekräftad matsedel ${today} — autogenererad`;

  await Promise.all([
    writeFile("weekly-plan.json", confirmedPlan, pat, commitMsg),
    writeFile("shopping-list.json", shoppingList, pat, commitMsg),
  ]);

  return res.status(200).json({ ok: true, weeklyPlan: confirmedPlan, shoppingList });
});
