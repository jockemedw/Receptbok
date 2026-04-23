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

import { extractOfferCanon, rejectsMatch } from "./willys-matcher.js";

export async function matchCanons(canons, offers, searchClient) {
  const unique = [...new Set(canons.filter(Boolean))];
  const matched = [];
  const unmatched = [];

  for (const canon of unique) {
    const reaHit = findReaMatch(canon, offers);
    if (reaHit) {
      matched.push({
        canon,
        code: reaHit.code,
        name: reaHit.name,
        brandLine: reaHit.brandLine || null,
        source: "rea",
        savingPerUnit: reaHit.savingPerUnit || 0,
      });
      continue;
    }
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
      continue;
    }
    unmatched.push(canon);
  }

  return { matched, unmatched };
}

function findReaMatch(canon, offers) {
  for (const offer of offers) {
    const offerCanon = extractOfferCanon(offer);
    if (offerCanon !== canon) continue;
    if (rejectsMatch(canon, offer)) continue;
    return offer;
  }
  return null;
}
