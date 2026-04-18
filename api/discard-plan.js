import { createHandler } from "./_shared/handler.js";
import { readFile, writeFile } from "./_shared/github.js";

// Kasserar en opåbörjad (icke-bekräftad) matsedel:
// - Tömmer weekly-plan.json
// - Tar bort planens recipeIds ur recipe-history.json så de kan väljas igen
// - Rör inte shopping-list.json (speglar senast bekräftade plan) eller plan-archive.json
export default createHandler(async (req, res, pat) => {
  let plan = null;
  try {
    ({ content: plan } = await readFile("weekly-plan.json", pat));
  } catch {
    return res.status(404).json({ error: "Ingen matsedel att kassera." });
  }
  if (!plan?.days?.length) {
    return res.status(400).json({ error: "Matsedeln är redan tom." });
  }
  if (plan.confirmedAt) {
    return res.status(400).json({ error: "Bekräftad matsedel kan inte kasseras." });
  }

  const planRecipeIds = plan.days.map((d) => d.recipeId).filter(Boolean);
  const commitMsg = `Kassera förslag ${plan.startDate || ""}–${plan.endDate || ""}`.trim();

  // Rensa history för planens recept så de blir valbara direkt igen.
  let history = { usedOn: {} };
  try {
    ({ content: history } = await readFile("recipe-history.json", pat));
    if (!history?.usedOn) history = { usedOn: {} };
  } catch { /* ingen history, OK */ }
  for (const rid of planRecipeIds) {
    delete history.usedOn[String(rid)];
  }

  const emptyPlan = {
    generated: null,
    startDate: null,
    endDate: null,
    days: [],
  };

  await Promise.all([
    writeFile("weekly-plan.json", emptyPlan, pat, commitMsg),
    writeFile("recipe-history.json", history, pat, commitMsg),
  ]);

  return res.status(200).json({ ok: true, weeklyPlan: emptyPlan });
});
