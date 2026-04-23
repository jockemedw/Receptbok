// Regressiontester för Willys-dispatch-kedjan: sök, cart-klient, matcher, endpoint.
// Körs med `node tests/dispatch-to-willys.test.js` — inga externa deps.
// Hook: se .claude/settings.json — blockerar commit vid regression.

import { extractOfferCanon, rejectsMatch } from "../api/_shared/willys-matcher.js";
import { fetchOffersFromWillys } from "../api/willys-offers.js";
import { createSearchClient } from "../api/_shared/willys-search.js";

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

console.log(`\n${passed} passerade, ${failed} failade`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(f));
  process.exit(1);
}
