// Regressiontester för Willys-dispatch-kedjan: sök, cart-klient, matcher, endpoint.
// Körs med `node tests/dispatch-to-willys.test.js` — inga externa deps.
// Hook: se .claude/settings.json — blockerar commit vid regression.

import { extractOfferCanon, rejectsMatch } from "../api/_shared/willys-matcher.js";
import { fetchOffersFromWillys } from "../api/willys-offers.js";
import { createSearchClient } from "../api/_shared/willys-search.js";
import { matchCanons } from "../api/_shared/dispatch-matcher.js";
import { createCartClient } from "../api/_shared/willys-cart-client.js";

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

console.log(`\n${passed} passerade, ${failed} failade`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(f));
  process.exit(1);
}
