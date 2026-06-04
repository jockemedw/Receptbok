// Sökklient mot Willys publika /search-endpoint.
// Används som fallback när en canon inte finns i rea-kampanj-cachen.
//
// Returnerad hit-shape: { code, name, brandLine, priceValue, canon, source: 'search' }
//
// Tvåstegs-matchning (alltid med rejectsMatch som skydd):
//   Steg 1 (föredraget): första träff vars extractOfferCanon === canon. Exakt
//     canon-likhet skyddar mot klassiska 4E-buggar — sökning "vitlöksklyftor"
//     hittar "Vitlök Klass 1" före "Lök Vit Stor", "grädde" undviker spraygrädde.
//   Steg 2 (relevans-fallback): om inget exakt-canon-träff finns, ta första
//     träff vars namn delar ordstam med sök-termen (relevantToCanon). Det
//     fångar vanliga varor vars Willys-namn stemmar till en annan/ingen canon:
//     "färs" → "Nötfärs", "banan" → "Banan", "toalettpapper" → "Toalettpapper".

import { extractOfferCanon, rejectsMatch, relevantToCanon, brandBlocked } from "./willys-matcher.js";

const SEARCH_URL = "https://www.willys.se/search";

export function createSearchClient({ fetchImpl = fetch, blockedBrands = [] } = {}) {
  async function findProductByCanon(canon) {
    const url = `${SEARCH_URL}?q=${encodeURIComponent(canon)}&size=20`;
    const res = await fetchImpl(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Receptbok/1.0 (familjematplanering)",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.results || [];

    // Köpbara, ej avvisade träffar (delad pool för båda stegen).
    const candidates = [];
    for (const r of results) {
      if (r.outOfStock) continue;
      if (r.online === false) continue;
      const offerShape = { name: r.name || "", brandLine: r.productLine2 || "" };
      if (rejectsMatch(canon, offerShape)) continue;
      if (brandBlocked(offerShape, blockedBrands)) continue;
      candidates.push({ r, offerShape });
    }

    const toHit = ({ r }) => ({
      code: r.code,
      name: r.name,
      brandLine: r.productLine2 || null,
      priceValue: typeof r.priceValue === "number" ? r.priceValue : null,
      canon,
      source: "search",
    });

    // Steg 1: exakt canon-likhet.
    const exact = candidates.find(({ offerShape }) => extractOfferCanon(offerShape) === canon);
    if (exact) return toHit(exact);

    // Steg 2: relevans-fallback.
    const relevant = candidates.find(
      ({ offerShape }) => relevantToCanon(canon, `${offerShape.name} ${offerShape.brandLine}`)
    );
    if (relevant) return toHit(relevant);

    return null;
  }
  return { findProductByCanon };
}
