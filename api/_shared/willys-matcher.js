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
export function rejectsMatch(canon, offer) {
  const pattern = CANON_REJECT_PATTERNS[canon];
  if (!pattern) return false;
  const text = `${offer.name} ${offer.brandLine || ""}`;
  return pattern.test(text);
}

// Lättare relevans-check för SÖK-fallback (ej rea-cachen).
// När vi aktivt sökt Willys med en canon-term är topp-träffen nästan alltid
// rätt produkt — även om dess namn stemmar till en ANNAN canon ("färs" →
// "Nötfärs" → köttfärs) eller till INGEN canon alls ("banan", "toalettpapper").
// Vi kan därför inte kräva canon-likhet i fallbacken. Men vi måste ändå avvisa
// irrelevanta träffar (sökning "vitlöksklyftor" → "Lök Vit Stor").
//
// Regel: någon canon-token (≥4 tecken) ska dela ordstam med en produkt-token —
// antingen identisk, eller där den ena är prefix/suffix av den andra. Det fångar
// sammansättningar (nötFÄRS, fläskFÄRS) och plural (BANANer ⊃ banan) men inte
// "lök"/"vit" ⊄ "vitlöksklyftor" (för korta / fel position).
export function relevantToCanon(canon, text) {
  const productTokens = String(text).toLowerCase()
    .split(/[\s,\-()\/]+/).filter((t) => t.length >= 3);
  const canonTokens = String(canon).toLowerCase()
    .split(/\s+/).filter((t) => t.length >= 4);
  if (canonTokens.length === 0) return false;
  return canonTokens.some((c) =>
    productTokens.some((p) =>
      // Produkten innehåller hela canon-termen vid en ordgräns ("nötfärs" ⊃ "färs")
      p === c || p.endsWith(c) || p.startsWith(c) ||
      // Eller canon är en längre böjning av produkt-token ("bananer" ⊃ "banan").
      // Kräver p ≥4 så korta deltoken ("vit", "lök") inte slinker igenom.
      (p.length >= 4 && (c.startsWith(p) || c.endsWith(p)))
    )
  );
}

// Extrahera EN kanonisk huvudterm ur ett erbjudandenamn.
// Prioritet: längre fras före kortare, tidigare position före senare.
// Detta undviker "Fylld Gnocchi Tomat Mozzarella" → tomat/mozzarella
// (produkten är gnocchi). 2-gram "fylld gnocchi" träffar först → "gnocchi".
export function extractOfferCanon(offer) {
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
