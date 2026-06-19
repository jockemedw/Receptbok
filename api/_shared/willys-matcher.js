// Matchar receptingredienser mot Willys-erbjudanden via CANON-lexikonet
// i shopping-builder.js. Återanvänder samma parseIngredient/normalizeName
// så matchningen är konsekvent med inköpslistan.

import {
  NORMALIZATION_TABLE,
  parseIngredient,
  normalizeName,
  CANON_SET,
  CANON_REJECT_PATTERNS,
  PANTRY_ALWAYS_SKIP,
} from "./shopping-builder.js";

const MAX_NGRAM = 3;

// Canons som ALDRIG räknas som besparing: skafferi (salt/peppar/vatten) +
// matlagningsfett (oljor, smör, margarin). De står i recept men handlas sällan
// separat — att räkna dem skulle blåsa upp besparingen med varor familjen ändå
// har hemma. Bredare än PANTRY_ALWAYS_SKIP (som bara styr inköpslistan; oljor med
// mängd ska fortfarande kunna hamna där). Påverkar enbart matchRecipe/besparing.
const SAVING_SKIP_CANONS = new Set([
  ...PANTRY_ALWAYS_SKIP,
  "olivolja", "rapsolja", "sesamolja", "avokadoolja", "smör", "margarin",
]);

// Barnmat anges ofta med ålder ("Från 6 Månader", "Från 1–3 År") snarare än
// ordet "barnmat". Kräver "från" så att lagrad ost/chark ("Lagrad 24 Månader")
// inte fastnar. Täcker både månader och år samt intervall ("1–3 år").
const BABY_FOOD_RE = /\bfrån\s+\d+\s*[-–]?\s*\d*\s*(mån|år)/i;

// Produkter som ALDRIG är en receptingrediens, oavsett canon — de innehåller
// ofta canon-ord ("Mac & Cheese" → ost, "Barnmat Kyckling" → kyckling,
// "Kattmat Lax" → lax, "Ostbågar" → ost, "Kycklingspett Paprika" → paprika).
// Gäller globalt i rejectsMatch. Medvetet snäv: bara klasser som aldrig handlas
// som ingrediens, så att inga riktiga ingredienser fastnar. "spett" = grillspett
// (kött-/kycklingspett) som ofta är kryddade med en grönsak i namnet.
const GLOBAL_REJECT_RE = /\b(mac\s*&\s*cheese|färdigrätt\w*|färdig rätt|micro\w*|panerad\w*|barnmat|klämmis\w*|ostbåge\w*|kattmat|kattfoder|hundmat|hundfoder|djurfoder|hundgodis|[a-zåäö]*spett)\b/i;

// Kontrollera om offer-texten funktionellt/produktmässigt passar canon.
// Se CANON_REJECT_PATTERNS i shopping-builder.js — löser t.ex.
// spraygrädde-vispgrädde-felmatchningen mot matlagningsgrädde-recept.
// Plus ett globalt filter (GLOBAL_REJECT_RE) som gäller alla canons.
export function rejectsMatch(canon, offer) {
  const text = `${offer.name || ""} ${offer.brandLine || ""}`;
  if (GLOBAL_REJECT_RE.test(text) || BABY_FOOD_RE.test(text)) return true;
  const pattern = CANON_REJECT_PATTERNS[canon];
  if (!pattern) return false;
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

// Avgör om ett erbjudande tillhör ett blockerat varumärke. Användaren anger
// fabrikat att undvika (t.ex. "eldorado") i Inköpspreferenser; här matchar vi
// mot både produktnamn och varumärkesrad (brandLine) på ordstams-nivå.
export function brandBlocked(offer, blockedBrands) {
  if (!blockedBrands || blockedBrands.length === 0) return false;
  const text = `${offer.name || ""} ${offer.brandLine || ""}`.toLowerCase();
  return blockedBrands.some((b) => b && text.includes(String(b).toLowerCase()));
}

// Extrahera EN kanonisk huvudterm ur ett erbjudandenamn.
// Prioritet: längre fras före kortare, tidigare position före senare.
// Detta undviker "Fylld Gnocchi Tomat Mozzarella" → tomat/mozzarella
// (produkten är gnocchi). 2-gram "fylld gnocchi" träffar först → "gnocchi".
export function extractOfferCanon(offer) {
  const text = `${offer.name || ""} ${offer.brandLine || ""}`.toLowerCase();
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
    if (canon && !SAVING_SKIP_CANONS.has(canon)) canons.add(canon);
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

// Bygger "Veckans fynd"-förslag: recept som INTE valts till matsedeln men som
// fångar rea-varor. Topplistan styrs av HUVUDPROTEINETS besparing (receptets
// `protein`-kategori) — inte totalen, så att billig lök/vitlök aldrig lyfter ett
// recept till toppen. Ovanpå det vägs VARIATION in: samma proteintyp dämpas för
// varje gång den återkommer, så listan inte fylls av 25 kycklingrätter bara för
// att kyckling är extrapris. Recept där huvudproteinet inte är på rea hamnar
// under proteinfynden, sorterade på värdeviktad besparing. Ren funktion → testbar.
//   savingsById  – { [recipeId]: { total, matches } } (från generate.js)
//   chosenIds    – array med recept-id som redan ligger i planen
//   recipeLookup – (id) => recipe | undefined (för titel/protein/tid)
export function buildDealCandidates(savingsById, chosenIds, recipeLookup, opts = {}) {
  const { minSaving = 10, limit = 20, bulkWeight = 0.5, diversityDecay = 0.55 } = opts;
  const chosen = new Set(chosenIds);

  const all = Object.entries(savingsById || {})
    .map(([id, e]) => {
      const recipeId = Number(id);
      const r = recipeLookup(recipeId) || null;
      const protein = r?.protein || null;
      return {
        recipeId, total: e.total, matches: e.matches, protein,
        title: r?.title || "", time: r?.time || null,
        proteinSaving: mainProteinSaving(e.matches, protein, bulkWeight),
        valueSaving: weightedSaving(e.matches, e.total, bulkWeight),
      };
    })
    .filter((c) => !chosen.has(c.recipeId) && c.total >= minSaving);

  // Recept vars huvudprotein är på rea → variationsdämpad topplista.
  const proteinDeals = diversifyByProtein(all.filter((c) => c.proteinSaving > 0), diversityDecay);
  // Övriga rea-recept (proteinet ej på rea / vegetariskt) → efter, på värde.
  const others = all.filter((c) => c.proteinSaving <= 0).sort((a, b) => b.valueSaving - a.valueSaving);

  return [...proteinDeals, ...others]
    .slice(0, limit)
    .map((c) => ({
      recipeId: c.recipeId,
      title: c.title,
      protein: c.protein,
      time: c.time,
      saving: Math.round(c.total),
      matches: c.matches,
    }));
}

// Bästa besparingen på receptets HUVUDPROTEIN: max savingPerUnit bland de träffar
// vars canon tillhör receptets protein-kategori. Storpack dämpas (bulkWeight) som
// i värdeviktningen. 0 om proteinet inte är på rea (eller vegetariskt recept).
function mainProteinSaving(matches, protein, bulkWeight) {
  if (!protein || protein === "vegetarisk" || !Array.isArray(matches)) return 0;
  let best = 0;
  for (const m of matches) {
    if (typeof m.savingPerUnit !== "number") continue;
    if (canonProteinCategory(m.canon) !== protein) continue;
    const s = m.bulk ? m.savingPerUnit * bulkWeight : m.savingPerUnit;
    if (s > best) best = s;
  }
  return best;
}

// Variationsdämpad sortering: girigt val där varje recept poängsätts på sin
// proteinbesparing × decay^(antal redan valda av samma proteintyp). Ett starkt
// kycklingfynd toppar fortfarande, men nästa kyckling dämpas så en annan
// proteintyp med nära besparing slinker före → blandad topplista.
function diversifyByProtein(list, decay) {
  const remaining = list.slice();
  const out = [];
  const seen = {};
  while (remaining.length) {
    let bestIdx = 0, bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      const score = c.proteinSaving * Math.pow(decay, seen[c.protein] || 0);
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    const [picked] = remaining.splice(bestIdx, 1);
    seen[picked.protein] = (seen[picked.protein] || 0) + 1;
    out.push(picked);
  }
  return out;
}

// Klassificerar en canon till receptets protein-kategori (fisk|kyckling|kött|fläsk)
// eller null. Ordningen är medveten: fläsk före kött (karré/kassler), så att
// "fläskfärs" landar på fläsk och inte fastnar på köttmönstrets "färs".
const PROTEIN_CATEGORY_PATTERNS = [
  ["kyckling", /kyckling|kalkon/],
  ["fläsk",    /fläsk|bacon|skinka|kassler|karré|revben|prosciutto|salami|chorizo/],
  ["fisk",     /lax|torsk|sej|fisk|räk|skaldjur|tonfisk|sill|makrill|hoki|krabb|mussl|kräft|hummer|ansjovis/],
  ["kött",     /färs|nöt|biff|oxe|oxfilé|oxstek|högrev|entrecote|ryggbiff|lamm|kött|kotlett/],
];
function canonProteinCategory(canon) {
  if (!canon) return null;
  const c = String(canon).toLowerCase();
  for (const [cat, re] of PROTEIN_CATEGORY_PATTERNS) {
    if (re.test(c)) return cat;
  }
  return null;
}

// Värdeviktning för rankning/prioritering — "prio mot proteiner och dyra varor".
// En sparad krona på en dyr vara (lax, kött) ska väga tyngre än en sparad krona
// på en billig stapelvara (vitlök, lök, citron, örter), så att vanliga billiga
// rea-varor inte översvämmar förslagen ("för mycket vitlök"). Datadrivet via
// erbjudandets ordinarie pris — proteiner är naturligt dyra och lyfts automatiskt,
// plus en extra boost för proteinträffar. Påverkar ENBART rankning/bucketing,
// aldrig visad besparing (kr).
const PRICE_PIVOT = 40;          // kr — mellanprisvara ger vikt ≈ 1.0 (≈ rå kr)
const MIN_VALUE_WEIGHT = 0.2;    // golv: billigaste varor trycks ner hårt
const MAX_VALUE_WEIGHT = 2.2;    // tak innan protein-boost så enstaka dyr vara inte exploderar
const PROTEIN_BOOST = 1.5;       // extra lyft när canon är ett protein (kött/fisk/…)
// Substring-matchning håller listan låg-underhåll: täcker sammansättningar
// (kycklingFILÉ, nötFÄRS, fläskKARRÉ) och plural utan att räkna upp varje canon.
const PROTEIN_CANON_RE = /färs|kyckling|fläsk|kött|biff|karré|kassler|kotlett|skinka|bacon|korv|lax|torsk|sej|fisk|räk|skaldjur|kalkon|lamm|revben|filé/i;

// Billiga skafferi-stapelvaror (ris, pasta, nudlar, couscous, bulgur …) ska
// ALDRIG lyfta ett recept över en proteinrea (Joakim, Session 100: "ris rankas
// över kyckling och fetaost"). Prisvikten ensam räcker inte — ett 1 kg-rispaket
// kan ha ordinariepris ~40 kr → vikt ~1.0, alltså INGEN nedviktning som billig
// vitlök/lök får. Vi dämpar därför stapelstärkelserna explicit (motsatsen till
// protein-boosten). Påverkar ENBART rankning, aldrig visad kr-besparing.
const STAPLE_PENALTY = 0.3;
const STAPLE_CANONS = new Set([
  "ris", "risotto-ris", "farro", "bulgur", "matvete", "couscous", "nudlar",
  "pasta", "spaghetti", "makaroner", "penne", "tagliatelle", "lasagneplattor",
]);

// Vikt för en enskild rea-träff. bulkWeight (storpack) bevarad från Session 93.
function valueWeight(match, bulkWeight) {
  const price = typeof match.regularPrice === "number" ? match.regularPrice : null;
  let w = price ? price / PRICE_PIVOT : 1;            // okänt pris → neutral 1.0
  if (w < MIN_VALUE_WEIGHT) w = MIN_VALUE_WEIGHT;
  if (w > MAX_VALUE_WEIGHT) w = MAX_VALUE_WEIGHT;
  if (match.canon && PROTEIN_CANON_RE.test(match.canon)) w *= PROTEIN_BOOST;
  if (match.canon && STAPLE_CANONS.has(match.canon)) w *= STAPLE_PENALTY;
  if (match.bulk) w *= bulkWeight;                    // storpack förbrukas sällan helt
  return w;
}

// Värdeviktad rankningspoäng: summerar savingPerUnit per träff gånger dess
// värdevikt. Ett recept vars besparing kommer från en dyr proteinrea rankas
// över ett vars besparing bara är billig vitlök. Visad besparing (saving) ändras
// INTE; bara sorteringen/prioriteringen. Faller tillbaka på total när matchningar
// saknar savingPerUnit (t.ex. i tester utan prisdata).
export function weightedSaving(matches, total, bulkWeight = 0.5) {
  if (!Array.isArray(matches) || !matches.length) return total || 0;
  let any = false;
  let sum = 0;
  for (const m of matches) {
    if (typeof m.savingPerUnit === "number") {
      any = true;
      sum += m.savingPerUnit * valueWeight(m, bulkWeight);
    }
  }
  return any ? sum : (total || 0);
}
