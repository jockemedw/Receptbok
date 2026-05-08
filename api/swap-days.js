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

  if (plan.days[idx1].blocked || plan.days[idx2].blocked) {
    return res.status(400).json({ error: "Blockerade dagar kan inte bytas." });
  }

  const d1 = plan.days[idx1];
  const d2 = plan.days[idx2];
  const swap = (key) => { const tmp = d1[key]; d1[key] = d2[key]; d2[key] = tmp; };
  swap('recipe');
  swap('recipeId');
  swap('saving');
  swap('savingMatches');

  const today = new Date().toISOString().slice(0, 10);
  await writeFile("weekly-plan.json", plan, pat, `Dagsbyte ${today} — autogenererad`);

  return res.status(200).json({ ok: true, weeklyPlan: plan });
});
