import { buildShoppingList } from "./_shared/shopping-builder.js";
import { createHandler } from "./_shared/handler.js";
import { readFile, readFileRaw, writeFile } from "./_shared/github.js";

// ── Handler ─────────────────────────────────────────────────────────────────

export default createHandler(async (req, res, pat) => {
  const { date, action } = req.body || {};
  if (!date) return res.status(400).json({ error: "date saknas" });
  if (!["skip", "block", "unblock"].includes(action)) {
    return res.status(400).json({ error: "action måste vara 'skip', 'block' eller 'unblock'" });
  }

  const { content: plan } = await readFile("weekly-plan.json", pat);
  const dayIdx = plan.days.findIndex((d) => d.date === date);
  if (dayIdx === -1) return res.status(404).json({ error: "Dagen finns inte i planen." });

  if (action === "skip") {
    // Skjut alla recept framåt: varje dag från slutet ner till dayIdx+1
    // får föregående dags recept. Sista receptet faller bort.
    for (let i = plan.days.length - 1; i > dayIdx; i--) {
      plan.days[i].recipe = plan.days[i - 1].recipe;
      plan.days[i].recipeId = plan.days[i - 1].recipeId;
      if (plan.days[i - 1].blocked) {
        plan.days[i].blocked = true;
      } else {
        delete plan.days[i].blocked;
      }
    }
    plan.days[dayIdx].recipe = null;
    plan.days[dayIdx].recipeId = null;
    plan.days[dayIdx].blocked = true;
  } else if (action === "unblock") {
    if (!plan.days[dayIdx].blocked) {
      return res.status(400).json({ error: "Dagen är inte blockerad." });
    }
    // Skjut alla recept bakåt: varje dag från dayIdx till näst sista
    // får nästa dags recept. Sista dagen blir tom.
    for (let i = dayIdx; i < plan.days.length - 1; i++) {
      const next = plan.days[i + 1];
      plan.days[i].recipe = next.recipe;
      plan.days[i].recipeId = next.recipeId;
      plan.days[i].saving = next.saving || null;
      plan.days[i].savingMatches = next.savingMatches || null;
      if (next.blocked) {
        plan.days[i].blocked = true;
      } else {
        delete plan.days[i].blocked;
      }
    }
    const last = plan.days[plan.days.length - 1];
    last.recipe = null;
    last.recipeId = null;
    last.saving = null;
    last.savingMatches = null;
    delete last.blocked;
  } else {
    // block: ta bort receptet från just denna dag
    plan.days[dayIdx].recipe = null;
    plan.days[dayIdx].recipeId = null;
    plan.days[dayIdx].blocked = true;
  }

  const today = new Date().toISOString().slice(0, 10);
  const actionLabels = { skip: "Hoppa över", block: "Blockera", unblock: "Ångra fri dag" };
  const commitMsg = `${actionLabels[action]} ${date}`;

  // Bygg om inköpslistan om planen är bekräftad
  if (plan.confirmedAt) {
    const allRecipesData = await readFileRaw("recipes.json");
    const selectedIds = plan.days.map((d) => d.recipeId).filter(Boolean);
    const shoppingCategories = buildShoppingList(selectedIds, allRecipesData.recipes);

    let existingShop = null;
    try {
      const { content } = await readFile("shopping-list.json", pat);
      existingShop = content;
    } catch { /* ingen befintlig lista */ }

    const shoppingList = {
      generated: today,
      startDate: plan.startDate,
      endDate: plan.endDate,
      recipeItems: shoppingCategories,
      recipeItemsMovedAt: existingShop?.recipeItemsMovedAt ?? null,
      manualItems: existingShop?.manualItems || [],
      checkedItems: existingShop?.checkedItems || {},
    };

    await Promise.all([
      writeFile("weekly-plan.json", plan, pat, commitMsg),
      writeFile("shopping-list.json", shoppingList, pat, commitMsg),
    ]);

    return res.status(200).json({ ok: true, weeklyPlan: plan, shoppingList });
  }

  await writeFile("weekly-plan.json", plan, pat, commitMsg);
  return res.status(200).json({ ok: true, weeklyPlan: plan });
});
