import { createHandler } from "./_shared/handler.js";
import { readFile, readFileRaw, writeFile } from "./_shared/github.js";
import { buildShoppingList } from "./_shared/shopping-builder.js";

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

function prevIso(iso) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function appendBlockedDay(plan) {
  const last = plan.days[plan.days.length - 1];
  const newDate = nextIso(last.date);
  plan.days.push({
    date: newDate,
    day: dayNameForIso(newDate),
    recipe: null,
    recipeId: null,
    saving: null,
    savingMatches: null,
    blocked: true,
  });
  plan.endDate = newDate;
}

function prependBlockedDay(plan) {
  const first = plan.days[0];
  const newDate = prevIso(first.date);
  plan.days.unshift({
    date: newDate,
    day: dayNameForIso(newDate),
    recipe: null,
    recipeId: null,
    saving: null,
    savingMatches: null,
    blocked: true,
  });
  plan.startDate = newDate;
}

// ── Handler ─────────────────────────────────────────────────────────────────
// Byter recept mellan två dagar.
//   date1 måste vara en dag med recept i aktiv plan.
//   date2 kan vara: en plan-dag (med eller utan recept), eller en dag utanför
//   planen (då förlängs planen så date2 ryms; mellanrum fylls med fria dagar).
// Recept i arkiverade planer kan inte röras. Dagar med egen planering inte heller.

export default createHandler(async (req, res, pat) => {
  const { date1, date2 } = req.body || {};
  if (!date1 || !date2) return res.status(400).json({ error: "date1 och date2 krävs" });
  if (date1 === date2) return res.status(400).json({ error: "Välj två olika dagar." });

  const { content: plan } = await readFile("weekly-plan.json", pat);

  let idx1 = plan.days.findIndex((d) => d.date === date1);
  if (idx1 === -1) return res.status(404).json({ error: "Källdagen finns inte i din matsedel." });
  if (!plan.days[idx1].recipeId) {
    return res.status(400).json({ error: "Källdagen har inget recept att flytta." });
  }

  // Måldagen får inte tillhöra ett arkiverat förslag
  try {
    const { content: archive } = await readFile("plan-archive.json", pat);
    for (const p of (archive.plans || [])) {
      for (const d of (p.days || [])) {
        if (d.date === date1 || d.date === date2) {
          return res.status(400).json({ error: "Den dagen tillhör en gammal matsedel och kan inte ändras." });
        }
      }
    }
  } catch { /* arkiv saknas — OK */ }

  // Måldagen får inte ha egen planering
  try {
    const { content: customDays } = await readFile("custom-days.json", pat);
    if (customDays?.entries?.[date2]) {
      return res.status(400).json({ error: "Måldagen har egen planering — rensa den först." });
    }
  } catch { /* OK */ }

  // Förläng planen om date2 ligger utanför
  if (date2 > plan.endDate) {
    let guard = 0;
    while (plan.endDate < date2 && guard++ < 365) appendBlockedDay(plan);
  } else if (date2 < plan.startDate) {
    let guard = 0;
    while (plan.startDate > date2 && guard++ < 365) prependBlockedDay(plan);
    idx1 = plan.days.findIndex((d) => d.date === date1); // index har skiftat efter unshift
  }

  const idx2 = plan.days.findIndex((d) => d.date === date2);
  if (idx2 === -1) {
    return res.status(500).json({ error: "Kunde inte hitta måldagen i den utökade planen." });
  }

  const d1 = plan.days[idx1];
  const d2 = plan.days[idx2];
  const swapField = (key) => { const tmp = d1[key]; d1[key] = d2[key]; d2[key] = tmp; };
  swapField('recipe');
  swapField('recipeId');
  swapField('saving');
  swapField('savingMatches');

  // Blocked-status följer recept-närvaron
  if (d1.recipeId) delete d1.blocked; else d1.blocked = true;
  if (d2.recipeId) delete d2.blocked; else d2.blocked = true;

  // Uppdatera recept-historik så receptet räknas som senast använt på sin nya dag
  try {
    const { content: history } = await readFile("recipe-history.json", pat);
    const usedOn = history.usedOn || {};
    if (d1.recipeId) usedOn[d1.recipeId] = d1.date;
    if (d2.recipeId) usedOn[d2.recipeId] = d2.date;
    history.usedOn = usedOn;
    await writeFile("recipe-history.json", history, pat, `Dagsbyte ${date1}↔${date2}`);
  } catch { /* historik saknas — OK */ }

  const today = new Date().toISOString().slice(0, 10);
  const commitMsg = `Dagsbyte ${date1}↔${date2} — autogenererad`;

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
