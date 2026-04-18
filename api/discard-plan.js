import { createHandler } from "./_shared/handler.js";
import { readFile, writeFile } from "./_shared/github.js";

// Kasserar en opåbörjad (icke-bekräftad) matsedel:
// - Tömmer weekly-plan.json
// - Tar bort planens recipeIds ur recipe-history.json så de kan väljas igen
// - Rör inte shopping-list.json (speglar senast bekräftade plan) eller plan-archive.json
export default createHandler(async (req, res, pat) => {
  let plan = null;
  try {
    const result = await readFile("weekly-plan.json", pat);
    plan = result.content;
  } catch (e) {
    return res.status(404).json({ error: `Ingen matsedel att kassera (${e.message}).` });
  }
  if (!plan || !Array.isArray(plan.days) || plan.days.length === 0) {
    return res.status(400).json({ error: "Matsedeln är redan tom." });
  }
  if (plan.confirmedAt) {
    return res.status(400).json({ error: "Bekräftad matsedel kan inte kasseras." });
  }

  const planRecipeIds = plan.days.map((d) => d.recipeId).filter(Boolean);
  const startLabel = plan.startDate || "";
  const endLabel = plan.endDate || "";
  const commitMsg = `Kassera förslag ${startLabel}${startLabel && endLabel ? "–" : ""}${endLabel}`.trim() || "Kassera förslag";

  // Rensa history för planens recept så de blir valbara direkt igen.
  let history = { usedOn: {} };
  try {
    const hRes = await readFile("recipe-history.json", pat);
    history = hRes.content && hRes.content.usedOn ? hRes.content : { usedOn: {} };
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

  // Sekventiellt för att undvika parallella SHA-konflikter på samma commit-tillfälle.
  await writeFile("weekly-plan.json", emptyPlan, pat, commitMsg);
  await writeFile("recipe-history.json", history, pat, commitMsg);

  return res.status(200).json({ ok: true, weeklyPlan: emptyPlan });
});
