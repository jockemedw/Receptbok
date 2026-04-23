// Sökklient mot Willys publika /search-endpoint.
// Används som fallback när en canon inte finns i rea-kampanj-cachen.
//
// Returnerad hit-shape: { code, name, brandLine, priceValue, canon, source: 'search' }
//
// Filter: första träff vars extractOfferCanon === canon OCH ej rejectsMatch.
// Detta eliminerar klassiska buggar från 4E-rekonen:
//   - vitlöksklyftor → "Lök Vit Stor" (sökmotorn stemmar "lök")
//   - grädde → "Spraygrädde Vispgrädde 35%" (spraygrädde ≠ matlagningsgrädde)

import { extractOfferCanon, rejectsMatch } from "./willys-matcher.js";

const SEARCH_URL = "https://www.willys.se/search";

export function createSearchClient({ fetchImpl = fetch } = {}) {
  async function findProductByCanon(canon) {
    const url = `${SEARCH_URL}?q=${encodeURIComponent(canon)}&size=10`;
    const res = await fetchImpl(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Receptbok/1.0 (familjematplanering)",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.results || [];
    for (const r of results) {
      if (r.outOfStock) continue;
      if (r.online === false) continue;
      const offerShape = { name: r.name || "", brandLine: r.productLine2 || "" };
      const offerCanon = extractOfferCanon(offerShape);
      if (offerCanon !== canon) continue;
      if (rejectsMatch(canon, offerShape)) continue;
      return {
        code: r.code,
        name: r.name,
        brandLine: r.productLine2 || null,
        priceValue: typeof r.priceValue === "number" ? r.priceValue : null,
        canon,
        source: "search",
      };
    }
    return null;
  }
  return { findProductByCanon };
}
