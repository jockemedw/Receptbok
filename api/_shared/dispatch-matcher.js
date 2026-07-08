// Per-canon-matchning för dispatch till Willys.
// Försöker rea-träff först (från willys-offers-cache), söker annars.
//
// Input:
//   canons       — array av canon-strängar (dubbletter OK, dedupeas)
//   offers       — array i shopping-builder-shape ({code, name, brandLine, ...})
//   searchClient — { findProductByCanon(canon, wanted?): Promise<{code, name, ...} | null> }
//   opts.wantedForCanon — (canon) => { organic: bool, swedish: bool } | null.
//     Inköpspreferenserna (eko/svenskt per kategori, backlog #20): bland flera
//     giltiga kandidater föredras den som uppfyller preferensen; finns ingen
//     sådan väljs som förut (preferensen blockerar aldrig en match).
//
// Output:
//   { matched: [{canon, code, name, brandLine, source, savingPerUnit?}],
//     unmatched: [canon],
//     preferenceMisses: [{ canon, wanted: ["eko"|"svenskt", ...] }] }

import { extractOfferCanon, rejectsMatch, brandBlocked } from "./willys-matcher.js";

// Igenkänning av eko/svenskt i produktnamn + varumärkesrad. Willys skriver
// t.ex. "Mellanmjölk Eko 1,5%", "KRAV", "Svenskt Butikskött", "Från Sverige".
export const ORGANIC_RE = /\b(eko|ekologisk\w*|krav|kravmärkt|organic)\b/i;
export const SWEDISH_RE = /\b(svensk\w*|sverige)\b/i;

function prefScore(text, wanted) {
  if (!wanted) return 0;
  let s = 0;
  if (wanted.organic && ORGANIC_RE.test(text)) s++;
  if (wanted.swedish && SWEDISH_RE.test(text)) s++;
  return s;
}

function unmetWants(text, wanted) {
  const misses = [];
  if (wanted?.organic && !ORGANIC_RE.test(text)) misses.push("eko");
  if (wanted?.swedish && !SWEDISH_RE.test(text)) misses.push("svenskt");
  return misses;
}

// concurrency — antal samtidiga sök-anrop mot Willys. Sökningarna kördes
// tidigare en-i-taget; med 30 varor blev det 30 sekventiella HTTP-anrop och
// dispatchen timeade ut. Begränsad parallellism håller oss snabba utan att
// hamra Willys publika sök-endpoint.
export async function matchCanons(canons, offers, searchClient, { concurrency = 6, blockedBrands = [], wantedForCanon = null } = {}) {
  const unique = [...new Set(canons.filter(Boolean))];
  const matched = [];
  const unmatched = [];
  const preferenceMisses = [];

  function recordHit(canon, hit, source, savingPerUnit) {
    matched.push({
      canon,
      code: hit.code,
      name: hit.name,
      brandLine: hit.brandLine || null,
      source,
      savingPerUnit,
    });
    const wanted = wantedForCanon?.(canon);
    const misses = unmetWants(`${hit.name} ${hit.brandLine || ""}`, wanted);
    if (misses.length) preferenceMisses.push({ canon, wanted: misses });
  }

  // Steg 1: rea-matchning är synkron (mot redan hämtad erbjudande-cache).
  const toSearch = [];
  for (const canon of unique) {
    const reaHit = findReaMatch(canon, offers, blockedBrands, wantedForCanon?.(canon));
    if (reaHit) {
      recordHit(canon, reaHit, "rea", reaHit.savingPerUnit || 0);
    } else {
      toSearch.push(canon);
    }
  }

  // Steg 2: sök-missarna parallellt med begränsad samtidighet.
  let cursor = 0;
  async function worker() {
    while (cursor < toSearch.length) {
      const canon = toSearch[cursor++];
      const searchHit = await searchClient.findProductByCanon(canon, wantedForCanon?.(canon));
      if (searchHit) {
        recordHit(canon, searchHit, "search", 0);
      } else {
        unmatched.push(canon);
      }
    }
  }
  const workerCount = Math.min(concurrency, toSearch.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { matched, unmatched, preferenceMisses };
}

function findReaMatch(canon, offers, blockedBrands = [], wanted = null) {
  // Väljer, bland giltiga erbjudanden för denna canon, det som besparingen
  // FAKTISKT räknades på i planen: störst savingPerUnit — exakt samma regel som
  // matchRecipe använder för totalSaving (max savingPerUnit per canon). Så hamnar
  // just den rea-vara familjen ser besparingen för i korgen, inte en godtycklig
  // första-träff när samma canon har flera reor (t.ex. "lax" med tre erbjudanden).
  //
  // Preferens (eko/svenskt, backlog #20) väger tyngst när den är på: bäst
  // prefScore först, störst besparing som tie-break. Utan preferens har alla
  // score 0 → ren max-besparing (blockerar aldrig en match).
  let best = null;
  let bestScore = -1;
  let bestSaving = -Infinity;
  for (const offer of offers) {
    if (extractOfferCanon(offer) !== canon) continue;
    if (rejectsMatch(canon, offer)) continue;
    if (brandBlocked(offer, blockedBrands)) continue;
    const score = wanted ? prefScore(`${offer.name} ${offer.brandLine || ""}`, wanted) : 0;
    const saving = offer.savingPerUnit || 0;
    if (score > bestScore || (score === bestScore && saving > bestSaving)) {
      best = offer;
      bestScore = score;
      bestSaving = saving;
    }
  }
  return best;
}
