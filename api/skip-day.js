import { buildShoppingList } from "./_shared/shopping-builder.js";
import { createHandler } from "./_shared/handler.js";
import { readFile, readFileRaw, writeFile } from "./_shared/github.js";

const DAY_NAMES = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];

function dayNameForIso(iso) {
  const d = new Date(iso + "T12:00:00");
  const dow = d.getDay();
  const weekday = dow === 0 ? 6 : dow - 1;
  return DAY_NAMES[weekday];
}

function nextIso(iso) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ── Handler ─────────────────────────────────────────────────────────────────
// Två actions:
//   "free"   — gör en receptdag fri. Skjuter alla efterföljande recept framåt
//              och förlänger planen med 1 dag så sista receptet inte tappas.
//   "unfree" — ångra fri dag. Drar tillbaka recepten och krymper planen med
//              1 dag. Lämnar inga tomma spökdagar i slutet.

export default createHandler(async (req, res, pat) => {
  const { date, action } = req.body || {};
  if (!date) return res.status(400).json({ error: "date saknas" });
  if (!["free", "unfree"].includes(action)) {
    return res.status(400).json({ error: "action måste vara 'free' eller 'unfree'" });
  }

  const { content: plan } = await readFile("weekly-plan.json", pat);
  const dayIdx = plan.days.findIndex((d) => d.date === date);
  if (dayIdx === -1) return res.status(404).json({ error: "Dagen finns inte i planen." });

  if (action === "free") {
    if (plan.days[dayIdx].blocked) {
      return res.status(400).json({ error: "Dagen är redan fri." });
    }
    // Lägg till en ny dag i slutet med sista dagens recept (så inget tappas).
    const last = plan.days[plan.days.length - 1];
    const newDate = nextIso(last.date);
    const newDay = {
      date: newDate,
      day: dayNameForIso(newDate),
      recipe: last.recipe,
      recipeId: last.recipeId,
      saving: last.saving || null,
      savingMatches: last.savingMatches || null,
    };
    if (last.blocked) newDay.blocked = true;
    plan.days.push(newDay);

    // Skjut alla recept framåt: i = lastOldIdx (= N-1 efter push, men vi vill
    // bara röra original-indexen). Loopa från N-1 (sista original) ner till dayIdx+1.
    for (let i = plan.days.length - 2; i > dayIdx; i--) {
      plan.days[i].recipe = plan.days[i - 1].recipe;
      plan.days[i].recipeId = plan.days[i - 1].recipeId;
      plan.days[i].saving = plan.days[i - 1].saving || null;
      plan.days[i].savingMatches = plan.days[i - 1].savingMatches || null;
      if (plan.days[i - 1].blocked) {
        plan.days[i].blocked = true;
      } else {
        delete plan.days[i].blocked;
      }
    }
    plan.days[dayIdx].recipe = null;
    plan.days[dayIdx].recipeId = null;
    plan.days[dayIdx].saving = null;
    plan.days[dayIdx].savingMatches = null;
    plan.days[dayIdx].blocked = true;
    plan.endDate = newDate;
  } else {
    if (!plan.days[dayIdx].blocked) {
      return res.status(400).json({ error: "Dagen är inte fri." });
    }
    if (plan.days.length <= 1) {
      return res.status(400).json({ error: "Planen har bara en dag — kassera förslag istället." });
    }
    // Skjut bakåt: dag dayIdx..N-2 får nästa dags data. Ta sen bort sista dagen.
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
    plan.days.pop();
    plan.endDate = plan.days[plan.days.length - 1].date;
  }

  const today = new Date().toISOString().slice(0, 10);
  const commitMsg = action === "free"
    ? `Fri dag ${date} — autogenererad`
    : `Ångra fri dag ${date} — autogenererad`;

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
