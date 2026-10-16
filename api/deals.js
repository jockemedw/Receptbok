// Prisoptimera — reor-först-flödet i EN serverless-function.
//
// Slås medvetet ihop till en fil (GET + POST) för att hålla oss under Vercels
// gräns på 12 serverless-functions på gratisplanen. Två separata filer tog
// api/-katalogen till 13 och blockade hela deployen (produktionen fastnade på
// föregående version). Samma flöde, en endpoint:
//
//   GET  /api/deals            (publik, som /api/willys-offers — proxad rea-data)
//     → veckans Willys-reor GRUPPERADE per ingrediens (canon), sorterade på bästa
//       besparing. Visas som chips i genereringsguidens rea-sektion
//       (js/weekly-plan/wiz-deals.js); valda canons skickas som deal_canons till
//       /api/generate (Session 150).
//   POST /api/deals  { canons: ["kyckling", ...] }  (auth)
//     → { suggestions: [{ recipeId, title, protein, time, saving, matches }] }
//       Receptförslag till det gamla Prisoptimera-arket. Anropas inte av klienten
//       sedan Session 150; ligger kvar tills Joakim OK:at borttagning. Bara valda
//       canons räknas, och recepten rankas med störst besparing först via matchRecipe.
//
// Grupperingen här och deal_canons-filtreringen i generate.js använder SAMMA
// extractOfferCanon, så det familjen väljer i guiden är exakt det som räknas där.

import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";
import { fetchOffersFromWillys } from "./willys-offers.js";
import { matchRecipe, extractOfferCanon } from "./_shared/willys-matcher.js";

// ── GET: reor grupperade per ingrediens (publik) ──
async function offersHandler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

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

// ── POST: receptförslag från VALDA rea-ingredienser (auth, oanvänd av klienten sedan Session 150) ──
// En rad per canon = det bästa erbjudandet för den ingrediensen (familjen köper
// ett, inte alla). Speglar byCanon-logiken i generate.js.
function bestMatchesByCanon(matches) {
  const byCanon = new Map();
  for (const { canon, offer } of matches) {
    const cur = byCanon.get(canon);
    if (!cur || (offer.savingPerUnit || 0) > (cur.savingPerUnit || 0)) {
      byCanon.set(canon, {
        canon,
        name: offer.name,
        brandLine: offer.brandLine || null,
        promoPrice: offer.promoPrice,
        regularPrice: offer.regularPrice,
        savingPerUnit: offer.savingPerUnit,
        loyalty: !!offer.loyalty,
        bulk: !!offer.bulk,
      });
    }
  }
  return [...byCanon.values()].sort((a, b) => (b.savingPerUnit || 0) - (a.savingPerUnit || 0));
}

const recipesHandler = createSupabaseHandler(async (req, res) => {
  const rawCanons = Array.isArray(req.body?.canons) ? req.body.canons : [];
  const canonSet = new Set(rawCanons.map((c) => String(c).toLowerCase().trim()).filter(Boolean));
  if (canonSet.size === 0) {
    return res.status(400).json({ error: "Välj minst en vara att få receptförslag från." });
  }

  const householdId = await getHouseholdId();
  const store = process.env.WILLYS_STORE_ID || "2160";

  const [offers, recipeRes] = await Promise.all([
    fetchOffersFromWillys(store),
    db.from("recipes")
      .select("id, title, time, tags, protein, tested, ingredients")
      .eq("household_id", householdId),
  ]);

  // Bara erbjudanden vars canon familjen valt → besparingen räknas bara på urvalet.
  const selectedOffers = offers.filter((o) => canonSet.has(extractOfferCanon(o) || ""));

  const recipes = (recipeRes.data || []).map((r) => ({
    id: r.id,
    title: r.title,
    time: r.time,
    protein: r.protein,
    tags: r.tags || [],
    ingredients: r.ingredients || [],
  }));

  const suggestions = recipes
    .map((r) => ({ r, m: matchRecipe(r, selectedOffers) }))
    .filter((x) => x.m.totalSaving > 0)
    .map(({ r, m }) => ({
      recipeId: r.id,
      title: r.title,
      protein: r.protein,
      time: r.time || null,
      saving: Math.round(m.totalSaving),
      matches: bestMatchesByCanon(m.matches),
    }))
    .sort((a, b) => b.saving - a.saving)
    .slice(0, 30);

  return res.status(200).json({ suggestions });
});

// Metod-router: GET publikt, allt annat via den auth-wrappade
// POST-handlern (som även svarar på OPTIONS-preflight och 405).
export default function handler(req, res) {
  if (req.method === "GET") return offersHandler(req, res);
  return recipesHandler(req, res);
}
