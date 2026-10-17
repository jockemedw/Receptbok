// Willys-erbjudanden — feed-klient + normaliserare (delad modul, ingen endpoint).
//
// fetchOffersFromWillys(store) hämtar live från Willys publika campaigns-endpoint
// (ingen auth); butik styrs av anroparen (WILLYS_STORE_ID, fallback 2160).
// Släpper bara igenom promotion-typer med rent styckpris (isMatchablePromo) — SubtotalOrderPromotion bara när den är ovillkorad (threshold 0/null).
// Returnerar kompakt shape per Session 27-beslutet (~30 KB istf 485 KB).
//
// Var tidigare den publika endpointen GET /api/willys-offers, som saknade klient
// och var en öppen proxy mot Willys — borttagen Session 155. Används av
// api/deals.js (GET, rea-chips i guiden), api/generate.js och dispatchen.

const WILLYS_BASE = "https://www.willys.se/search/campaigns/online";
const MATCHABLE_PROMO_TYPES = new Set([
  "MixMatchPricePromotion",
  "MixMatchPercentagePromotion",
  "SubtotalOrderPromotion",
]);

// Avgör om en promotion ger ett rent styckpris vi kan räkna besparing på.
// SubtotalOrderPromotion bär ofta Willys Plus-klubbpriser (campaignType
// "LOYALTY"), men kan också vara villkorade av ordersumman (threshold > 0) —
// då är priset inte ett styckpris och saving går inte att räkna per vara.
// Klubbpriserna har threshold 0/null (ovillkorade) → bara dem släpper vi in.
function isMatchablePromo(p) {
  if (!MATCHABLE_PROMO_TYPES.has(p.promotionType)) return false;
  if (p.promotionType === "SubtotalOrderPromotion" && p.threshold) return false;
  return true;
}

// Willys campaigns-endpoint returnerar alla kampanjer i butiken, inte bara
// mat. Filtrerar bort icke-mat via substring-blocklist så matcher/UI inte
// falsk-matchar "Sterilcat Lax Kattmat" mot lax-recept, "Citron Allrent
// Rengöring" mot citron-recept, etc.
const NON_FOOD_RE = new RegExp(
  [
    // Djurmat
    "kattmat", "kattgodis", "kattmos", "kattsnacks", "hundmat", "hundgodis",
    "hundbajs", "djurmat", "djurfoder", "våtfoder", "torrfoder",
    // Rengöring
    "rengör", "allrent", "tvättmedel", "diskmedel", "maskinrengör", "golvmopp",
    "diskborste", "avfallspåse", "soppåse", "madrasskydd",
    // Hygien & kosmetika
    "schampo", "shampo", "tandkräm", "tandborste", "deodorant", "deospray",
    "handtvål", "handcreme", "bodylotion", "body lotion", "ansiktsrengör",
    "ansiktmask", "ansiktskräm", "hårfärg", "rakgel", "duschcreme", "duschkräm",
    "duschgel", "blöja", "byxblöjor", "tampong", "\\bbinda\\b", "\\bbindor\\b", "sun lotion",
    "moisture bomb", "deo roll",
    // Pappersvaror & förbrukning
    "toalettpapper", "bakplåtspapper", "hushållspapper", "våtservett",
    "fryspåsar", "plastpåse", "engångsmugg", "muffinsformar", "tändblock",
    // Tillskott & ej livsmedel
    "halstablett", "tuggtablett", "kapslar", "creatin", "kosttillskott",
    "proteinpulver", "protein pulver", "protein shake", "protein bar",
    "viktminskning", "näringsdryck", "vitaminer",
    // Ej mat
    "\\brosor\\b", "sneakers",
  ].join("|"),
  "i"
);

function isNonFood(offer) {
  return NON_FOOD_RE.test(`${offer.name} ${offer.brandLine || ""}`);
}

// Återanvändbar fetch av offers utan HTTP-hop — används av dispatch-to-willys, deals och generate.
// Tar en storeId och en optional fetchImpl (för testbarhet).
export async function fetchOffersFromWillys(store, fetchImpl = fetch) {
  const url = `${WILLYS_BASE}?q=${store}&type=PERSONAL_GENERAL&page=0&size=500`;
  const upstream = await fetchImpl(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Receptbok/1.0 (familjematplanering)",
    },
  });
  if (!upstream.ok) {
    throw new Error(`Willys svarade ${upstream.status}`);
  }
  const data = await upstream.json();
  return normalizeOffers(data.results || []);
}

// Tolkar förpackningsstorlek ("2kg", "1,5l", "ca: 1.8kg", "500g", "10p") till
// gram/ml och flaggar storpack (≥1 kg / 1 l). Används för att märka och nedvikta
// fynd där receptet bara förbrukar en bråkdel av förpackningen.
export function isBulkVolume(displayVolume) {
  if (!displayVolume) return false;
  const s = String(displayVolume).toLowerCase().replace(/ca[:.]?\s*/g, "").replace(",", ".").trim();
  const m = s.match(/([\d.]+)\s*(kg|g|l|dl|cl|ml)\b/);
  if (!m) return false;
  const val = parseFloat(m[1]);
  if (!Number.isFinite(val)) return false;
  const factor = { kg: 1000, g: 1, l: 1000, dl: 100, cl: 10, ml: 1 }[m[2]];
  return val * factor >= 1000;
}

// Tolkar en displayVolume-sträng ("2kg", "500g", "ca: 1.8kg") till kg. Delar
// samma toleranta parsing som isBulkVolume (ca-prefix, komma-decimal), men
// bryr sig bara om vikt-enheter (kg/g) — kr/kg-priser hör alltid ihop med en
// vikt, aldrig volym. Returnerar null om strängen inte går att tolka.
function parseWeightKg(displayVolume) {
  if (!displayVolume) return null;
  const s = String(displayVolume).toLowerCase().replace(/ca[:.]?\s*/g, "").replace(",", ".").trim();
  const m = s.match(/([\d.]+)\s*(kg|g)\b/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (!Number.isFinite(val)) return null;
  return m[2] === "kg" ? val : val / 1000;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export function normalizeOffers(results) {
  const offers = [];
  for (const item of results) {
    if (isNonFood(item)) continue;
    const promo = (item.potentialPromotions || []).find(isMatchablePromo);
    if (!promo) continue;

    let regularPrice = typeof item.priceValue === "number" ? item.priceValue : null;
    let promoPrice = typeof promo.price?.value === "number" ? promo.price.value : null;
    let savingPerUnit = typeof item.savingsAmount === "number" ? item.savingsAmount : null;
    if (regularPrice === null || promoPrice === null) continue;

    // F290: Willys anger kr/kg-priser per kilo, inte per förpackning — att
    // blanda in dem rakt av i en kedja som annars räknar kr/st (matchRecipe,
    // "Sparat ca X kr") ger dimensionellt meningslösa summor. Räkna om till
    // förpackningsnivå när vi kan tolka förpackningens vikt ur displayVolume.
    const weightKg = item.priceUnit === "kr/kg" ? parseWeightKg(item.displayVolume) : null;
    if (weightKg) {
      regularPrice = round2(regularPrice * weightKg);
      promoPrice = round2(promoPrice * weightKg);
      if (savingPerUnit !== null) savingPerUnit = round2(savingPerUnit * weightKg);
    }

    // F292: qualifyingCount > 1 ("2 för X") betyder att savingsAmount är HELA
    // besparingen över köpvillkoret, inte per styck/förpackning. matchRecipe
    // (willys-matcher.js) tar savingPerUnit rakt av per receptets EN enhet —
    // dela ned till äkta styckbesparing så visning/matchning inte överdriver
    // med en faktor qualifyingCount. qualifyingCount/conditionLabel behålls
    // oförändrade så UI:t fortfarande kan visa köpvillkoret ("2 för 30 kr").
    const qualifyingCount = promo.qualifyingCount ?? 1;
    if (qualifyingCount > 1 && savingPerUnit !== null) {
      savingPerUnit = round2(savingPerUnit / qualifyingCount);
    }

    offers.push({
      code: item.code,
      name: item.name,
      brandLine: item.productLine2 || null,
      loyalty: promo.campaignType === "LOYALTY",
      bulk: isBulkVolume(item.displayVolume),
      displayVolume: item.displayVolume || null,
      regularPrice,
      promoPrice,
      savingPerUnit,
      qualifyingCount,
      realMixAndMatch: !!promo.realMixAndMatch,
      conditionLabel: promo.conditionLabel || null,
      validUntil: (() => {
        const vu = promo.validUntil ? new Date(promo.validUntil) : null;
        return vu && !isNaN(vu) ? vu.toISOString() : null;
      })(),
      comparePrice: item.comparePrice || null,
      priceUnit: item.priceUnit || null,
    });
  }
  return offers;
}
