# Willys-dispatch Implementation Plan (Fas 4D + 4E kombinerat)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg en ny Vercel-endpoint `/api/dispatch-to-willys` + UI-knapp i inköpslistan som fyller familjens Willys-korg online med veckans inköpslista, där varje ingrediens får en produktkod via tvåstegsmatchning (rea först, därefter sökning som fallback).

**Architecture:** Endpointen läser `shopping-list.json`, extraherar unika canon-termer, kör per-canon-matchning (rea från befintlig `willys-offers`-cache → söknings-API som fallback), postar alla produktkoder i ett bulk-anrop till `POST willys.se/axfood/rest/cart/addProducts` med cookies+CSRF från env vars, och verifierar via `GET /axfood/rest/cart`. Tre nya shared-moduler (`willys-search.js`, `willys-cart-client.js`, `dispatch-matcher.js`) byggs med dependency-injected `fetch` för testbarhet. UI:t är en knapp + confirm-dialog + resultat-modal, feature-toggled på backend via `featureAvailable`-flagga.

**Tech Stack:** Vanilla ES modules, Node-only regressiontester (inga externa deps, samma mönster som Session 35–36), Vercel serverless handler-pattern, fetch API, `window.*`-cross-modul-anrop frontend.

**Scope-notering:** Denna plan utökar design-specen `docs/superpowers/specs/2026-04-20-willys-dispatch-design.md` med Fas 4E (söknings-fallback). 4E-rekognosceringen (2026-04-23) bekräftade att `GET https://www.willys.se/search?q=<canon>&size=<n>` är publikt, kräver ingen auth, och returnerar 18/20 rimliga första-träffar som kan ytterligare filtreras genom befintliga `extractOfferCanon` + `CANON_REJECT_PATTERNS`. Täckning förväntas gå från ~25% (rea-only) till ~75%+.

**Känd risk (dokumenteras, åtgärdas ej i MVP):** Produkter med `_KG`-suffix (t.ex. `100269139_KG` för lök) accepterar troligen inte `pickUnit: 'pieces'` i `addProducts`. MVP skickar `pickUnit: 'pieces', qty: 1` för alla produkter (matchar verifierat PoC-beteende för `_ST`). Eventuellt rejects flaggas i `unmatched`-listan via verifieringen. Fix i framtida iteration (Task 12 är en uppföljning).

## Filstruktur

**Nya filer:**
- `api/dispatch-to-willys.js` — Vercel-endpoint (GET=feature-check, POST=dispatch)
- `api/_shared/willys-search.js` — sökklient: `findProductByCanon(canon)` via `/search?q=<canon>`
- `api/_shared/willys-cart-client.js` — cart-operationer: `preflight()`, `addProducts(codes)`, `verifyCart()`
- `api/_shared/dispatch-matcher.js` — per-canon-matchning: rea först, sök som fallback
- `tests/dispatch-to-willys.test.js` — node-only regressiontester
- `js/shopping/dispatch-ui.js` — UI-modulen för knapp, confirm, result-modal

**Modifierade filer:**
- `api/_shared/willys-matcher.js` — exportera `extractOfferCanon` + `rejectsMatch` så nya moduler kan återanvända canon-logiken
- `api/willys-offers.js` — extrahera `fetchOffersFromWillys(storeId)` som publik export så endpoint kan återanvända den utan HTTP-hop
- `js/shopping/shopping-list.js` — initiera dispatch-UI i `loadShoppingTab`
- `index.html` — ny `<button id="dispatchToWillysBtn">` + `<div id="dispatchModal">`
- `css/styles.css` — stilning av ny knapp + modal
- `.claude/settings.json` — utökad PostToolUse-hook för dispatch-endpointen
- `CLAUDE.md` — Dashboard + Senaste session efter deploy

---

## Task 1: Exportera canon-helpers från willys-matcher.js

**Files:**
- Modify: `api/_shared/willys-matcher.js:18-41`
- Create: `tests/dispatch-to-willys.test.js`

`extractOfferCanon` och `rejectsMatch` är interna funktioner idag men behövs av `willys-search.js` och `dispatch-matcher.js`. Vi exporterar dem utan att ändra beteende.

- [ ] **Step 1: Skapa testfilen med första failing test**

Skapa `tests/dispatch-to-willys.test.js`:

```js
// Regressiontester för Willys-dispatch-kedjan: sök, cart-klient, matcher, endpoint.
// Körs med `node tests/dispatch-to-willys.test.js` — inga externa deps.
// Hook: se .claude/settings.json — blockerar commit vid regression.

import { extractOfferCanon, rejectsMatch } from "../api/_shared/willys-matcher.js";

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

console.log(`\n${passed} passerade, ${failed} failade`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(f));
  process.exit(1);
}
```

- [ ] **Step 2: Kör testet, verifiera att det failar med import-fel**

Run: `node tests/dispatch-to-willys.test.js`
Expected: `SyntaxError: The requested module '../api/_shared/willys-matcher.js' does not provide an export named 'extractOfferCanon'`

- [ ] **Step 3: Lägg till export på `extractOfferCanon` och `rejectsMatch`**

I `api/_shared/willys-matcher.js`, byt:

```js
function rejectsMatch(canon, offer) {
```

till:

```js
export function rejectsMatch(canon, offer) {
```

Och byt:

```js
function extractOfferCanon(offer) {
```

till:

```js
export function extractOfferCanon(offer) {
```

- [ ] **Step 4: Kör testet, verifiera att det passerar**

Run: `node tests/dispatch-to-willys.test.js`
Expected: `4 passerade, 0 failade`

- [ ] **Step 5: Kör befintliga tester, verifiera att ingen regression**

Run: `node tests/match.test.js && node tests/shopping.test.js && node tests/select-recipes.test.js`
Expected: Alla tester passerar (match.test.js fortsätter använda matchRecipe som förut).

- [ ] **Step 6: Commit**

```bash
git add api/_shared/willys-matcher.js tests/dispatch-to-willys.test.js
git commit -m "export extractOfferCanon och rejectsMatch för dispatch-modulerna"
```

---

## Task 2: Extrahera fetchOffersFromWillys i willys-offers.js

**Files:**
- Modify: `api/willys-offers.js:68-99`

Endpointen `dispatch-to-willys` behöver offers-listan men ska inte göra en HTTP-hop till `/api/willys-offers` (det är samma serverless-miljö). Vi extraherar offer-hämtningen som en publik funktion.

- [ ] **Step 1: Skriv failing test**

Lägg till i `tests/dispatch-to-willys.test.js` efter Task 1-blocket, före `console.log`:

```js
// ─── Task 2: fetchOffersFromWillys-export ─────────────────────────
import { fetchOffersFromWillys } from "../api/willys-offers.js";
assertEq(typeof fetchOffersFromWillys, "function", "fetchOffersFromWillys är en funktion");
```

- [ ] **Step 2: Kör testet, verifiera fail**

Run: `node tests/dispatch-to-willys.test.js`
Expected: `SyntaxError: ... does not provide an export named 'fetchOffersFromWillys'`

- [ ] **Step 3: Refaktorera willys-offers.js**

Lägg till ovanför `export default async function handler`:

```js
// Återanvändbar fetch av offers utan HTTP-hop — används av dispatch-to-willys.
// Tar en storeId och en optional fetchImpl (för testbarhet).
export async function fetchOffersFromWillys(store, fetchImpl = fetch) {
  const url = `${WILLYS_BASE}?q=${store}&type=PERSONAL_GENERAL&page=0&size=500`;
  const upstream = await fetchImpl(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Receptbok/1.0 (familjematplanering)",
    },
  });
  if (!upstream.ok) {
    throw new Error(`Willys svarade ${upstream.status}`);
  }
  const data = await upstream.json();
  return normalizeOffers(data.results || []);
}
```

Uppdatera sedan handlern att använda den:

```js
  try {
    const offers = await fetchOffersFromWillys(store);
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=7200");
    return res.status(200).json({
      generated: new Date().toISOString(),
      store,
      count: offers.length,
      offers,
    });
  } catch (err) {
    console.error("willys-offers error:", err);
    return res.status(502).json({
      error: "Kunde inte hämta Willys-erbjudanden — prova igen om en stund.",
    });
  }
```

- [ ] **Step 4: Kör testet, verifiera pass**

Run: `node tests/dispatch-to-willys.test.js`
Expected: `5 passerade, 0 failade`

- [ ] **Step 5: Smoke-test att endpointen fortfarande fungerar**

Run: `node -e "const h = require('./api/willys-offers.js'); console.log(typeof h.default);"`
Expected: `function` (eller motsvarande ESM-output). Om node klagar på ESM, skippa — node --check räcker, hooken fångar syntaxfel.

Run: `node --check api/willys-offers.js`
Expected: Ingen output (syntax OK).

- [ ] **Step 6: Commit**

```bash
git add api/willys-offers.js tests/dispatch-to-willys.test.js
git commit -m "extrahera fetchOffersFromWillys som publik export"
```

---

## Task 3: Skapa willys-search.js (söknings-API-klient)

**Files:**
- Create: `api/_shared/willys-search.js`
- Modify: `tests/dispatch-to-willys.test.js`

Ny modul som wrappar `GET /search?q=<canon>` och filtrerar träffar genom canon-guard (första träff vars `extractOfferCanon` === input-canon och som inte `rejectsMatch`). Löser vitlök→"Lök Vit"- och grädde→vispgrädde-buggarna från 4E-rekon.

- [ ] **Step 1: Skriv failing test**

Lägg till i `tests/dispatch-to-willys.test.js` efter Task 2-blocket:

```js
// ─── Task 3: willys-search.js — findProductByCanon ────────────────
import { createSearchClient } from "../api/_shared/willys-search.js";

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
      "q=smör": {
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
          { code: "matl_ST", name: "Matlagningsgrädde 15%", productLine2: "", online: true, outOfStock: false, priceValue: 25 },
        ],
      },
    }),
  });
  const hit = await client.findProductByCanon("grädde");
  assertEq(hit?.code, "matl_ST", "spraygrädde rejectsMatch → matlagningsgrädde väljs");
}
```

- [ ] **Step 2: Kör testet, verifiera fail**

Run: `node tests/dispatch-to-willys.test.js`
Expected: `SyntaxError ... willys-search.js`

- [ ] **Step 3: Skapa willys-search.js**

Skapa `api/_shared/willys-search.js`:

```js
// Sökklient mot Willys publika /search-endpoint.
// Används som fallback när en canon inte finns i rea-kampanj-cachen.
//
// Returnerad hit-shape: { code, name, brandLine, priceValue, canon, source: 'search' }
//
// Filter: första träff vars extractOfferCanon === canon OCH ej rejectsMatch.
// Detta eliminerar klassiska buggar från 4E-rekonen:
//   - vitlöksklyftor → "Lök Vit Stor" (sökmotorn stemmar "lök")
//   - grädde → "Spraygrädde Vispgrädde 35%" (spraygrädde ≠ matlagningsgrädde)

import { extractOfferCanon, rejectsMatch } from "./willys-matcher.js";

const SEARCH_URL = "https://www.willys.se/search";

export function createSearchClient({ fetchImpl = fetch } = {}) {
  async function findProductByCanon(canon) {
    const url = `${SEARCH_URL}?q=${encodeURIComponent(canon)}&size=10`;
    const res = await fetchImpl(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Receptbok/1.0 (familjematplanering)",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.results || [];
    for (const r of results) {
      if (r.outOfStock) continue;
      if (r.online === false) continue;
      const offerShape = { name: r.name || "", brandLine: r.productLine2 || "" };
      const offerCanon = extractOfferCanon(offerShape);
      if (offerCanon !== canon) continue;
      if (rejectsMatch(canon, offerShape)) continue;
      return {
        code: r.code,
        name: r.name,
        brandLine: r.productLine2 || null,
        priceValue: typeof r.priceValue === "number" ? r.priceValue : null,
        canon,
        source: "search",
      };
    }
    return null;
  }
  return { findProductByCanon };
}
```

- [ ] **Step 4: Kör testet, verifiera pass**

Run: `node tests/dispatch-to-willys.test.js`
Expected: `10 passerade, 0 failade` (5 tidigare + 5 från Task 3)

- [ ] **Step 5: Commit**

```bash
git add api/_shared/willys-search.js tests/dispatch-to-willys.test.js
git commit -m "lägg till willys-search-klient med canon-guard (Task 3 av 4E)"
```

---

## Task 4: Skapa dispatch-matcher.js (rea-first, search-fallback)

**Files:**
- Create: `api/_shared/dispatch-matcher.js`
- Modify: `tests/dispatch-to-willys.test.js`

Per unik canon i inköpslistan: försök rea först (från `fetchOffersFromWillys`-cache), därefter sök. Returnerar `{ matched, unmatched }`.

- [ ] **Step 1: Skriv failing test**

Lägg till i `tests/dispatch-to-willys.test.js`:

```js
// ─── Task 4: dispatch-matcher — matchCanons ───────────────────────
import { matchCanons } from "../api/_shared/dispatch-matcher.js";

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
    { code: "matl_ST", name: "Matlagningsgrädde", brandLine: "", savingPerUnit: 2 },
  ];
  const search = fakeSearch({});
  const result = await matchCanons(["grädde"], offers, search);
  assertEq(result.matched.length, 1, "en match efter rejectsMatch");
  assertEq(result.matched[0].code, "matl_ST", "spray rejects, matlagnings väljs");
}
```

- [ ] **Step 2: Kör testet, verifiera fail**

Run: `node tests/dispatch-to-willys.test.js`
Expected: `SyntaxError ... dispatch-matcher.js`

- [ ] **Step 3: Skapa dispatch-matcher.js**

Skapa `api/_shared/dispatch-matcher.js`:

```js
// Per-canon-matchning för dispatch till Willys.
// Försöker rea-träff först (från willys-offers-cache), söker annars.
//
// Input:
//   canons       — array av canon-strängar (dubbletter OK, dedupeas)
//   offers       — array i shopping-builder-shape ({code, name, brandLine, ...})
//   searchClient — { findProductByCanon(canon): Promise<{code, name, ...} | null> }
//
// Output:
//   { matched: [{canon, code, name, brandLine, source, savingPerUnit?}], unmatched: [canon] }

import { extractOfferCanon, rejectsMatch } from "./willys-matcher.js";

export async function matchCanons(canons, offers, searchClient) {
  const unique = [...new Set(canons.filter(Boolean))];
  const matched = [];
  const unmatched = [];

  for (const canon of unique) {
    const reaHit = findReaMatch(canon, offers);
    if (reaHit) {
      matched.push({
        canon,
        code: reaHit.code,
        name: reaHit.name,
        brandLine: reaHit.brandLine || null,
        source: "rea",
        savingPerUnit: reaHit.savingPerUnit || 0,
      });
      continue;
    }
    const searchHit = await searchClient.findProductByCanon(canon);
    if (searchHit) {
      matched.push({
        canon,
        code: searchHit.code,
        name: searchHit.name,
        brandLine: searchHit.brandLine || null,
        source: "search",
        savingPerUnit: 0,
      });
      continue;
    }
    unmatched.push(canon);
  }

  return { matched, unmatched };
}

function findReaMatch(canon, offers) {
  for (const offer of offers) {
    const offerCanon = extractOfferCanon(offer);
    if (offerCanon !== canon) continue;
    if (rejectsMatch(canon, offer)) continue;
    return offer;
  }
  return null;
}
```

- [ ] **Step 4: Kör testet, verifiera pass**

Run: `node tests/dispatch-to-willys.test.js`
Expected: 10 + 7 = `17 passerade, 0 failade`

- [ ] **Step 5: Commit**

```bash
git add api/_shared/dispatch-matcher.js tests/dispatch-to-willys.test.js
git commit -m "lägg till dispatch-matcher med rea-först, search-fallback"
```

---

## Task 5: Skapa willys-cart-client.js

**Files:**
- Create: `api/_shared/willys-cart-client.js`
- Modify: `tests/dispatch-to-willys.test.js`

Wrappar de tre cart-operationerna: preflight (auth-check), addProducts (bulk), verifyCart. Dependency-injectad fetch för testbarhet.

- [ ] **Step 1: Skriv failing test**

Lägg till i `tests/dispatch-to-willys.test.js`:

```js
// ─── Task 5: willys-cart-client ───────────────────────────────────
import { createCartClient } from "../api/_shared/willys-cart-client.js";

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
```

- [ ] **Step 2: Kör testet, verifiera fail**

Run: `node tests/dispatch-to-willys.test.js`
Expected: `SyntaxError ... willys-cart-client.js`

- [ ] **Step 3: Skapa willys-cart-client.js**

Skapa `api/_shared/willys-cart-client.js`:

```js
// Klient för Willys cart-API.
// Reverse-engineered + verifierad i scripts/willys-cart-poc.mjs (Session 37).
//
// Auth: cookies-sträng (inkl. JSESSIONID + axfoodRememberMe) + x-csrf-token-header.
// Cookies har livslängd ≈ 3 mån (knutna till axfoodRememberMe). CSRF följer med.
//
// Alla operationer kräver båda delarna — preflight misslyckas annars med 401.

const BASE = "https://www.willys.se";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

export function createCartClient({ fetchImpl = fetch, cookies, csrf }) {
  function baseHeaders(extra = {}) {
    return {
      "user-agent": UA,
      "accept": "*/*",
      "accept-language": "sv-SE,sv;q=0.9",
      "cookie": cookies,
      ...extra,
    };
  }

  async function preflight() {
    const res = await fetchImpl(`${BASE}/axfood/rest/cart`, {
      method: "GET",
      headers: baseHeaders(),
    });
    return { ok: res.ok, status: res.status };
  }

  async function addProducts(codes) {
    const body = JSON.stringify({
      products: codes.map(code => ({
        productCodePost: code,
        qty: 1,
        pickUnit: "pieces",
        hideDiscountToolTip: false,
        noReplacementFlag: false,
      })),
    });
    const res = await fetchImpl(`${BASE}/axfood/rest/cart/addProducts`, {
      method: "POST",
      headers: baseHeaders({
        "content-type": "application/json",
        "origin": BASE,
        "referer": `${BASE}/`,
        "x-csrf-token": csrf || "",
      }),
      body,
    });
    let parsed = null;
    try { parsed = await res.json(); } catch { /* body not JSON */ }
    return { ok: res.ok, status: res.status, response: parsed };
  }

  async function verifyCart() {
    const res = await fetchImpl(`${BASE}/axfood/rest/cart`, {
      method: "GET",
      headers: baseHeaders(),
    });
    if (!res.ok) return { ok: false, status: res.status, entries: [] };
    const data = await res.json();
    return { ok: true, status: 200, entries: data.entries || data.products || [] };
  }

  return { preflight, addProducts, verifyCart };
}
```

- [ ] **Step 4: Kör testet, verifiera pass**

Run: `node tests/dispatch-to-willys.test.js`
Expected: 17 + 10 = `27 passerade, 0 failade`

- [ ] **Step 5: Commit**

```bash
git add api/_shared/willys-cart-client.js tests/dispatch-to-willys.test.js
git commit -m "lägg till willys-cart-client (preflight, addProducts, verifyCart)"
```

---

## Task 6: Skapa endpoint api/dispatch-to-willys.js

**Files:**
- Create: `api/dispatch-to-willys.js`
- Modify: `tests/dispatch-to-willys.test.js`

Endpointen knyter ihop modulerna. GET returnerar `featureAvailable`-flagga. POST med `{ date }` utför dispatch mot shopping-list.json.

För att unvika HTTP-hoppet till `/api/shopping` för shopping-list-filen använder vi `loadJsonFile` från `api/_shared/github.js`-mönstret (samma som andra endpoints). Snabb kontroll av den filens export först.

- [ ] **Step 1: Kontrollera github-helpern**

Run: `grep -E "^export" api/_shared/github.js | head`

Titta efter `loadJsonFile`, `loadRepoFile`, eller liknande. Anteckna funktionsnamnet — i steg 4 behöver vi importera det. Om den heter något annat (t.ex. `readFile`, `getFile`), använd det namnet i koden nedan.

- [ ] **Step 2: Skriv failing integrations-test**

Lägg till i `tests/dispatch-to-willys.test.js`:

```js
// ─── Task 6: endpoint integration (ren logikfunktion) ─────────────
// Endpoint-handlern testas inte direkt (kräver Vercel-miljö) — istället
// testar vi den rena dispatch-funktionen som den delegerar till.
import { runDispatch } from "../api/dispatch-to-willys.js";

// Fake shopping-list + offers + searchClient + cartClient
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
    { code: "rea_gradde_ST", name: "Matlagningsgrädde 15%", brandLine: "Arla", savingPerUnit: 5 },
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
    verifyCart: async () => ({ ok: true, status: 200, entries: codes => [] }),
  };

  const result = await runDispatch({ shoppingList, offers, searchClient, cartClient });
  assertEq(result.ok, true, "dispatch ok");
  assertEq(result.addedCount, 3, "3 produkter skickade");
  assertTrue(captured.includes("rea_gradde_ST"), "rea-grädde med");
  assertTrue(captured.includes("s_mjolk_ST"), "search-mjölk med");
  assertTrue(captured.includes("s_purjo_ST"), "search-purjolök med");
  assertEq(result.missing.length, 0, "inga unmatched");
}

// Preflight 401 → avbryter utan POST
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

// Tom shopping-list → ingen POST, tydligt fel
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
```

- [ ] **Step 3: Kör testet, verifiera fail**

Run: `node tests/dispatch-to-willys.test.js`
Expected: `SyntaxError ... dispatch-to-willys.js`

- [ ] **Step 4: Skapa api/dispatch-to-willys.js**

Skapa `api/dispatch-to-willys.js`:

```js
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
```

- [ ] **Step 5: Kör testet, verifiera pass**

Run: `node tests/dispatch-to-willys.test.js`
Expected: 27 + 9 ≈ `36 passerade, 0 failade` (exakt antal beror på antal assertEq-rader i Task 6-testen — räkna dem och bekräfta)

- [ ] **Step 6: Commit**

```bash
git add api/dispatch-to-willys.js tests/dispatch-to-willys.test.js
git commit -m "lägg till /api/dispatch-to-willys endpoint"
```

---

## Task 7: Utöka PostToolUse-hook för dispatch

**Files:**
- Modify: `.claude/settings.json`

Ny hook kör `tests/dispatch-to-willys.test.js` vid Edit av endpointen eller någon av shared-modulerna.

- [ ] **Step 1: Lägg till hook**

I `.claude/settings.json`, i `PostToolUse`-arrayen (efter befintlig `select-recipes.js`-hook), lägg till:

```json
          {
            "type": "command",
            "command": "INPUT=$(cat); FILE=$(echo \"$INPUT\" | grep -o '\"file_path\"[[:space:]]*:[[:space:]]*\"[^\"]*\"' | head -1 | sed 's/.*\"\\([^\"]*\\)\"/\\1/'); case \"$FILE\" in *dispatch-to-willys.js|*willys-search.js|*willys-cart-client.js|*dispatch-matcher.js) node tests/dispatch-to-willys.test.js >&2 || { echo 'BLOCKERAD: dispatch-regressiontester failade — kör node tests/dispatch-to-willys.test.js för detaljer.' >&2; exit 2; };; esac; exit 0"
          }
```

- [ ] **Step 2: Verifiera att hooken laddas**

Run: `node --check .claude/settings.json 2>&1 || python -c "import json; json.load(open('.claude/settings.json'))"`
Expected: Ingen felutskrift (JSON är giltig). Om python saknas, verifiera manuellt genom att öppna filen.

- [ ] **Step 3: Verifiera att testen fortfarande passerar**

Run: `node tests/dispatch-to-willys.test.js`
Expected: Alla passerar (ingen kodändring).

- [ ] **Step 4: Commit**

```bash
git add .claude/settings.json
git commit -m "hook: kör dispatch-tester vid edit av endpoint/moduler"
```

---

## Task 8: UI-knapp och feature-detection

**Files:**
- Create: `js/shopping/dispatch-ui.js`
- Modify: `index.html:222-242`
- Modify: `js/shopping/shopping-list.js:163-197`

UI:t består av tre delar: knapp i shopContent, confirm-dialog, result-modal. Feature-detection kör en GET mot endpointen vid tab-load och döljer knappen om `featureAvailable === false`.

- [ ] **Step 1: Lägg till knapp + modal-stubs i index.html**

I `index.html`, byt:

```html
      <button class="shop-clear-btn" id="modeBtnClear" onclick="clearShoppingList()">Rensa lista</button>
    </div>
  </div>
</div>
```

till:

```html
      <button class="shop-clear-btn" id="modeBtnClear" onclick="clearShoppingList()">Rensa lista</button>
      <button class="shop-dispatch-btn" id="dispatchToWillysBtn" style="display:none" onclick="openDispatchConfirm()">
        📤 Skicka till Willys
      </button>
    </div>
  </div>
</div>

<div id="dispatchModal" class="modal-overlay" style="display:none" onclick="handleDispatchOverlayClick(event)">
  <div class="modal-box dispatch-modal-box">
    <div class="modal-header">
      <h2 id="dispatchModalTitle">Skicka till Willys</h2>
      <button onclick="closeDispatchModal()">✕</button>
    </div>
    <div id="dispatchModalBody"></div>
  </div>
</div>
```

- [ ] **Step 2: Skapa js/shopping/dispatch-ui.js**

```js
// Dispatch-UI: knapp → confirm → POST → resultat-modal.
// Läser state: window._shopRecipeItems (för räkning i confirm-dialog)
// Feature-toggled via GET /api/dispatch-to-willys vid tab-load.

const CART_URL = "https://www.willys.se/cart";

export async function initDispatchUI() {
  const btn = document.getElementById("dispatchToWillysBtn");
  if (!btn) return;
  try {
    const res = await fetch("/api/dispatch-to-willys");
    if (!res.ok) { btn.style.display = "none"; return; }
    const data = await res.json();
    btn.style.display = data.featureAvailable ? "" : "none";
  } catch {
    btn.style.display = "none";
  }
}

export function openDispatchConfirm() {
  const items = window._shopRecipeItems || {};
  const totalCount = Object.values(items).reduce((sum, arr) => sum + (arr?.length || 0), 0);
  if (totalCount === 0) {
    showResult(`
      <p>Inköpslistan är tom — inget att skicka.</p>
      <div class="dispatch-actions"><button onclick="closeDispatchModal()">Stäng</button></div>
    `);
    return;
  }
  showResult(`
    <p>Skicka ${totalCount} ingredienser till din Willys-korg?</p>
    <p class="dispatch-note">Matchade produkter (rea och söknings-träffar) läggs in i korgen. Omatchade rapporteras efteråt så du kan lägga till dem själv.</p>
    <div class="dispatch-actions">
      <button class="btn-secondary" onclick="closeDispatchModal()">Avbryt</button>
      <button class="btn-primary" id="dispatchRunBtn" onclick="runDispatch()">Skicka</button>
    </div>
  `);
}

export async function runDispatch() {
  const runBtn = document.getElementById("dispatchRunBtn");
  if (runBtn) { runBtn.disabled = true; runBtn.textContent = "Skickar…"; }
  showResult(`
    <p>Skickar till Willys…</p>
    <div class="dispatch-loader">⏳</div>
  `);
  try {
    const res = await fetch("/api/dispatch-to-willys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: new Date().toISOString().slice(0, 10) }),
    });
    const data = await res.json();
    renderResult(data);
  } catch {
    showResult(`
      <p>Kunde inte nå Willys. Prova igen om en stund.</p>
      <div class="dispatch-actions"><button onclick="closeDispatchModal()">Stäng</button></div>
    `);
  }
}

function renderResult(data) {
  if (data.ok) {
    const missingHtml = (data.missing || []).length
      ? `<p class="dispatch-missing-header">Kunde inte matchas (lägg till själv):</p>
         <ul class="dispatch-missing">${data.missing.map(m => `<li>${escapeHtml(m)}</li>`).join("")}</ul>`
      : "";
    const sources = data.sources || {};
    const sourceNote = (sources.rea || sources.search)
      ? `<p class="dispatch-sources">${sources.rea || 0} från rea, ${sources.search || 0} från sök</p>`
      : "";
    showResult(`
      <p>✓ ${data.addedCount} produkter tillagda i din Willys-korg.</p>
      ${sourceNote}
      ${missingHtml}
      <div class="dispatch-actions">
        <a class="btn-primary" href="${CART_URL}" target="_blank" rel="noopener">Öppna din korg på willys.se →</a>
        <button class="btn-secondary" onclick="closeDispatchModal()">Stäng</button>
      </div>
    `);
    return;
  }
  showResult(`
    <p>${escapeHtml(data.message || "Något gick fel — prova igen om en stund.")}</p>
    <div class="dispatch-actions"><button onclick="closeDispatchModal()">Stäng</button></div>
  `);
}

function showResult(html) {
  const modal = document.getElementById("dispatchModal");
  const body = document.getElementById("dispatchModalBody");
  body.innerHTML = html;
  modal.style.display = "";
}

export function closeDispatchModal() {
  document.getElementById("dispatchModal").style.display = "none";
}

export function handleDispatchOverlayClick(event) {
  if (event.target.id === "dispatchModal") closeDispatchModal();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Exponera på window för inline onclick
window.openDispatchConfirm = openDispatchConfirm;
window.runDispatch = runDispatch;
window.closeDispatchModal = closeDispatchModal;
window.handleDispatchOverlayClick = handleDispatchOverlayClick;
window.initDispatchUI = initDispatchUI;
```

- [ ] **Step 3: Koppla in initDispatchUI från shopping-list.js**

I `js/shopping/shopping-list.js`, i `loadShoppingTab`-funktionen, strax efter raden `document.getElementById('shopContent').style.display = '';`, lägg till:

```js
    if (typeof window.initDispatchUI === 'function') window.initDispatchUI();
```

- [ ] **Step 4: Importera dispatch-ui.js från app.js**

Run: `grep -n "import " js/app.js | head -20`

Läs utdata och lägg till en `import './shopping/dispatch-ui.js';` bland de andra shopping-importerna (i samma mönster som shopping-list.js importeras).

- [ ] **Step 5: Verifiera att sidan laddar utan JS-fel**

Öppna `index.html` i Antigravity live preview. Öppna DevTools → Console. Gå till inköpstabben.
Expected: Inga `ReferenceError`/`SyntaxError`. Knappen är dold (feature-detection i preview returnerar troligen `featureAvailable:false` eftersom endpointen inte finns lokalt).

- [ ] **Step 6: Commit**

```bash
git add index.html js/shopping/dispatch-ui.js js/shopping/shopping-list.js js/app.js
git commit -m "UI: dispatch-knapp + confirm/resultat-modal med feature-detection"
```

---

## Task 9: CSS för knapp och modal

**Files:**
- Modify: `css/styles.css`

Styling matchar projektets terrakotta-tema (`#c2522b`) och befintliga `.modal-overlay`/`.modal-box`-mönster.

- [ ] **Step 1: Lägg till CSS**

I `css/styles.css`, i slutet av filen:

```css
/* ─── Dispatch-till-Willys ──────────────────────────────────────── */
.shop-dispatch-btn {
  display: block;
  width: 100%;
  margin-top: 1rem;
  padding: 0.9rem 1.2rem;
  background: #c2522b;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 1.05rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.shop-dispatch-btn:hover { background: #a6431f; }
.shop-dispatch-btn:disabled { opacity: 0.6; cursor: default; }

.dispatch-modal-box {
  max-width: 480px;
  padding: 1.5rem;
}
.dispatch-modal-box p { margin: 0.5rem 0; line-height: 1.5; }
.dispatch-note { color: #5c3d1e; font-size: 0.9rem; opacity: 0.85; }
.dispatch-missing-header { font-weight: 600; margin-top: 1rem !important; }
.dispatch-missing {
  margin: 0.5rem 0 1rem 1.2rem;
  padding: 0;
  color: #5c3d1e;
  font-size: 0.95rem;
}
.dispatch-missing li { margin: 0.15rem 0; }
.dispatch-sources {
  color: #5c3d1e;
  font-size: 0.88rem;
  opacity: 0.75;
  margin-top: 0.2rem !important;
}
.dispatch-loader {
  font-size: 2rem;
  text-align: center;
  margin: 1rem 0;
}
.dispatch-actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 1.2rem;
  flex-wrap: wrap;
}
.dispatch-actions .btn-primary,
.dispatch-actions .btn-secondary {
  flex: 1;
  padding: 0.7rem 1rem;
  border-radius: 8px;
  border: none;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  text-decoration: none;
  display: inline-block;
}
.dispatch-actions .btn-primary {
  background: #c2522b;
  color: #fff;
}
.dispatch-actions .btn-primary:hover { background: #a6431f; }
.dispatch-actions .btn-secondary {
  background: #e8dfd0;
  color: #5c3d1e;
}
.dispatch-actions .btn-secondary:hover { background: #d9ccb8; }

@media (max-width: 600px) {
  .dispatch-actions { flex-direction: column; }
  .dispatch-modal-box { max-width: calc(100vw - 2rem); }
}
```

- [ ] **Step 2: Visuell kontroll i live preview**

Öppna `index.html` i Antigravity. Tillfälligt ändra `display:none` → `display:""` på `#dispatchToWillysBtn` i DevTools för att se knappen.
Expected: Terrakotta knapp, full-width, matchar övriga knappar i stil.

Klicka knappen manuellt via DevTools `openDispatchConfirm()`-anrop.
Expected: Modal öppnas, confirm-text visas, "Skicka"-knapp terrakotta, "Avbryt"-knapp beige.

- [ ] **Step 3: Återställ inline-stil**

Om du ändrade `display=''` i Steg 2 via DevTools — inget behöver återställas i filen (ändringen var bara runtime).

- [ ] **Step 4: Commit**

```bash
git add css/styles.css
git commit -m "CSS: stilning för dispatch-knapp och resultat-modal"
```

---

## Task 10: Deploy + manuell sanity-check

**Files:**
- Read-only: Vercel env vars, Willys-browser-session

Innan du pushar, behöver `WILLYS_COOKIE`, `WILLYS_CSRF` och `WILLYS_STORE_ID` finnas i Vercel. Om de inte är satta kommer UI:t bara dölja knappen (graceful) — testet blir meningslöst tills env vars finns.

- [ ] **Step 1: Be användaren fylla Vercel env vars**

**Stanna och fråga användaren:**

```
Innan deploy behöver Vercel ha tre env vars:
  WILLYS_COOKIE    — raw cookie-sträng från inloggad willys.se-session
  WILLYS_CSRF      — x-csrf-token från samma session
  WILLYS_STORE_ID  — 2160

Är dessa redan satta? Om inte, följ refresh-rutinen i
docs/superpowers/specs/2026-04-20-willys-dispatch-design.md (sektionen "Auth & secrets").
```

Vänta på bekräftelse innan push.

- [ ] **Step 2: Pusha allt till main**

Run: `git push origin main`
Expected: Vercel startar deploy (~30 sek).

- [ ] **Step 3: Vänta ~45 sek, testa GET**

Run: `sleep 45 && curl -sS https://receptbok-six.vercel.app/api/dispatch-to-willys`
Expected: `{"featureAvailable":true}` (om env vars finns) eller `{"featureAvailable":false}`.

- [ ] **Step 4: Öppna https://receptbok-six.vercel.app i browser**

Gå till inköpslistan-tabben.
Expected: Terrakotta "📤 Skicka till Willys"-knapp synlig.

Klicka knappen → confirm-dialog med antal ingredienser.
Klicka "Skicka" → loader → resultat-modal med `X produkter tillagda`, source-uppdelning, ev. unmatched-lista, länk till willys.se.

- [ ] **Step 5: Öppna https://www.willys.se/cart i browser**

Expected: Produkterna ligger i korgen. Ta en skärmdump om användaren vill ha bevis.

- [ ] **Step 6: Uppdatera CLAUDE.md**

I Dashboard-sektionen:
- Bocka `[ ] 4D` → `[x] 4D`
- Bocka `[ ] 4E` → `[x] 4E`
- Lägg till ny "Senaste session"-post med datum, motivering, resultat, filer.
- Flytta Session 37-posten till äldre-delen om avsnittslängden växer för mycket.

Exempel-post:

```markdown
### Senaste session — Session 38 (YYYY-MM-DD) — Willys-dispatch MVP (Fas 4D+4E)
- **Motivering:** Användaren vill trycka en knapp och få veckans inköpslista i Willys-korgen. 4D+4E byggda i samma plan efter 4E-rekon visade att söknings-API:t `GET /search?q=<canon>` är publikt och returnerar 18/20 rimliga första-träffar (efter extractOfferCanon-guard).
- **Implementation:** Ny endpoint `/api/dispatch-to-willys` (GET=feature-check, POST=dispatch). Tre nya shared-moduler: `willys-search.js` (sökklient med canon-guard), `willys-cart-client.js` (preflight+POST+verify), `dispatch-matcher.js` (rea först, sök som fallback). Återanvänder `extractOfferCanon` + `CANON_REJECT_PATTERNS` från Session 35. UI: terrakotta "📤 Skicka till Willys"-knapp + confirm-modal + resultat-panel.
- **Täckning:** X av Y ingredienser (cirka N% rea + M% sök). Omatchade visas i resultat-modal.
- **Tester:** ~N nya assertions i `tests/dispatch-to-willys.test.js`. PostToolUse-hook bevakar shared-modulerna.
- **Filer nya:** `api/dispatch-to-willys.js`, `api/_shared/{willys-search,willys-cart-client,dispatch-matcher}.js`, `js/shopping/dispatch-ui.js`, `tests/dispatch-to-willys.test.js`.
- **Filer ändrade:** `api/_shared/willys-matcher.js` (exports), `api/willys-offers.js` (refaktor), `js/shopping/shopping-list.js`, `js/app.js`, `index.html`, `css/styles.css`, `.claude/settings.json`.
- **Kvar:** Ev. Task 12-uppföljning för _KG-produkter om verifieringen visar rejects.
```

Sedan:

```bash
git add CLAUDE.md
git commit -m "Session 38 — Willys-dispatch MVP (Fas 4D+4E)"
git push origin main
```

- [ ] **Step 7: Verifiera hooken fungerar**

Run: `touch api/_shared/dispatch-matcher.js` (eller en småre-edit via Edit-tool).
Expected: PostToolUse-hook kör `node tests/dispatch-to-willys.test.js` och rapporterar pass.

---

## Task 11 (uppföljning, valfri): _KG-produkter

Om Task 10:s verifiering visar att _KG-produkter (`100269139_KG` för lök, `100152264_KG` för tomat) returneras med fel från `addProducts`, lägg till i `willys-cart-client.js`:

```js
const pickUnit = code.endsWith("_KG") ? "KG" : "pieces";
```

Och i tester verifiera att båda varianterna skickas korrekt. Commit separat om frågan uppstår.

Byggs bara om MVP visar konkreta _KG-rejects. YAGNI tills dess.

---

## Self-review

- **Spec-täckning:** ✓ Auth, matcher-integration, preflight, UI, felhantering, tester, env vars. ✓ Fas 4E-fallback utöver spec. Task 11 flaggar _KG-edge-case.
- **Placeholder-scan:** Inga TBD/TODO/"add appropriate X". Alla kod-block är kompletta.
- **Typ-konsistens:** `createSearchClient`, `createCartClient`, `matchCanons`, `runDispatch` — samma namn genom hela planen. `extractOfferCanon`, `rejectsMatch`, `fetchOffersFromWillys` — samma exports över alla tasks. Response-shape (`ok`, `addedCount`, `missing`, `cartUrl`, `sources`, `error`, `message`) konsekvent mellan Task 6 och Task 8.
