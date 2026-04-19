// Matchar receptingredienser mot Willys-erbjudanden via CANON-lexikonet
// i shopping-builder.js. Återanvänder samma parseIngredient/normalizeName
// så matchningen är konsekvent med inköpslistan.

import {
  NORMALIZATION_TABLE,
  parseIngredient,
  normalizeName,
  CANON_SET,
  CANON_REJECT_PATTERNS,
} from "./shopping-builder.js";

const MAX_NGRAM = 3;

// Kontrollera om offer-texten funktionellt/produktmässigt passar canon.
// Se CANON_REJECT_PATTERNS i shopping-builder.js — löser t.ex.
// spraygrädde-vispgrädde-felmatchningen mot matlagningsgrädde-recept.
function rejectsMatch(canon, offer) {
  const pattern = CANON_REJECT_PATTERNS[canon];
  if (!pattern) return false;
  const text = `${offer.name} ${offer.brandLine || ""}`;
  return pattern.test(text);
}

// Extrahera EN kanonisk huvudterm ur ett erbjudandenamn.
// Prioritet: längre fras före kortare, tidigare position före senare.
// Detta undviker "Fylld Gnocchi Tomat Mozzarella" → tomat/mozzarella
// (produkten är gnocchi). 2-gram "fylld gnocchi" träffar först → "gnocchi".
function extractOfferCanon(offer) {
  const text = `${offer.name} ${offer.brandLine || ""}`.toLowerCase();
  const tokens = text.split(/[\s,\-()\/]+/).filter(Boolean);
  for (let n = Math.min(MAX_NGRAM, tokens.length); n >= 1; n--) {
    for (let i = 0; i <= tokens.length - n; i++) {
      const phrase = tokens.slice(i, i + n).join(" ");
      const normalized = NORMALIZATION_TABLE[phrase];
      if (normalized) return normalized;
      if (CANON_SET.has(phrase)) return phrase;
    }
  }
  return null;
}

function extractRecipeCanons(recipe) {
  const canons = new Set();
  for (const raw of recipe.ingredients || []) {
    const { name } = parseIngredient(raw);
    const canon = normalizeName(name);
    if (canon) canons.add(canon);
  }
  return canons;
}

// Matchar ett recept mot en lista offers.
// Returnerar { recipeId, matches: [{canon, offer}], totalSaving }
// totalSaving tar max savingPerUnit per kanonisk term (inte summan av alla
// offers som råkar matcha samma canon — användaren väljer ett erbjudande).
export function matchRecipe(recipe, offers) {
  const recipeCanons = extractRecipeCanons(recipe);
  const matches = [];
  for (const offer of offers) {
    const canon = extractOfferCanon(offer);
    if (!canon || !recipeCanons.has(canon)) continue;
    if (rejectsMatch(canon, offer)) continue;
    matches.push({ canon, offer });
  }

  const savingsByCanon = new Map();
  for (const { canon, offer } of matches) {
    const cur = savingsByCanon.get(canon) || 0;
    const s = offer.savingPerUnit || 0;
    if (s > cur) savingsByCanon.set(canon, s);
  }
  const totalSaving = [...savingsByCanon.values()].reduce((s, v) => s + v, 0);

  return { recipeId: recipe.id, matches, totalSaving };
}

export function matchRecipes(recipes, offers) {
  return recipes.map((r) => matchRecipe(r, offers));
}
