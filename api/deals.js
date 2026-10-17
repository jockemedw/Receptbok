// Prisoptimera — veckans Willys-reor till genereringsguiden.
//
//   GET  /api/deals            (publik — proxad rea-data, ingen familjedata)
//     → veckans Willys-reor GRUPPERADE per ingrediens (canon), sorterade på bästa
//       besparing. Visas som chips i genereringsguidens rea-sektion
//       (js/weekly-plan/wiz-deals.js); valda canons skickas som deal_canons till
//       /api/generate (Session 150).
//
// Den gamla POST-vägen (receptförslag till Prisoptimera-arket, oanvänd sedan
// Session 150) togs bort Session 155 — den läste recept via "första hushållet"
// och hade läckt hushåll #1:s recept till nya hushåll. Allt utom GET/OPTIONS → 405.
//
// Grupperingen här och deal_canons-filtreringen i generate.js använder SAMMA
// extractOfferCanon, så det familjen väljer i guiden är exakt det som räknas där.

import { fetchOffersFromWillys } from "./_shared/willys-offers.js";
import { extractOfferCanon } from "./_shared/willys-matcher.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// ── GET: reor grupperade per ingrediens (publik) ──
async function offersHandler(req, res) {
  setCors(res);

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
    console.error("deals (offers) error:", err);
    return res.status(502).json({ error: "Kunde inte hämta Willys-erbjudanden — prova igen om en stund." });
  }
}

// Metod-router: GET publikt, OPTIONS-preflight 200, allt annat 405.
export default function handler(req, res) {
  if (req.method === "GET") return offersHandler(req, res);
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  return res.status(405).json({ error: "Metod ej tillåten" });
}
