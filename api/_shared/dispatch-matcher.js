// Per-canon-matchning för dispatch till Willys.
// Försöker rea-träff först (från willys-offers-cache), söker annars.
//
// Input:
//   canons       — array av canon-strängar (dubbletter OK, dedupeas)
//   offers       — array i shopping-builder-shape ({code, name, brandLine, ...})
//   searchClient — { findProductByCanon(canon): Promise<{code, name, ...} | null> }
//
// Output:
//   { matched: [{canon, code, name, brandLine, source, savingPerUnit?}], unmatched: [canon] }

import { extractOfferCanon, rejectsMatch, brandBlocked } from "./willys-matcher.js";

// concurrency — antal samtidiga sök-anrop mot Willys. Sökningarna kördes
// tidigare en-i-taget; med 30 varor blev det 30 sekventiella HTTP-anrop och
// dispatchen timeade ut. Begränsad parallellism håller oss snabba utan att
// hamra Willys publika sök-endpoint.
export async function matchCanons(canons, offers, searchClient, { concurrency = 6, blockedBrands = [] } = {}) {
  const unique = [...new Set(canons.filter(Boolean))];
  const matched = [];
  const unmatched = [];

  // Steg 1: rea-matchning är synkron (mot redan hämtad erbjudande-cache).
  const toSearch = [];
  for (const canon of unique) {
    const reaHit = findReaMatch(canon, offers, blockedBrands);
    if (reaHit) {
      matched.push({
        canon,
        code: reaHit.code,
        name: reaHit.name,
        brandLine: reaHit.brandLine || null,
        source: "rea",
        savingPerUnit: reaHit.savingPerUnit || 0,
      });
    } else {
      toSearch.push(canon);
    }
  }

  // Steg 2: sök-missarna parallellt med begränsad samtidighet.
  let cursor = 0;
  async function worker() {
    while (cursor < toSearch.length) {
      const canon = toSearch[cursor++];
      const searchHit = await searchClient.findProductByCanon(canon);
      if (searchHit) {
        matched.push({
          canon,
          code: searchHit.code,
          name: searchHit.name,
          brandLine: searchHit.brandLine || null,
          source: "search",
          savingPerUnit: 0,
        });
      } else {
        unmatched.push(canon);
      }
    }
  }
  const workerCount = Math.min(concurrency, toSearch.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { matched, unmatched };
}

function findReaMatch(canon, offers, blockedBrands = []) {
  for (const offer of offers) {
    const offerCanon = extractOfferCanon(offer);
    if (offerCanon !== canon) continue;
    if (rejectsMatch(canon, offer)) continue;
    if (brandBlocked(offer, blockedBrands)) continue;
    return offer;
  }
  return null;
}
