import { createHandler } from "./_shared/handler.js";
import { readFileRaw, writeFile } from "./_shared/github.js";
import { fetchOffers } from "./_shared/offer-adapter.js";
import { matchOffersToRecipes } from "./_shared/offer-matcher.js";

export default createHandler(async (req, res, pat) => {
  const { force_refresh = false } = req.body || {};

  // 1. Kolla cache — uppdatera max 1 gång per dag
  let cache = null;
  try {
    cache = await readFileRaw("offers-cache.json");
  } catch { /* ingen cache ännu */ }

  const today = new Date().toISOString().slice(0, 10);
  if (cache && cache.fetchedDate === today && !force_refresh) {
    return res.status(200).json(cache);
  }

  // 2. Hämta erbjudanden från konfigurerad källa
  const { offers, source } = await fetchOffers();

  if (!offers.length) {
    const empty = { fetchedDate: today, source, recipeMatches: {} };
    return res.status(200).json(empty);
  }

  // 3. Ladda recept och matcha
  const recipesData = await readFileRaw("recipes.json");
  const recipeMatches = matchOffersToRecipes(offers, recipesData.recipes);

  // 4. Cacha resultat
  const result = { fetchedDate: today, source, recipeMatches };
  try {
    await writeFile("offers-cache.json", result, pat, `Erbjudande-cache ${today}`);
  } catch { /* cache-skrivning är icke-kritisk */ }

  return res.status(200).json(result);
});
