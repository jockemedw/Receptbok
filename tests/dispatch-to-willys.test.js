// Regressiontester för Willys-dispatch-kedjan: sök, cart-klient, matcher, endpoint.
// Körs med `node tests/dispatch-to-willys.test.js` — inga externa deps.
// Hook: se .claude/settings.json — blockerar commit vid regression.

import { extractOfferCanon, rejectsMatch } from "../api/_shared/willys-matcher.js";
import { fetchOffersFromWillys } from "../api/willys-offers.js";
import { createSearchClient } from "../api/_shared/willys-search.js";
import { matchCanons } from "../api/_shared/dispatch-matcher.js";
import { createCartClient } from "../api/_shared/willys-cart-client.js";
import { runDispatch, resolveWillysSecrets } from "../api/dispatch-to-willys.js";

let passed = 0;
let failed = 0;
const failures = [];

function assertEq(actual, expected, desc) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    failures.push(`  ❌ ${desc}\n     förväntad: ${JSON.stringify(expected)}\n     faktisk:   ${JSON.stringify(actual)}`);
  }
}

function assertTrue(cond, desc) { assertEq(!!cond, true, desc); }
function assertFalse(cond, desc) { assertEq(!!cond, false, desc); }

// ─── Task 1: extractOfferCanon + rejectsMatch är exporterade ──────
assertEq(extractOfferCanon({ name: "Mellanmjölk 1,5%", brandLine: "" }), "mjölk", "extractOfferCanon mjölk");
assertEq(extractOfferCanon({ name: "Laxfilé", brandLine: "" }), "lax", "extractOfferCanon laxfilé");
assertTrue(rejectsMatch("grädde", { name: "Spraygrädde Vispgrädde 35%", brandLine: "" }), "rejectsMatch spraygrädde för grädde");
assertFalse(rejectsMatch("grädde", { name: "Matlagningsgrädde 15%", brandLine: "" }), "rejectsMatch tillåter matlagningsgrädde");

// ─── Task 2: fetchOffersFromWillys-export ─────────────────────────
assertEq(typeof fetchOffersFromWillys, "function", "fetchOffersFromWillys är en funktion");

// ─── Task 3: willys-search.js — findProductByCanon ────────────────

// Fake fetch som returnerar en canned JSON-response
function makeFakeFetch(responsesByUrl) {
  return async (url) => {
    const key = Object.keys(responsesByUrl).find(k => url.includes(k));
    if (!key) throw new Error(`fake-fetch saknar stub för ${url}`);
    const body = responsesByUrl[key];
    return {
      ok: true,
      status: 200,
      json: async () => body,
    };
  };
}

// A. Vanlig canon: första träffen är rätt → välj den
{
  const client = createSearchClient({
    fetchImpl: makeFakeFetch({
      "q=mj%C3%B6lk": {
        results: [
          { code: "101233933_ST", name: "Mellanmjölk 1,5%", productLine2: "Garant", online: true, outOfStock: false, priceValue: 16.7 },
        ],
      },
    }),
  });
  const hit = await client.findProductByCanon("mjölk");
  assertEq(hit?.code, "101233933_ST", "sök mjölk → Mellanmjölk code");
  assertEq(hit?.source, "search", "hit har source=search");
}

// B. Första träffen felmatchar (vitlök → "Lök Vit") → hoppar över, tar nästa
{
  const client = createSearchClient({
    fetchImpl: makeFakeFetch({
      "q=vitl%C3%B6ksklyftor": {
        results: [
          { code: "101331906_ST", name: "Lök Vit Stor Klass 1", productLine2: "", online: true, outOfStock: false, priceValue: 8.9 },
          { code: "101234567_ST", name: "Vitlök Klass 1", productLine2: "", online: true, outOfStock: false, priceValue: 12 },
        ],
      },
    }),
  });
  const hit = await client.findProductByCanon("vitlöksklyftor");
  assertEq(hit?.code, "101234567_ST", "vitlök: hoppar Lök Vit, tar Vitlök Klass 1");
}

// C. Alla träffar felmatchar → null
{
  const client = createSearchClient({
    fetchImpl: makeFakeFetch({
      "q=grytbit": {
        results: [
          { code: "x_ST", name: "Potatis Klass 1", productLine2: "", online: true, outOfStock: false, priceValue: 10 },
        ],
      },
    }),
  });
  const hit = await client.findProductByCanon("grytbit");
  assertEq(hit, null, "canon utan rimlig träff → null");
}

// D. outOfStock filtreras bort
{
  const client = createSearchClient({
    fetchImpl: makeFakeFetch({
      "q=sm%C3%B6r": {
        results: [
          { code: "a_ST", name: "Smör Normalsaltat", productLine2: "", online: true, outOfStock: true, priceValue: 60 },
          { code: "b_ST", name: "Smör Osaltat", productLine2: "", online: true, outOfStock: false, priceValue: 60 },
        ],
      },
    }),
  });
  const hit = await client.findProductByCanon("smör");
  assertEq(hit?.code, "b_ST", "outOfStock-produkt hoppas över");
}

// E. Spraygrädde filtreras via rejectsMatch
{
  const client = createSearchClient({
    fetchImpl: makeFakeFetch({
      "q=gr%C3%A4dde": {
        results: [
          { code: "spray_ST", name: "Spraygrädde Vispgrädde 35%", productLine2: "", online: true, outOfStock: false, priceValue: 45 },
          { code: "regular_ST", name: "Grädde 35%", productLine2: "ICA", online: true, outOfStock: false, priceValue: 35 },
        ],
      },
    }),
  });
  const hit = await client.findProductByCanon("grädde");
  assertEq(hit?.code, "regular_ST", "spraygrädde rejectsMatch → regular grädde väljs");
}

// ─── Task 4: dispatch-matcher — matchCanons ───────────────────────

// Fake searchClient
function fakeSearch(map) {
  return {
    findProductByCanon: async (canon) => map[canon] || null,
  };
}

// A. Rea-träff väljs före sökning
{
  const offers = [
    { code: "rea_mjölk_ST", name: "Mellanmjölk 1,5% Eko", brandLine: "", savingPerUnit: 3 },
  ];
  const search = fakeSearch({
    mjölk: { code: "search_mjölk_ST", name: "Mellanmjölk 1,5%", brandLine: "", source: "search" },
  });
  const result = await matchCanons(["mjölk"], offers, search);
  assertEq(result.matched.length, 1, "en match");
  assertEq(result.matched[0].code, "rea_mjölk_ST", "rea väljs före search");
  assertEq(result.matched[0].source, "rea", "source=rea");
}

// B. Ingen rea → sök-fallback
{
  const offers = [];
  const search = fakeSearch({
    mjölk: { code: "search_mjölk_ST", name: "Mellanmjölk 1,5%", brandLine: "", source: "search" },
  });
  const result = await matchCanons(["mjölk"], offers, search);
  assertEq(result.matched.length, 1, "sök-fallback matchar");
  assertEq(result.matched[0].code, "search_mjölk_ST", "sök-code väljs");
  assertEq(result.matched[0].source, "search", "source=search");
}

// C. Varken rea eller sök → unmatched
{
  const offers = [];
  const search = fakeSearch({});
  const result = await matchCanons(["obskyrbär"], offers, search);
  assertEq(result.matched.length, 0, "ingen match");
  assertEq(result.unmatched.length, 1, "en unmatched");
  assertEq(result.unmatched[0], "obskyrbär", "obskyrbär är unmatched");
}

// D. Dedupe av canon-listan
{
  const offers = [
    { code: "rea_mjölk_ST", name: "Mjölk 1,5%", brandLine: "", savingPerUnit: 3 },
  ];
  const search = fakeSearch({});
  const result = await matchCanons(["mjölk", "mjölk", "mjölk"], offers, search);
  assertEq(result.matched.length, 1, "dubbletter reduceras till 1 match");
}

// E. rejectsMatch-filter i rea-steget
{
  const offers = [
    { code: "spray_ST", name: "Spraygrädde Vispgrädde 35%", brandLine: "", savingPerUnit: 5 },
    { code: "visp_matl_ST", name: "Vispgrädde Matlagning 35%", brandLine: "", savingPerUnit: 2 },
  ];
  const search = fakeSearch({});
  const result = await matchCanons(["grädde"], offers, search);
  assertEq(result.matched.length, 1, "en match efter rejectsMatch");
  assertEq(result.matched[0].code, "visp_matl_ST", "spray rejects, vispgrädde matlagning väljs");
}

// ─── Task 5: willys-cart-client ───────────────────────────────────

// Fake fetch som spelar in requests och returnerar canned responses
function makeRecordingFetch(responses) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || "GET", headers: opts.headers || {}, body: opts.body });
    const key = `${opts.method || "GET"} ${url.includes("addProducts") ? "addProducts" : "cart"}`;
    const spec = responses[key] || { ok: false, status: 500, body: {} };
    return {
      ok: spec.ok,
      status: spec.status,
      json: async () => spec.body,
      text: async () => JSON.stringify(spec.body),
    };
  };
  fn.calls = calls;
  return fn;
}

// A. Preflight OK
{
  const fetchImpl = makeRecordingFetch({
    "GET cart": { ok: true, status: 200, body: { entries: [] } },
  });
  const client = createCartClient({ fetchImpl, cookies: "x=1", csrf: "tok" });
  const pf = await client.preflight();
  assertEq(pf.ok, true, "preflight OK");
  assertEq(pf.status, 200, "preflight status 200");
}

// B. Preflight 401
{
  const fetchImpl = makeRecordingFetch({
    "GET cart": { ok: false, status: 401, body: {} },
  });
  const client = createCartClient({ fetchImpl, cookies: "x=1", csrf: "tok" });
  const pf = await client.preflight();
  assertEq(pf.ok, false, "preflight fail 401");
  assertEq(pf.status, 401, "preflight status 401");
}

// C. addProducts skickar rätt body-shape
{
  const fetchImpl = makeRecordingFetch({
    "POST addProducts": { ok: true, status: 200, body: { cartModifications: [] } },
  });
  const client = createCartClient({ fetchImpl, cookies: "x=1", csrf: "tok" });
  const result = await client.addProducts(["a_ST", "b_ST"]);
  assertEq(result.ok, true, "addProducts returnerar ok");
  const call = fetchImpl.calls.find(c => c.url.includes("addProducts"));
  assertTrue(call, "POST-anrop registrerat");
  assertEq(call.method, "POST", "metod är POST");
  assertEq(call.headers["x-csrf-token"], "tok", "x-csrf-token-header satt");
  assertEq(call.headers.cookie, "x=1", "cookie-header satt");
  const body = JSON.parse(call.body);
  assertEq(body.products.length, 2, "body har 2 produkter");
  assertEq(body.products[0].productCodePost, "a_ST", "första productCodePost");
  assertEq(body.products[0].qty, 1, "qty=1 (spec)");
  assertEq(body.products[0].pickUnit, "pieces", "pickUnit=pieces (spec)");
}

// D. verifyCart returnerar entries
{
  const fetchImpl = makeRecordingFetch({
    "GET cart": { ok: true, status: 200, body: { entries: [{ product: { code: "a_ST" }, quantity: 1 }] } },
  });
  const client = createCartClient({ fetchImpl, cookies: "x=1", csrf: "tok" });
  const verified = await client.verifyCart();
  assertEq(verified.ok, true, "verifyCart ok");
  assertEq(verified.entries.length, 1, "verifyCart returnerar 1 entry");
}

// ─── Task 6: endpoint integration (ren logikfunktion) ─────────────
// Endpoint-handlern testas inte direkt (kräver Vercel-miljö) — istället
// testar vi den rena dispatch-funktionen som den delegerar till.

// A. Happy path med blandning av rea + search
// OBS: "Vispgrädde Matlagning 35%" ger canon "grädde" via NORMALIZATION_TABLE["vispgrädde"]="grädde".
// rejectsMatch("grädde", {name:"Vispgrädde Matlagning 35%"}) = false (matlagning-undantaget i regex).
{
  const shoppingList = {
    generated: "2026-04-21",
    recipeItems: {
      Mejeri: ["mjölk (1 l)", "grädde (2 dl)"],
      Grönsaker: ["purjolök (1)"],
    },
    categories: null,
  };
  const offers = [
    { code: "rea_gradde_ST", name: "Vispgrädde Matlagning 35%", brandLine: "Arla", savingPerUnit: 5 },
  ];
  const searchClient = {
    findProductByCanon: async (canon) => {
      if (canon === "mjölk") return { code: "s_mjolk_ST", name: "Mellanmjölk 1,5%", brandLine: "Garant" };
      if (canon === "purjolök") return { code: "s_purjo_ST", name: "Purjolök Klass 1", brandLine: "" };
      return null;
    },
  };
  let captured = null;
  const cartClient = {
    preflight: async () => ({ ok: true, status: 200 }),
    addProducts: async (codes) => {
      captured = codes;
      return { ok: true, status: 200, response: {} };
    },
    verifyCart: async () => ({ ok: true, status: 200, entries: [] }),
  };

  const result = await runDispatch({ shoppingList, offers, searchClient, cartClient });
  assertEq(result.ok, true, "dispatch ok");
  assertTrue(captured, "addProducts anropades");
  assertTrue(captured.includes("rea_gradde_ST"), "rea-grädde med");
  assertTrue(captured.includes("s_mjolk_ST"), "search-mjölk med");
  assertTrue(captured.includes("s_purjo_ST"), "search-purjolök med");
  assertEq(result.missing.length, 0, "inga unmatched");
}

// B. Preflight 401 → avbryter utan POST
{
  const shoppingList = { recipeItems: { Mejeri: ["mjölk (1 l)"] } };
  const offers = [];
  const searchClient = { findProductByCanon: async () => null };
  let posted = false;
  const cartClient = {
    preflight: async () => ({ ok: false, status: 401 }),
    addProducts: async () => { posted = true; return { ok: true, status: 200 }; },
    verifyCart: async () => ({ ok: true, entries: [] }),
  };
  const result = await runDispatch({ shoppingList, offers, searchClient, cartClient });
  assertEq(result.ok, false, "dispatch fail vid 401");
  assertEq(result.error, "auth_expired", "felkod auth_expired");
  assertFalse(posted, "POST avbröts innan det skickades");
}

// C. Tom shopping-list → ingen POST, tydligt fel
{
  const shoppingList = { recipeItems: {} };
  const offers = [];
  const searchClient = { findProductByCanon: async () => null };
  let posted = false;
  const cartClient = {
    preflight: async () => ({ ok: true, status: 200 }),
    addProducts: async () => { posted = true; return { ok: true }; },
    verifyCart: async () => ({ ok: true, entries: [] }),
  };
  const result = await runDispatch({ shoppingList, offers, searchClient, cartClient });
  assertEq(result.ok, false, "tom lista → fail");
  assertEq(result.error, "no_matches", "felkod no_matches");
  assertFalse(posted, "inget POST vid tom lista");
}

// C2. Manuella varor matchas och skickas (ingen recipeItems)
{
  const shoppingList = { recipeItems: {}, manualItems: ["Kefir", "mjölk (1 l)"] };
  const offers = [];
  const searchClient = {
    findProductByCanon: async (canon) => {
      if (canon === "kefir") return { code: "s_kefir_ST", name: "Kefir Naturell", brandLine: "Skånemejerier" };
      if (canon === "mjölk") return { code: "s_mjolk_ST", name: "Mellanmjölk 1,5%", brandLine: "Garant" };
      return null;
    },
  };
  let captured = null;
  const cartClient = {
    preflight: async () => ({ ok: true, status: 200 }),
    addProducts: async (codes) => { captured = codes; return { ok: true, status: 200, response: {} }; },
    verifyCart: async () => ({ ok: true, entries: [] }),
  };
  const result = await runDispatch({ shoppingList, offers, searchClient, cartClient });
  assertEq(result.ok, true, "manualItems → dispatch ok");
  assertTrue(captured && captured.includes("s_kefir_ST"), "kefir från manualItems med");
  assertTrue(captured && captured.includes("s_mjolk_ST"), "mjölk från manualItems med");
}

// D. addProducts fail (post_failed-path — code-reviewer request)
{
  const shoppingList = { recipeItems: { Mejeri: ["mjölk (1 l)"] } };
  const offers = [];
  const searchClient = {
    findProductByCanon: async (canon) =>
      canon === "mjölk" ? { code: "s_mjolk_ST", name: "Mellanmjölk", brandLine: "" } : null,
  };
  const cartClient = {
    preflight: async () => ({ ok: true, status: 200 }),
    addProducts: async () => ({ ok: false, status: 500, response: {} }),
    verifyCart: async () => ({ ok: true, entries: [] }),
  };
  const result = await runDispatch({ shoppingList, offers, searchClient, cartClient });
  assertEq(result.ok, false, "post_failed: ok=false");
  assertEq(result.error, "post_failed", "post_failed: felkod");
}

// E. addProducts 401 (auth_expired även vid POST-stadiet)
{
  const shoppingList = { recipeItems: { Mejeri: ["mjölk (1 l)"] } };
  const offers = [];
  const searchClient = {
    findProductByCanon: async (canon) =>
      canon === "mjölk" ? { code: "s_mjolk_ST", name: "Mellanmjölk", brandLine: "" } : null,
  };
  const cartClient = {
    preflight: async () => ({ ok: true, status: 200 }),
    addProducts: async () => ({ ok: false, status: 401, response: {} }),
    verifyCart: async () => ({ ok: true, entries: [] }),
  };
  const result = await runDispatch({ shoppingList, offers, searchClient, cartClient });
  assertEq(result.error, "auth_expired", "POST 401 → auth_expired");
}

// ─── Task R: resolveWillysSecrets — gist + env-var fallback ───────

// R1. Gist har user → använder gist-värden
{
  const store = {
    readUser: async (id) => id === "joakim"
      ? { cookie: "g_cookie", csrf: "g_csrf", storeId: "g_store" }
      : null,
  };
  const env = { WILLYS_COOKIE: "e_cookie", WILLYS_CSRF: "e_csrf", WILLYS_STORE_ID: "e_store" };
  const out = await resolveWillysSecrets({ store, env, userId: "joakim" });
  assertEq(out?.cookies, "g_cookie", "gist-cookie föredras");
  assertEq(out?.csrf, "g_csrf", "gist-csrf föredras");
  assertEq(out?.storeId, "g_store", "gist-storeId föredras");
  assertEq(out?.source, "gist", "source=gist");
}

// R2. Gist tom + env vars satta → faller tillbaka till env
{
  const store = { readUser: async () => null };
  const env = { WILLYS_COOKIE: "e_cookie", WILLYS_CSRF: "e_csrf", WILLYS_STORE_ID: "e_store" };
  const out = await resolveWillysSecrets({ store, env, userId: "joakim" });
  assertEq(out?.cookies, "e_cookie", "fallback till env-cookie");
  assertEq(out?.csrf, "e_csrf", "fallback till env-csrf");
  assertEq(out?.storeId, "e_store", "fallback till env-storeId");
  assertEq(out?.source, "env", "source=env");
}

// R3. Gist kastar → fallback till env (loggar internt)
{
  const store = { readUser: async () => { throw new Error("gist 502"); } };
  const env = { WILLYS_COOKIE: "e_cookie", WILLYS_CSRF: "e_csrf", WILLYS_STORE_ID: "e_store" };
  const out = await resolveWillysSecrets({ store, env, userId: "joakim" });
  assertEq(out?.source, "env", "gist-fel → env-fallback");
}

// R4. Gist tom + env vars saknas → null (featureAvailable=false)
{
  const store = { readUser: async () => null };
  const env = {};
  const out = await resolveWillysSecrets({ store, env, userId: "joakim" });
  assertEq(out, null, "ingen källa → null");
}

// R5. store=null → använder bara env
{
  const env = { WILLYS_COOKIE: "e", WILLYS_CSRF: "t", WILLYS_STORE_ID: "2160" };
  const out = await resolveWillysSecrets({ store: null, env, userId: "joakim" });
  assertEq(out?.source, "env", "store=null → env-källa");
}

// R6. Gist har bara cookie utan csrf → räknas som tom, fallback till env
{
  const store = { readUser: async () => ({ cookie: "g", csrf: "", storeId: "2160" }) };
  const env = { WILLYS_COOKIE: "e", WILLYS_CSRF: "t", WILLYS_STORE_ID: "2160" };
  const out = await resolveWillysSecrets({ store, env, userId: "joakim" });
  assertEq(out?.source, "env", "gist utan csrf → env-fallback");
}

// R7. Gist har user men saknar storeId → fallback till env eller default 2160
{
  const store = { readUser: async () => ({ cookie: "g", csrf: "t", storeId: "" }) };
  const env = { WILLYS_STORE_ID: "9999" };
  const out = await resolveWillysSecrets({ store, env, userId: "joakim" });
  // Cookie+CSRF räcker för att klassas som gist-källa, storeId fyller från env
  assertEq(out?.source, "gist", "gist-källa OK när cookie+csrf finns");
  assertEq(out?.storeId, "9999", "storeId från env när gist saknar");
}

console.log(`\n${passed} passerade, ${failed} failade`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(f));
  process.exit(1);
}
