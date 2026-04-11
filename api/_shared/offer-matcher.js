// ─── Erbjudande-matchning — matchar butikerbjudanden mot receptingredienser ─
import {
  parseIngredient, normalizeName, NORMALIZATION_TABLE, PANTRY_ALWAYS_SKIP,
} from "./shopping-builder.js";

// Bygg omvänd lookup: kanoniskt namn → alla varianter som normaliseras dit
const REVERSE_LOOKUP = new Map();
for (const [variant, canonical] of Object.entries(NORMALIZATION_TABLE)) {
  if (!REVERSE_LOOKUP.has(canonical)) REVERSE_LOOKUP.set(canonical, new Set());
  REVERSE_LOOKUP.get(canonical).add(variant);
  REVERSE_LOOKUP.get(canonical).add(canonical);
}

/**
 * Extrahera sökbara ingrediensnamn för ett recept.
 * Skippar pantry-items (salt, peppar, vatten).
 */
export function extractSearchTerms(recipe) {
  const terms = [];
  for (const raw of recipe.ingredients || []) {
    const { name } = parseIngredient(raw);
    const normalized = normalizeName(name);
    if (PANTRY_ALWAYS_SKIP.has(normalized)) continue;
    if (PANTRY_ALWAYS_SKIP.has(name)) continue;

    // Samla alla söktermer: kanoniskt namn + alla kända varianter
    const searchTerms = new Set([normalized]);
    if (REVERSE_LOOKUP.has(normalized)) {
      for (const v of REVERSE_LOOKUP.get(normalized)) searchTerms.add(v);
    }
    // Lägg till rånamnet också (före normalisering)
    searchTerms.add(name);

    terms.push({ raw, normalized, searchTerms: [...searchTerms] });
  }
  return terms;
}

/**
 * Poängsätt en matchning mellan ett sökord och ett erbjudandeproduktnamn.
 * Returnerar 0–100 eller 0 om ingen matchning.
 */
function scoreMatch(searchTerm, offerProduct) {
  const term = searchTerm.toLowerCase();
  const product = offerProduct.toLowerCase();

  // Exakt match
  if (product === term) return 100;

  // Erbjudandet innehåller söktermen som helt ord
  const wordBoundary = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  if (wordBoundary.test(product)) return 80;

  // Erbjudandet innehåller söktermen som substring
  if (product.includes(term)) return 60;

  // Söktermen innehåller erbjudandets produktnamn (omvänd match)
  if (term.includes(product) && product.length >= 3) return 40;

  return 0;
}

/**
 * Förbehandla erbjudandeproduktnamn — strippa vanliga varumärken och viktangivelser.
 */
const BRAND_STRIP = /\b(arla|findus|felix|kronfågel|scan|garant|ica|coop|eldorado|favorit)\b/gi;
const WEIGHT_STRIP = /\d+\s*(?:g|kg|ml|cl|dl|l|st)\b/gi;

function cleanOfferProduct(product) {
  return product
    .replace(BRAND_STRIP, "")
    .replace(WEIGHT_STRIP, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Matcha alla erbjudanden mot alla recept.
 * Returnerar { [recipeId]: { matchCount, totalIngredients, offerScore, matches } }
 */
export function matchOffersToRecipes(offers, recipes) {
  // Förbehandla erbjudanden
  const cleanedOffers = offers.map((o) => ({
    ...o,
    cleanProduct: cleanOfferProduct(o.product),
  }));

  const result = {};

  for (const recipe of recipes) {
    const terms = extractSearchTerms(recipe);
    const matches = [];

    for (const term of terms) {
      let bestScore = 0;
      let bestOffer = null;

      for (const offer of cleanedOffers) {
        // Testa alla söktermer för denna ingrediens
        for (const searchTerm of term.searchTerms) {
          const score = scoreMatch(searchTerm, offer.cleanProduct);
          if (score > bestScore) {
            bestScore = score;
            bestOffer = offer;
          }
          // Testa också mot orginalprodukten (innan brand-strip)
          const scoreOrig = scoreMatch(searchTerm, offer.product);
          if (scoreOrig > bestScore) {
            bestScore = scoreOrig;
            bestOffer = offer;
          }
        }
      }

      if (bestOffer && bestScore >= 60) {
        matches.push({
          ingredient: term.normalized,
          offerId: bestOffer.id,
          offerProduct: bestOffer.product,
          score: bestScore,
          discount: bestOffer.discount,
        });
      }
    }

    const totalIngredients = terms.length;
    const matchCount = matches.length;

    result[String(recipe.id)] = {
      matchCount,
      totalIngredients,
      offerScore: totalIngredients > 0 ? matchCount / totalIngredients : 0,
      matches,
    };
  }

  return result;
}
