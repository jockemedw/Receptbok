// Dispatch-endpoint: fyller användarens Willys-korg med veckans inköpslista.
// Plus sub-route för cookie-refresh från Chrome-extensionen (kombinerat för att
// hålla oss under Vercel Hobby-planens 12-funktioner-tak).
//
// GET  /api/dispatch-to-willys                                → { featureAvailable: bool }
// POST /api/dispatch-to-willys { date? }                      → { ok, addedCount, missing, cartUrl } | { ok:false, error, message }
// POST /api/dispatch-to-willys?op=refresh-cookies + body      → { ok, updatedAt } | { error }
//   Header: X-Refresh-Secret krävs på refresh-cookies-vägen
//
// Cred-källor (minst en krävs för featureAvailable=true):
//   1. Secret gist (föredragen) — kräver GITHUB_GIST_PAT + WILLYS_SECRETS_GIST_ID,
//      populeras av Chrome-extension via POST ?op=refresh-cookies
//   2. Env-fallback (legacy) — WILLYS_COOKIE + WILLYS_CSRF (manuell rotation)
//   WILLYS_STORE_ID — default 2160 (Ekholmen), används av båda källorna
//
// Säkerhet: returnerar aldrig cookies eller CSRF-token i loggning eller response.

import { fetchOffersFromWillys } from "./willys-offers.js";
import { createSearchClient } from "./_shared/willys-search.js";
import { createCartClient } from "./_shared/willys-cart-client.js";
import { matchCanons } from "./_shared/dispatch-matcher.js";
import { parseIngredient, normalizeName } from "./_shared/shopping-builder.js";
import { createSecretsStore } from "./_shared/secrets-store.js";

const CART_URL = "https://www.willys.se/";
const SHOPPING_LIST_URL = "https://raw.githubusercontent.com/jockemedw/Receptbok/main/shopping-list.json";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Refresh-Secret");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Sub-route: cookie-refresh från Chrome-extensionen
  if (req.query?.op === "refresh-cookies") {
    return handleRefreshCookies(req, res);
  }

  // GITHUB_GIST_PAT = classic token med gist-scope (krävs för gist-läsning;
  // fine-grained tokens stödjer inte gists). Fallback till GITHUB_PAT för bakåtkomp.
  const pat = process.env.GITHUB_GIST_PAT || process.env.GITHUB_PAT;
  const gistId = process.env.WILLYS_SECRETS_GIST_ID;
  const store = (pat && gistId) ? createSecretsStore({ pat, gistId }) : null;
  const secrets = await resolveWillysSecrets({ store, env: process.env, userId: "joakim" });
  const featureAvailable = !!secrets;

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
    console.log(`dispatch source=${secrets.source}`);
    const shoppingList = await (await fetch(SHOPPING_LIST_URL + "?t=" + Date.now())).json();
    const offers = await fetchOffersFromWillys(secrets.storeId);
    const searchClient = createSearchClient({});
    const cartClient = createCartClient({ cookies: secrets.cookies, csrf: secrets.csrf });
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

// Sub-route ?op=refresh-cookies: tar emot cookie+CSRF från Chrome-extensionen
// och skriver till secret gist via secrets-store.
//
// Säkerhet: shared secret-header krävs. Cookies returneras aldrig i response/loggning.
async function handleRefreshCookies(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metod ej tillåten" });
  }

  const expectedSecret = process.env.WILLYS_REFRESH_SECRET;
  const pat = process.env.GITHUB_GIST_PAT || process.env.GITHUB_PAT;
  const gistId = process.env.WILLYS_SECRETS_GIST_ID;
  if (!expectedSecret || !pat || !gistId) {
    return res.status(500).json({ error: "Server saknar konfiguration (env vars)." });
  }

  const store = createSecretsStore({ pat, gistId });
  const result = await runRefresh({
    secretHeader: req.headers["x-refresh-secret"],
    expectedSecret,
    payload: req.body || {},
    store,
  });
  return res.status(result.status).json(result.body);
}

// Ren funktion — exporterad för test. Sidoeffekter sker bara via store.writeUser.
export async function runRefresh({ secretHeader, expectedSecret, payload, store }) {
  if (!secretHeader || secretHeader !== expectedSecret) {
    return { status: 401, body: { error: "unauthorized" } };
  }
  const { userId, cookie, csrf, storeId } = payload;
  if (!userId || typeof userId !== "string") {
    return { status: 400, body: { error: "bad_request", field: "userId" } };
  }
  if (!cookie || typeof cookie !== "string") {
    return { status: 400, body: { error: "bad_request", field: "cookie" } };
  }
  if (!csrf || typeof csrf !== "string") {
    return { status: 400, body: { error: "bad_request", field: "csrf" } };
  }
  if (!storeId || typeof storeId !== "string") {
    return { status: 400, body: { error: "bad_request", field: "storeId" } };
  }
  try {
    const written = await store.writeUser(userId, { cookie, csrf, storeId });
    return { status: 200, body: { ok: true, updatedAt: written.updatedAt } };
  } catch (err) {
    console.error("refresh-cookies store error:", err?.message || err);
    return { status: 502, body: { error: "store_write_failed" } };
  }
}

// Avgör vilken cookie/csrf-källa som ska användas för dispatch.
// Föredrar gist (Chrome-extensionen håller den fräsch); faller tillbaka till
// env vars (manuell rotation, samma värden som körde live före Fas 4F).
//
// Returnerar { cookies, csrf, storeId, source } eller null om ingen källa har
// både cookie och csrf.
export async function resolveWillysSecrets({ store, env, userId = "joakim" }) {
  if (store) {
    try {
      const user = await store.readUser(userId);
      if (user?.cookie && user?.csrf) {
        return {
          cookies: user.cookie,
          csrf: user.csrf,
          storeId: user.storeId || env.WILLYS_STORE_ID || "2160",
          source: "gist",
        };
      }
    } catch (err) {
      console.error("resolveWillysSecrets gist-läsning failade:", err?.message || err);
    }
  }
  if (env.WILLYS_COOKIE && env.WILLYS_CSRF) {
    return {
      cookies: env.WILLYS_COOKIE,
      csrf: env.WILLYS_CSRF,
      storeId: env.WILLYS_STORE_ID || "2160",
      source: "env",
    };
  }
  return null;
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
  for (const raw of shoppingList.manualItems || []) {
    const { name } = parseIngredient(raw);
    const canon = normalizeName(name);
    if (canon) seen.add(canon);
  }
  return [...seen];
}
