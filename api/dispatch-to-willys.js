// Dispatch-endpoint: fyller användarens Willys-korg med veckans inköpslista.
//
// GET  /api/dispatch-to-willys                → { featureAvailable: bool }
// POST /api/dispatch-to-willys { date? }      → { ok, addedCount, missing, cartUrl } | { ok:false, error, message }
//
// Env vars (alla krävs för featureAvailable=true):
//   WILLYS_COOKIE    — raw cookie-sträng från inloggad browser-session
//   WILLYS_CSRF      — x-csrf-token från samma session
//   WILLYS_STORE_ID  — default 2160 (Ekholmen)
//
// Säkerhet: returnerar aldrig cookies eller CSRF-token i loggning eller response.

import { fetchOffersFromWillys } from "./willys-offers.js";
import { createSearchClient } from "./_shared/willys-search.js";
import { createCartClient } from "./_shared/willys-cart-client.js";
import { matchCanons } from "./_shared/dispatch-matcher.js";
import { parseIngredient, normalizeName } from "./_shared/shopping-builder.js";

const CART_URL = "https://www.willys.se/cart";
const SHOPPING_LIST_URL = "https://raw.githubusercontent.com/jockemedw/Receptbok/main/shopping-list.json";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const cookies = process.env.WILLYS_COOKIE;
  const csrf = process.env.WILLYS_CSRF;
  const storeId = process.env.WILLYS_STORE_ID || "2160";
  const featureAvailable = !!(cookies && csrf);

  if (req.method === "GET") {
    return res.status(200).json({ featureAvailable });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metod ej tillåten" });
  }
  if (!featureAvailable) {
    return res.status(200).json({ featureAvailable: false });
  }

  try {
    const shoppingList = await (await fetch(SHOPPING_LIST_URL + "?t=" + Date.now())).json();
    const offers = await fetchOffersFromWillys(storeId);
    const searchClient = createSearchClient({});
    const cartClient = createCartClient({ cookies, csrf });
    const result = await runDispatch({ shoppingList, offers, searchClient, cartClient });

    if (!result.ok && result.error === "auth_expired") {
      return res.status(200).json({
        ok: false,
        error: "auth_expired",
        message: "Dina Willys-cookies har gått ut. Be Joakim uppdatera dem i Vercel.",
      });
    }
    if (!result.ok && result.error === "no_matches") {
      return res.status(200).json({
        ok: false,
        error: "no_matches",
        message: "Hittade ingen matchning för veckans inköpslista. Prova en annan vecka eller lägg till manuellt.",
      });
    }
    if (!result.ok) {
      return res.status(200).json({
        ok: false,
        error: result.error || "unknown",
        message: "Kunde inte skicka till Willys — prova igen om en stund.",
      });
    }
    return res.status(200).json({
      ok: true,
      addedCount: result.addedCount,
      missing: result.missing,
      cartUrl: CART_URL,
      sources: result.sources,
    });
  } catch (err) {
    console.error("dispatch-to-willys error:", err?.message || err);
    return res.status(500).json({
      ok: false,
      error: "internal",
      message: "Något gick fel vid dispatch — prova igen om en stund.",
    });
  }
}

// Exporterad för testbarhet. Ren funktion — inga globala sidoeffekter.
export async function runDispatch({ shoppingList, offers, searchClient, cartClient }) {
  const canons = extractCanonsFromShoppingList(shoppingList);
  if (canons.length === 0) {
    return { ok: false, error: "no_matches" };
  }

  const preflight = await cartClient.preflight();
  if (!preflight.ok) {
    return { ok: false, error: preflight.status === 401 ? "auth_expired" : "preflight_failed" };
  }

  const { matched, unmatched } = await matchCanons(canons, offers, searchClient);
  if (matched.length === 0) {
    return { ok: false, error: "no_matches" };
  }

  const codes = matched.map(m => m.code);
  const post = await cartClient.addProducts(codes);
  if (!post.ok) {
    return { ok: false, error: post.status === 401 ? "auth_expired" : "post_failed" };
  }

  const missing = unmatched.slice();
  const sources = {
    rea: matched.filter(m => m.source === "rea").length,
    search: matched.filter(m => m.source === "search").length,
  };
  return { ok: true, addedCount: matched.length, missing, sources };
}

function extractCanonsFromShoppingList(shoppingList) {
  const cats = shoppingList.recipeItems || shoppingList.categories || {};
  const seen = new Set();
  for (const items of Object.values(cats)) {
    if (!Array.isArray(items)) continue;
    for (const raw of items) {
      const { name } = parseIngredient(raw);
      const canon = normalizeName(name);
      if (canon) seen.add(canon);
    }
  }
  return [...seen];
}
