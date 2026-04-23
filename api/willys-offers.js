// Willys-erbjudanden — proxy + normaliserare
//
// GET /api/willys-offers?store=<storeId>
//   default storeId = 2160 (Willys Linköping Ekholmen)
//
// Hämtar live från Willys publika campaigns-endpoint (ingen auth).
// Filtrerar bort icke-matchbara promotion-typer (SubtotalOrderPromotion).
// Returnerar kompakt shape per Session 27-beslutet (~30 KB istf 485 KB).
//
// Caching: 1h CDN-cache via Cache-Control — inga serverless cold-start-kostnader
// vid täta anrop från UI:t.

const WILLYS_BASE = "https://www.willys.se/search/campaigns/online";
const DEFAULT_STORE = "2160";
const MATCHABLE_PROMO_TYPES = new Set([
  "MixMatchPricePromotion",
  "MixMatchPercentagePromotion",
]);

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
    "duschgel", "blöja", "byxblöjor", "tampong", "binda", "sun lotion",
    "moisture bomb", "deo roll",
    // Pappersvaror & förbrukning
    "toalettpapper", "bakplåtspapper", "hushållspapper", "våtservett",
    "fryspåsar", "plastpåse", "engångsmugg", "muffinsformar", "tändblock",
    // Tillskott & ej livsmedel
    "halstablett", "tuggtablett", "kapslar", "creatin", "kosttillskott",
    "proteinpulver", "protein pulver", "protein shake", "protein bar",
    "viktminskning", "näringsdryck", "vitaminer",
    // Ej mat
    "rosor", "sneakers", "hårfärg",
  ].join("|"),
  "i"
);

function isNonFood(offer) {
  return NON_FOOD_RE.test(`${offer.name} ${offer.brandLine || ""}`);
}

// Återanvändbar fetch av offers utan HTTP-hop — används av dispatch-to-willys.
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Metod ej tillåten" });

  const store = String(req.query?.store || DEFAULT_STORE).trim();
  if (!/^\d{3,5}$/.test(store)) {
    return res.status(400).json({ error: "Ogiltigt store-ID — ange 3–5 siffror." });
  }

  try {
    const offers = await fetchOffersFromWillys(store);
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=7200");
    return res.status(200).json({
      generated: new Date().toISOString(),
      store,
      count: offers.length,
      offers,
    });
  } catch (err) {
    console.error("willys-offers error:", err);
    return res.status(502).json({
      error: "Kunde inte hämta Willys-erbjudanden — prova igen om en stund.",
    });
  }
}

export function normalizeOffers(results) {
  const offers = [];
  for (const item of results) {
    if (isNonFood(item)) continue;
    const promo = (item.potentialPromotions || []).find((p) =>
      MATCHABLE_PROMO_TYPES.has(p.promotionType)
    );
    if (!promo) continue;

    const regularPrice = typeof item.priceValue === "number" ? item.priceValue : null;
    const promoPrice = typeof promo.price?.value === "number" ? promo.price.value : null;
    const savingPerUnit = typeof item.savingsAmount === "number" ? item.savingsAmount : null;
    if (regularPrice === null || promoPrice === null) continue;

    offers.push({
      code: item.code,
      name: item.name,
      brandLine: item.productLine2 || null,
      regularPrice,
      promoPrice,
      savingPerUnit,
      qualifyingCount: promo.qualifyingCount ?? 1,
      realMixAndMatch: !!promo.realMixAndMatch,
      conditionLabel: promo.conditionLabel || null,
      validUntil: promo.validUntil ? new Date(promo.validUntil).toISOString() : null,
      comparePrice: item.comparePrice || null,
      priceUnit: item.priceUnit || null,
    });
  }
  return offers;
}
