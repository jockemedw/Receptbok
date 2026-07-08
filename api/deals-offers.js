// Prisoptimera, steg 1 — veckans Willys-reor GRUPPERADE per ingrediens (canon),
// sorterade på bästa besparing. Underlag för att låta familjen kryssa i vilka
// varor de vill ha receptförslag från (steg 2 = api/deals-recipes).
//
// GET /api/deals-offers  (publik, som /api/willys-offers — bara proxad publik rea-data)
//   store styrs av WILLYS_STORE_ID (default 2160, Willys Ekholmen).
//
// Grupperingen använder SAMMA canon-extraktion (extractOfferCanon) som
// receptmatchningen, så det man kryssar i steg 1 är exakt det som driver
// receptträffarna i steg 2. Erbjudanden som inte mappar till en känd ingrediens
// (extractOfferCanon → null) utelämnas — bara varor som faktiskt kan bli recept.

import { fetchOffersFromWillys } from "./willys-offers.js";
import { extractOfferCanon } from "./_shared/willys-matcher.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Metod ej tillåten" });

  const store = process.env.WILLYS_STORE_ID || "2160";

  try {
    const offers = await fetchOffersFromWillys(store);

    // Gruppera per canon (huvudingrediens). Behåll bara de fält UI:t visar.
    const byCanon = new Map();
    for (const o of offers) {
      const canon = extractOfferCanon(o);
      if (!canon) continue;
      if (!byCanon.has(canon)) byCanon.set(canon, []);
      byCanon.get(canon).push({
        name: o.name,
        brandLine: o.brandLine || null,
        promoPrice: o.promoPrice,
        regularPrice: o.regularPrice,
        savingPerUnit: o.savingPerUnit,
        loyalty: !!o.loyalty,
        bulk: !!o.bulk,
      });
    }

    const groups = [...byCanon.entries()]
      .map(([canon, list]) => {
        const sorted = list.sort((a, b) => (b.savingPerUnit || 0) - (a.savingPerUnit || 0));
        const bestSaving = Math.max(0, ...sorted.map((o) => o.savingPerUnit || 0));
        return { canon, bestSaving, count: sorted.length, offers: sorted };
      })
      .filter((g) => g.bestSaving > 0)
      .sort((a, b) => b.bestSaving - a.bestSaving);

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=7200");
    return res.status(200).json({ generated: new Date().toISOString(), store, groups });
  } catch (err) {
    console.error("deals-offers error:", err);
    return res.status(502).json({ error: "Kunde inte hämta Willys-erbjudanden — prova igen om en stund." });
  }
}
