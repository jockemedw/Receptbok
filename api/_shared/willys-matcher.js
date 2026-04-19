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

// Canons vars produktförpackning på Willys normalt räcker till många recept.
// När receptet bara använder en liten mängd (1-2 klyftor, ett skal, en kvist)
// är det missvisande att kreditera hela offer.savingPerUnit till just detta
// recept — förpackningen räcker i veckor. För dessa canons skippas matchen
// helt om recipe-mängden är "liten" (se isSmallUsage).
const SMALL_USAGE_CANONS = new Set([
  // Lökfamiljen
  "lök", "rödlök", "schalottenlök", "salladslök", "silverlök", "purjolök",
  "vitlöksklyftor",
  // Citrus (används ofta som skal/saft)
  "citron", "lime",
  // Aromatiska rötter
  "ingefära", "chili",
  // Färska örter
  "persilja", "koriander", "basilika", "dill", "gräslök", "rosmarin",
  "timjan", "mynta", "oregano", "lagerblad", "dragon",
  // Smör (paket räcker i veckor; recept använder 1-2 msk eller 25-50 g)
  "smör",
]);

// Enheter som alltid indikerar liten mängd relativt en förpackning.
const SMALL_UNIT_MARKERS = new Set([
  "klyfta", "klyftor", "kvist", "kvistar", "skiva", "skivor",
  "nypa", "krm", "tsk", "msk", "tumme", "tummar", "cm", "näve", "bit", "bitar",
]);

// Avgör om recipe-mängderna för en canon är "små" relativt en typisk
// förpackning — dvs. inte motiverar full saving-kreditering.
// Om NÅGON av recipe-raderna är substantiell (t.ex. "200 g lök") räknas
// canonen som fullt använd och saving behålls.
function isSmallUsage(canon, usages) {
  if (!SMALL_USAGE_CANONS.has(canon)) return false;
  for (const { amount, unit } of usages) {
    const u = unit ? unit.toLowerCase() : null;
    if (u && SMALL_UNIT_MARKERS.has(u)) continue;          // ex. "2 klyftor"
    if (!u && (amount === null || amount <= 3)) continue;  // ex. "1 lök", "2 citroner"
    if (u === "g" && amount !== null && amount < 100) continue;
    if (u === "ml" && amount !== null && amount < 50) continue;
    if (u === "dl" && amount !== null && amount < 0.5) continue;
    // Substantial: hela förpackningen eller nära det → behåll saving.
    return false;
  }
  return true;
}

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

// Bygg en Map: canon → [{ amount, unit }] för alla recept-ingredienser.
// Flera rader kan dela canon (t.ex. "1 gul lök" + "2 schalottenlökar" båda → lök)
// så vi behåller alla usages för att isSmallUsage ska kunna bedöma helheten.
function extractRecipeCanonUsages(recipe) {
  const usages = new Map();
  for (const raw of recipe.ingredients || []) {
    const parsed = parseIngredient(raw);
    const canon = normalizeName(parsed.name);
    if (!canon) continue;
    if (!usages.has(canon)) usages.set(canon, []);
    usages.get(canon).push({ amount: parsed.amount, unit: parsed.unit });
  }
  return usages;
}

// Matchar ett recept mot en lista offers.
// Returnerar { recipeId, matches: [{canon, offer}], totalSaving }
// Matches som gäller small-usage canons (lök, vitlök, örter osv) med liten
// recipe-mängd filtreras bort helt så att popover och saving-badge är konsekventa.
// totalSaving tar max savingPerUnit per kanonisk term (inte summan av alla
// offers som råkar matcha samma canon — användaren väljer ett erbjudande).
export function matchRecipe(recipe, offers) {
  const canonUsages = extractRecipeCanonUsages(recipe);
  const matches = [];
  for (const offer of offers) {
    const canon = extractOfferCanon(offer);
    if (!canon || !canonUsages.has(canon)) continue;
    if (rejectsMatch(canon, offer)) continue;
    if (isSmallUsage(canon, canonUsages.get(canon))) continue;
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
