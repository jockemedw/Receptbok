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
    const url = `${WILLYS_BASE}?q=${store}&type=PERSONAL_GENERAL&page=0&size=500`;
    const upstream = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Receptbok/1.0 (familjematplanering)",
      },
    });

    if (!upstream.ok) {
      return res.status(502).json({
        error: `Willys svarade ${upstream.status} — prova igen om en stund.`,
      });
    }

    const data = await upstream.json();
    const offers = normalizeOffers(data.results || []);

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=7200");
    return res.status(200).json({
      generated: new Date().toISOString(),
      store,
      count: offers.length,
      offers,
    });
  } catch (err) {
    console.error("willys-offers error:", err);
    return res.status(500).json({
      error: "Kunde inte hämta Willys-erbjudanden — prova igen om en stund.",
    });
  }
}

export function normalizeOffers(results) {
  const offers = [];
  for (const item of results) {
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
