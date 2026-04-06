import { createHandler } from "./_shared/handler.js";
import { readFile, writeFile } from "./_shared/github.js";

// ── Handler ─────────────────────────────────────────────────────────────────

export default createHandler(async (req, res, pat) => {
  const { date1, date2 } = req.body || {};
  if (!date1 || !date2) return res.status(400).json({ error: "date1 och date2 krävs" });
  if (date1 === date2) return res.status(400).json({ error: "Välj två olika dagar" });

  const { content: plan } = await readFile("weekly-plan.json", pat);

  const idx1 = plan.days.findIndex((d) => d.date === date1);
  const idx2 = plan.days.findIndex((d) => d.date === date2);

  if (idx1 === -1 || idx2 === -1) return res.status(404).json({ error: "En eller båda dagarna finns inte i planen." });

  // Byt bara recipe och recipeId — datum och dagnamn stannar på sin plats
  const { recipe: r1, recipeId: rid1 } = plan.days[idx1];
  plan.days[idx1].recipe   = plan.days[idx2].recipe;
  plan.days[idx1].recipeId = plan.days[idx2].recipeId;
  plan.days[idx2].recipe   = r1;
  plan.days[idx2].recipeId = rid1;

  const today = new Date().toISOString().slice(0, 10);
  await writeFile("weekly-plan.json", plan, pat, `Dagsbyte ${today} — autogenererad`);

  return res.status(200).json({ ok: true, weeklyPlan: plan });
});
