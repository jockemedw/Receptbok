// Prisoptimera, steg 2 — receptförslag från familjens VALDA rea-ingredienser.
//
// POST /api/deals-recipes   body: { canons: ["kyckling", "lax", ...] }
//   → { suggestions: [{ recipeId, title, protein, time, saving, matches:[...] }] }
//
// Bara erbjudanden vars canon finns i användarens val räknas — så besparingen
// speglar exakt det familjen kryssade i (steg 1). Recept rankas på störst
// besparing först (samma som mockupen som godkändes). Återanvänder matchRecipe
// (samma canon-lexikon som inköpslistan) så matchningen är konsekvent.

import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";
import { fetchOffersFromWillys } from "./willys-offers.js";
import { matchRecipe, extractOfferCanon } from "./_shared/willys-matcher.js";

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

export default createSupabaseHandler(async (req, res) => {
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
