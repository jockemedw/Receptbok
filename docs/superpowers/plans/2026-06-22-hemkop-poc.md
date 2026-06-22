# Hemköp-PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ett fristående `scripts/hemkop-cart-poc.mjs` som svarar PASS/FAIL på om hemkop.se Axfood-korgen kan fyllas programmatiskt på samma sätt som Willys.

**Architecture:** Ett isolerat Node-skript (ESM, inga deps) som speglar `scripts/willys-cart-poc.mjs`. Läser cookies/CSRF/butiks-ID från en gitignorerad lokal fil, kör fyra probes mot hemkop.se (preflight, sök, erbjudanden, addProducts+verify) och skriver en PASS/FAIL-tabell till stdout. Rör ingen produktionskod.

**Tech Stack:** Node.js inbyggd `fetch` + `node:fs`. Ingen extern dependency. Körs med `node`.

## Global Constraints

- **Ingen produktionskod rörs** — bara `scripts/` + `.gitignore`. (spec: "All produktionskod oförändrad")
- **Inga hemligheter i git** — cookies/CSRF läses från `scripts/.hemkop-cookies.local`, som måste vara gitignorerad. (spec: "Manuellt klistrade cookies")
- **Ingen checkout, ingen tömning** — PoC:n lägger *en* vara i korgen och verifierar. Manuell uppstädning. (spec: "Read-then-write-then-verify")
- **Bas-URL:** `https://www.hemkop.se`. Antagna Axfood-paths: `/axfood/rest/cart`, `/axfood/rest/cart/addProducts`, `/search`. (spec: "Vad PoC:n ska bekräfta")
- **Avvikande endpoints failar inte tyst** — vid icke-200/oväntad form loggas rå (trunkerad) svarskropp så path kan härledas. (spec: "Endpoint-upptäckt inbyggd")
- **Alla utskrifter på svenska**, PASS/FAIL i klartext med rå statuskod.

---

### Task 1: Gitignore + cred-loader-skelett

**Files:**
- Modify: `.gitignore` (lägg till en rad)
- Create: `scripts/hemkop-cart-poc.mjs`

**Interfaces:**
- Produces: `loadCreds()` → `Promise<{ cookie: string, csrf: string, storeId: string }>`. Kastar med ett svenskt, handlingsorienterat felmeddelande om filen saknas eller fält är tomma.
- Produces: konstanter `BASE = "https://www.hemkop.se"`, `UA` (Chrome-UA-sträng), `CREDS_FILE` (absolut path till `.hemkop-cookies.local`).

- [ ] **Step 1: Lägg cred-filen i .gitignore**

Lägg till denna rad i `.gitignore` (i blocket nära `scripts/.willys-cookies.local` om det finns där, annars sist):

```
scripts/.hemkop-cookies.local
```

- [ ] **Step 2: Verifiera att git ignorerar filen**

Run: `git check-ignore scripts/.hemkop-cookies.local`
Expected: utskriften `scripts/.hemkop-cookies.local` (= regeln matchar). Tom utskrift = regeln saknas, gå tillbaka till Step 1.

- [ ] **Step 3: Skriv skript-skelett med cred-loader**

Skapa `scripts/hemkop-cart-poc.mjs` med exakt detta innehåll:

```js
// PoC: verifierar om hemkop.se (Axfood-plattformen) tar emot addProducts som Willys.
// Spegling av scripts/willys-cart-poc.mjs (Session 37).
//
// Körs manuellt:  node scripts/hemkop-cart-poc.mjs [söktermin]
// Läser cookies/CSRF/butiks-ID från scripts/.hemkop-cookies.local (gitignorerad):
//   { "cookie": "<full cookie-sträng>", "csrf": "<x-csrf-token>", "storeId": "<id>" }
//
// PoC:n lägger EN vara i korgen och verifierar. Ingen checkout, ingen tömning.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = "https://www.hemkop.se";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
const CREDS_FILE = join(dirname(fileURLToPath(import.meta.url)), ".hemkop-cookies.local");

async function loadCreds() {
  let raw;
  try {
    raw = await readFile(CREDS_FILE, "utf8");
  } catch {
    throw new Error(
      `Hittar inte ${CREDS_FILE}. Skapa filen med { "cookie": "...", "csrf": "...", "storeId": "..." } ` +
      `— se docs/superpowers/specs/2026-06-22-hemkop-poc-design.md för devtools-proceduren.`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${CREDS_FILE} är inte giltig JSON.`);
  }
  for (const field of ["cookie", "csrf", "storeId"]) {
    if (!parsed[field] || typeof parsed[field] !== "string") {
      throw new Error(`${CREDS_FILE} saknar fältet "${field}" (eller det är tomt).`);
    }
  }
  return { cookie: parsed.cookie, csrf: parsed.csrf, storeId: parsed.storeId };
}

function baseHeaders(creds, extra = {}) {
  return {
    "user-agent": UA,
    "accept": "*/*",
    "accept-language": "sv-SE,sv;q=0.9",
    "cookie": creds.cookie,
    ...extra,
  };
}

// Trunkerar en svarskropp för loggning (avslöjar inga cookies — det är upstream-svar).
async function bodyPreview(res) {
  try {
    const text = await res.text();
    return text.slice(0, 300);
  } catch {
    return "(kunde inte läsa kropp)";
  }
}

async function main() {
  const creds = await loadCreds();
  console.log(`Hemköp-PoC mot ${BASE} (store ${creds.storeId})\n`);
  // Probes läggs till i Task 2.
}

main().catch((err) => {
  console.error("PoC-fel:", err?.message || err);
  process.exit(1);
});
```

- [ ] **Step 4: Syntaxkoll**

Run: `node --check scripts/hemkop-cart-poc.mjs`
Expected: ingen utskrift (= ren syntax).

- [ ] **Step 5: Verifiera felmeddelandet utan creds-fil**

Run: `node scripts/hemkop-cart-poc.mjs`
Expected: `PoC-fel: Hittar inte .../scripts/.hemkop-cookies.local. Skapa filen ...` och exit-kod 1. (Bekräftar att loadCreds failar tydligt, inte tyst.)

- [ ] **Step 6: Commit**

```bash
git add .gitignore scripts/hemkop-cart-poc.mjs
git commit -m "poc(hemkop): skelett + cred-loader + gitignore"
```

---

### Task 2: De fyra probes + PASS/FAIL-sammanfattning

**Files:**
- Modify: `scripts/hemkop-cart-poc.mjs` (lägg till probe-funktioner + fyll ut `main()`)

**Interfaces:**
- Consumes: `loadCreds()`, `baseHeaders()`, `bodyPreview()`, `BASE` från Task 1.
- Produces: fyra async-funktioner som var och en returnerar `{ pass: boolean, detail: string }` plus ev. extra-fält:
  - `probePreflight(creds)` → `{ pass, status }`
  - `probeSearch(creds, term)` → `{ pass, status, code }` (`code` = en plockad produktkod eller `null`)
  - `probeOffers(creds)` → `{ pass, status, count }`
  - `probeAddAndVerify(creds, code)` → `{ pass, addStatus, verifyStatus, codeFormat }`

- [ ] **Step 1: Lägg till de fyra probe-funktionerna**

Infoga detta i `scripts/hemkop-cart-poc.mjs` direkt efter `bodyPreview()` och före `main()`:

```js
// [2] Auth-modell: GET /axfood/rest/cart med cookies → 200 = auth funkar.
async function probePreflight(creds) {
  const res = await fetch(`${BASE}/axfood/rest/cart`, { method: "GET", headers: baseHeaders(creds) });
  const pass = res.status === 200;
  if (!pass) console.log(`  preflight oväntat svar: ${await bodyPreview(res)}`);
  return { pass, status: res.status };
}

// [4a] Sök: GET /search?q=<term> → data.results[]. Plockar första köpbara koden.
async function probeSearch(creds, term) {
  const url = `${BASE}/search?q=${encodeURIComponent(term)}&size=20`;
  const res = await fetch(url, { headers: baseHeaders(creds, { accept: "application/json" }) });
  if (res.status !== 200) {
    console.log(`  sök oväntat svar (${res.status}): ${await bodyPreview(res)}`);
    return { pass: false, status: res.status, code: null };
  }
  let data;
  try { data = JSON.parse(await res.text()); } catch { data = null; }
  const results = data?.results || [];
  const first = results.find((r) => r?.code && r.outOfStock !== true && r.online !== false) || results[0];
  const code = first?.code || null;
  if (!code) console.log(`  sök gav 200 men ingen kod i results[] (form skiljer?). Antal: ${results.length}`);
  return { pass: !!code, status: res.status, code };
}

// [4b] Erbjudanden: campaigns-endpoint med butiks-ID → kampanj-array.
async function probeOffers(creds) {
  const url = `${BASE}/search/campaigns/online?q=${creds.storeId}&type=PERSONAL_GENERAL&page=0&size=500`;
  const res = await fetch(url, { headers: baseHeaders(creds, { accept: "application/json" }) });
  if (res.status !== 200) {
    console.log(`  erbjudanden oväntat svar (${res.status}): ${await bodyPreview(res)}`);
    return { pass: false, status: res.status, count: 0 };
  }
  let data;
  try { data = JSON.parse(await res.text()); } catch { data = null; }
  const count = (data?.results || []).length;
  if (count === 0) console.log(`  erbjudanden gav 200 men tom/okänd form.`);
  return { pass: count > 0, status: res.status, count };
}

// [1+3] addProducts + verify: lägg EN kod i korgen, läs tillbaka, kolla kods-format.
async function probeAddAndVerify(creds, code) {
  const pickUnit = /_kg$/i.test(code) ? "kilograms" : "pieces";
  const addRes = await fetch(`${BASE}/axfood/rest/cart/addProducts`, {
    method: "POST",
    headers: baseHeaders(creds, {
      "content-type": "application/json",
      "origin": BASE,
      "referer": `${BASE}/`,
      "x-csrf-token": creds.csrf,
    }),
    body: JSON.stringify({
      products: [{ productCodePost: code, qty: 1, pickUnit, hideDiscountToolTip: false, noReplacementFlag: false }],
    }),
  });
  if (addRes.status !== 200) {
    console.log(`  addProducts oväntat svar (${addRes.status}): ${await bodyPreview(addRes)}`);
    return { pass: false, addStatus: addRes.status, verifyStatus: null, codeFormat: null };
  }
  const verRes = await fetch(`${BASE}/axfood/rest/cart`, { method: "GET", headers: baseHeaders(creds) });
  let entries = [];
  if (verRes.status === 200) {
    try { const d = JSON.parse(await verRes.text()); entries = d.entries || d.products || []; } catch { /* ej JSON */ }
  }
  const landed = entries.some((e) => JSON.stringify(e).includes(code.split("_")[0]));
  const codeFormat = /_(st|kg)$/i.test(code) ? "matchar <id>_ST/_KG" : `avviker: "${code}"`;
  return { pass: landed, addStatus: addRes.status, verifyStatus: verRes.status, codeFormat };
}
```

- [ ] **Step 2: Fyll ut `main()` med körning + PASS/FAIL-tabell**

Ersätt `main()`-kroppen (raderna från `const creds` t.o.m. probe-kommentaren) med:

```js
async function main() {
  const creds = await loadCreds();
  const term = process.argv[2] || "mjölk";
  console.log(`Hemköp-PoC mot ${BASE} (store ${creds.storeId}, sökterm "${term}")\n`);

  const rows = [];

  const pre = await probePreflight(creds);
  rows.push(["2. Auth (preflight GET /cart)", pre.pass, `status ${pre.status}`]);

  const search = await probeSearch(creds, term);
  rows.push(["4a. Sök (GET /search)", search.pass, `status ${search.status}, kod ${search.code || "—"}`]);

  const offers = await probeOffers(creds);
  rows.push(["4b. Erbjudanden (campaigns)", offers.pass, `status ${offers.status}, antal ${offers.count}`]);

  let addRow;
  if (search.code) {
    const av = await probeAddAndVerify(creds, search.code);
    rows.push(["1. Korg (POST addProducts)", av.addStatus === 200, `addStatus ${av.addStatus}`]);
    rows.push(["3. Verify + kods-format", av.pass, `verify ${av.verifyStatus ?? "—"}, ${av.codeFormat}`]);
  } else {
    rows.push(["1. Korg (POST addProducts)", false, "hoppad — ingen kod från sök"]);
    rows.push(["3. Verify + kods-format", false, "hoppad — ingen kod från sök"]);
  }

  console.log("\n─── Sammanfattning ───");
  for (const [label, pass, detail] of rows) {
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}  (${detail})`);
  }
  const allPass = rows.every(([, pass]) => pass);
  console.log(`\n${allPass ? "ALLA PASS — Hemköp-dispatch genomförbar." : "DELVIS/FAIL — se rader ovan + loggade rå-svar."}`);
}
```

- [ ] **Step 3: Syntaxkoll**

Run: `node --check scripts/hemkop-cart-poc.mjs`
Expected: ingen utskrift.

- [ ] **Step 4: Smoke-test att probe-grenen utan kod inte kraschar**

Skapa tillfälligt en dummy-creds-fil och kör (probes failar mot 401/redirect, men skriptet ska inte krascha — det ska skriva en FAIL-tabell):

```bash
echo '{"cookie":"x=1","csrf":"dummy","storeId":"9999"}' > scripts/.hemkop-cookies.local
node scripts/hemkop-cart-poc.mjs
```

Expected: skriptet kör klart utan stack-trace och skriver `─── Sammanfattning ───` med PASS/FAIL-rader (sannolikt mest FAIL mot dummy-auth). Ta sedan bort dummy-filen: `rm scripts/.hemkop-cookies.local`

- [ ] **Step 5: Commit**

```bash
git add scripts/hemkop-cart-poc.mjs
git commit -m "poc(hemkop): fyra probes + PASS/FAIL-sammanfattning"
```

---

### Task 3: Skarp live-körning + dokumentera utfall

**Files:**
- Create (av användaren, ej committad): `scripts/.hemkop-cookies.local`
- Modify: `Receptbok/CLAUDE.md` (Roadmap Fas 4 + ev. *Öppna utredningar*)

**Interfaces:**
- Consumes: hela skriptet från Task 1–2.

- [ ] **Step 1: Användaren skapar cred-filen**

Användaren följer devtools-proceduren (spec rad: "Cookie- & butiks-input") och skapar `scripts/.hemkop-cookies.local`:

```json
{ "cookie": "<full cookie-sträng från hemkop.se>", "csrf": "<x-csrf-token>", "storeId": "<Hemköp-butiks-ID>" }
```

*Detta steg kan inte göras av en agent — det kräver en inloggad browser-session. Pausa och invänta att användaren bekräftar att filen finns.*

- [ ] **Step 2: Verifiera att filen inte är trackad**

Run: `git status --short scripts/`
Expected: `.hemkop-cookies.local` syns INTE (gitignore från Task 1 håller). Om den syns — stoppa, fixa gitignore innan körning.

- [ ] **Step 3: Skarp körning**

Run: `node scripts/hemkop-cart-poc.mjs mjölk`
Expected: en `─── Sammanfattning ───`-tabell med fyra PASS/FAIL-rader. Spara terminal-utskriften — den är beviset.

- [ ] **Step 4: Tolka utfallet**

- **Alla PASS** → Hemköp-dispatch genomförbar med minimal lyft. Nästa steg: egen spec för bas-URL-parametriserade Axfood-klienter + parallell "Skicka till Hemköp"-knapp.
- **Delvis PASS** → notera exakt vilka probes failade och vilka rå-svar som loggades (avvikande endpoint/form). Nästa spec begränsas till de delarna.
- **Auth FAIL (rad 2)** → Hemköp skyddar korgen annorlunda; överväg Playwright-väg eller lägg ner.

- [ ] **Step 5: Dokumentera i CLAUDE.md**

Lägg en kort notis under Roadmap **Fas 4** (och, vid delvis/FAIL, en punkt i *Öppna utredningar*) med utfallet och PASS/FAIL-raderna. Lägg INTE till en ny Dashboard-checkbox för en feature — det görs först när en Hemköp-feature beslutas. Följ projektets Definition of Done (läs tillbaka, arkivera föregående session vid behov).

- [ ] **Step 6: Commit**

```bash
git add Receptbok/CLAUDE.md
git commit -m "docs(hemkop): PoC-utfall + nästa-steg-beslut"
```

---

## Self-Review

**Spec coverage:**
- "Vad PoC:n ska bekräfta" (4 punkter) → Task 2 probes (preflight=2, search/offers=4, addProducts+verify=1+3). ✓
- "Fristående skript / ingen import från api/" → Task 1 Step 3, ingen import. ✓
- "Manuellt klistrade cookies / gitignorerad fil" → Task 1 Steps 1–2, Task 3 Step 1–2. ✓
- "Endpoint-upptäckt inbyggd (logga rå svar)" → `bodyPreview()` + loggning i varje probe. ✓
- "Read-then-write-then-verify, ingen checkout/tömning" → `probeAddAndVerify` lägger qty 1, läser tillbaka, rör ej checkout. ✓
- "PASS/FAIL-tabell till stdout" → Task 2 Step 2. ✓
- ".gitignore utökas" → Task 1 Step 1. ✓
- "Resultat skrivs i CLAUDE.md, ingen ny roadmap-checkbox" → Task 3 Step 5. ✓

**Placeholder scan:** Ingen TBD/TODO; all kod är komplett och körbar. ✓

**Type consistency:** `loadCreds()` → `{cookie, csrf, storeId}` används konsekvent i alla probes via `creds`. Probe-returvärden (`pass`, `status`, `code`, `count`, `addStatus`, `verifyStatus`, `codeFormat`) matchar hur `main()` läser dem. ✓
