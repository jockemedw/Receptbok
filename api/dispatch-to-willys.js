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
import { readFileRaw } from "./_shared/github.js";
import { db } from "./_shared/supabase.js";
import { timingSafeEqual } from "node:crypto";

const CART_URL = "https://www.willys.se/";

// Konstant-tids-jämförelse av delade hemligheter (X-Refresh-Secret) — undviker
// att svarstiden läcker hur många tecken som stämmer. Olika längd → false direkt
// (timingSafeEqual kräver lika buffertlängd); det är en acceptabel läcka.
export function secretsMatch(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length === 0 || b.length === 0) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

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
    const shoppingList = await fetchShoppingListFromSupabase();
    const blockedBrands = await fetchBlockedBrands();
    const offers = await fetchOffersFromWillys(secrets.storeId);
    const searchClient = createSearchClient({ blockedBrands });
    const cartClient = createCartClient({ cookies: secrets.cookies, csrf: secrets.csrf });
    const result = await runDispatch({ shoppingList, offers, searchClient, cartClient, blockedBrands });

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
  if (!secretsMatch(secretHeader, expectedSecret)) {
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
export async function runDispatch({ shoppingList, offers, searchClient, cartClient, blockedBrands = [] }) {
  const canons = extractCanonsFromShoppingList(shoppingList);
  if (canons.length === 0) {
    return { ok: false, error: "no_matches" };
  }

  const preflight = await cartClient.preflight();
  if (!preflight.ok) {
    return { ok: false, error: preflight.status === 401 ? "auth_expired" : "preflight_failed" };
  }

  // Sök-anropen är publika läsningar → tål högre parallellism. Håller dispatchen
  // under Vercels 60s-tak även när många varor matchas via sök.
  const { matched, unmatched } = await matchCanons(canons, offers, searchClient, { blockedBrands, concurrency: 10 });
  if (matched.length === 0) {
    return { ok: false, error: "no_matches" };
  }

  const codes = matched.map(m => m.code).filter(Boolean);

  // Diagnostik (canon-namn + kod-suffix, inga hemligheter): gör en skarp körning
  // verifierbar från loggarna. Avslöjar bl.a. om lösvikts-fixen (PR #65) träffar
  // en `_KG`-vara som potatis. Kan trimmas bort när potatis bekräftats landa.
  const kgMatched = matched.filter(m => /_kg$/i.test(m.code || ""));
  console.log(`dispatch kgMatched=${kgMatched.length} [${kgMatched.map(m => `${m.canon}:${m.code}`).join(", ")}]`);

  // Lägg till i batchar (snabbt) och faller bara tillbaka till en-i-taget för en
  // batch som nekas. Willys addProducts är allt-eller-inget: en ogiltig kod
  // sänker hela batchen med 400 (error.illegal.argument). Att skicka ~40 varor
  // en-i-taget blev för långsamt (timeout); batchning skär ner antalet anrop
  // drastiskt medan en-i-taget-fallbacken fortfarande isolerar ogiltiga koder.
  const add = await addProductsInBatches(cartClient, codes);
  if (add.authExpired) {
    return { ok: false, error: "auth_expired" };
  }
  console.log(`dispatch added=${add.added.length}/${codes.length} matched=${matched.length}/${canons.length}`);
  if (add.added.length === 0) {
    return { ok: false, error: "post_failed" };
  }

  const failedSet = new Set(add.failed);
  const addedMatched = matched.filter(m => !failedSet.has(m.code));
  const failedCanons = matched.filter(m => failedSet.has(m.code)).map(m => m.canon);
  const missing = unmatched.concat(failedCanons);
  console.log(`dispatch missing=${missing.length} [${missing.join(", ")}]`);
  const sources = {
    rea: addedMatched.filter(m => m.source === "rea").length,
    search: addedMatched.filter(m => m.source === "search").length,
  };
  return { ok: true, addedCount: add.added.length, missing, sources, failedCount: add.failed.length };
}

// Lägger produkter i batchar (bounded concurrency) och faller tillbaka till
// en-i-taget för en nekad batch. Willys addProducts är allt-eller-inget — en
// ogiltig kod sänker hela batchen — så en nekad batch splittas för att isolera
// de varor som faktiskt nekas (även 401: en enstaka vara som Willys nekar ska
// INTE felaktigt rapporteras som "cookie utgången"). Returnerar lyckade/
// misslyckade koder + authExpired (sann bara om INGEN vara gick in och minst en
// nekades med 401 — då är det sessionen, inte en enskild vara).
async function addProductsInBatches(cartClient, codes, { batchSize = 8, concurrency = 4 } = {}) {
  const added = [];
  const failed = [];
  let auth401 = 0;     // antal enskilda varor som nekats med 401
  let diagLogged = 0;  // begränsa diagnostik-loggning (inga hemligheter, bara kod + Willys-felkod)

  function logFailure(scope, batch, res) {
    if (diagLogged >= 5) return;
    diagLogged++;
    let body = "";
    try { body = JSON.stringify(res.response).slice(0, 200); } catch { /* ej JSON */ }
    console.log(`addProducts ${scope} status=${res.status} codes=[${batch.join(",")}] body=${body}`);
  }

  const batches = [];
  for (let i = 0; i < codes.length; i += batchSize) batches.push(codes.slice(i, i + batchSize));

  let cursor = 0;
  async function worker() {
    while (cursor < batches.length) {
      const batch = batches[cursor++];
      const res = await cartClient.addProducts(batch);
      if (res.ok) { added.push(...batch); continue; }
      logFailure("batch", batch, res);
      // Nekad batch → lägg om en-i-taget för att isolera den/de varor som nekas.
      for (const code of batch) {
        const single = await cartClient.addProducts([code]);
        if (single.ok) { added.push(code); continue; }
        logFailure("single", [code], single);
        if (single.status === 401) auth401++;
        failed.push(code);
      }
    }
  }
  const n = Math.min(concurrency, batches.length);
  await Promise.all(Array.from({ length: n }, () => worker()));

  // Äkta auth-utgång: ingen vara landade OCH minst en nekades med 401. Om något
  // landade var 401:orna varuspecifika (enhet/kod), inte sessionen.
  const authExpired = added.length === 0 && auth401 > 0;
  return { added, failed, authExpired };
}

// Läser aktiv inköpslista från Supabase och returnerar { recipeItems, manualItems }
// i samma format som shopping-list-endpointen brukade returnera.
async function fetchShoppingListFromSupabase() {
  const { data: lists } = await db
    .from("shopping_lists")
    .select("id")
    .eq("is_active", true)
    .limit(1);
  if (!lists?.length) return { recipeItems: {}, manualItems: [] };

  const { data: items } = await db
    .from("shopping_items")
    .select("category, name, source, position")
    .eq("list_id", lists[0].id)
    .order("position");

  const recipeItems = {};
  const manualItems = [];
  for (const item of (items || [])) {
    if (item.source === "recipe") {
      if (!recipeItems[item.category]) recipeItems[item.category] = [];
      recipeItems[item.category].push(item.name);
    } else {
      manualItems.push(item.name);
    }
  }
  return { recipeItems, manualItems };
}

// Läser användarens inköpspreferenser (samma fil som AI-prompten + UI:t använder)
// och returnerar listan blockerade varumärken. Saknad fil / fel → tom lista
// (ingen filtrering), så dispatchen aldrig faller på en preferens-läsning.
async function fetchBlockedBrands() {
  try {
    const prefs = await readFileRaw("dispatch-preferences.json");
    const brands = Array.isArray(prefs?.blockedBrands) ? prefs.blockedBrands : [];
    return brands.map((b) => String(b).toLowerCase().trim()).filter(Boolean);
  } catch {
    return [];
  }
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
