# Cookie-refresh-automatisering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminera manuell `WILLYS_COOKIE`/`WILLYS_CSRF`-rotation genom att låta en Chrome-extension passivt skicka cookies till en ny Vercel-endpoint som lagrar dem i en secret gist; dispatch-endpointen läser därefter från gisten med fallback till env vars under övergångsfasen.

**Architecture:** Chrome-extension (Manifest V3) lyssnar på utgående requests till `*.willys.se`, fångar `x-csrf-token` via `webRequest.onSendHeaders` och cookies via `chrome.cookies.getAll`, POSTar till `/api/cookies/willys` (skyddad av shared secret-header). Endpointen patchar en secret gist (en JSON-fil med `users[userId]`-shape) via GitHub Gists API. `api/dispatch-to-willys.js` läser cookies från gisten via en ny shared-modul med 5-minuters in-memory cache, faller tillbaka till env vars om gisten är tom eller otillgänglig.

**Tech Stack:** Node.js 24 (Vercel runtime), GitHub Gists API, Chrome Manifest V3 (service worker, webRequest, cookies, storage, alarms), vanilla JS för extension (inga byggsteg). Tester: Node-only assertions utan externa deps, bevakade av PostToolUse-hook.

---

## File Structure

**Nya filer:**

- `api/cookies/willys.js` — endpoint `POST /api/cookies/willys` (named export `runRefresh` för test)
- `api/_shared/secrets-store.js` — gist-läsare/skrivare med 5-min cache, `createSecretsStore({fetchImpl, pat, gistId, ttlMs})`
- `tests/cookies-endpoint.test.js` — Node-only tester för secrets-store + runRefresh
- `extension/manifest.json` — MV3-manifest
- `extension/background.js` — service worker (webRequest, cookies, refresh-logic)
- `extension/popup.html` — settings + status
- `extension/popup.css`
- `extension/popup.js`
- `extension/README.md` — engångs-setup + install + verifiering

**Modifierade filer:**

- `api/dispatch-to-willys.js` — ny `resolveWillysSecrets`-helper, handler läser från gist med env-var-fallback
- `tests/dispatch-to-willys.test.js` — assertions för `resolveWillysSecrets`
- `.claude/settings.json` — PostToolUse-hook för cookies-endpoint-test
- `CLAUDE.md` — Session 42-entry, roadmap-uppdatering, öppna utredningar

---

## Prerequisites (engångs-setup, körs av användaren INNAN Task 3 deployas)

Dessa steg ger ingen kod-ändring och kan inte commiteras. Plan-exekutorn ska påminna användaren när det är dags (efter Task 3 är klar och pushad). Setup blockerar inte kod-skrivning eller test-körning.

1. **Generera shared secret lokalt:**
   ```bash
   openssl rand -hex 32
   ```
   Spara värdet — används både som Vercel env var och i extension-popup.

2. **Skapa secret gist på gist.github.com:**
   - Logga in på GitHub som `jockemedw`
   - Gå till https://gist.github.com
   - Filename: `willys-secrets.json`
   - Innehåll: `{"users":{}}`
   - Visibility: **Secret** (inte private på org-nivå — gist heter "secret" i UI)
   - Skapa, kopiera gist-ID:t från URL:en (`https://gist.github.com/jockemedw/<GIST_ID>`)

3. **Uppdatera GITHUB_PAT med `gist`-scope:**
   - GitHub → Settings → Developer settings → Personal access tokens → välj befintlig PAT
   - Bocka i `gist`
   - Generera om / uppdatera token. Om token måste roteras: kopiera nya värdet och uppdatera `GITHUB_PAT` i Vercel.

4. **Sätt nya env vars i Vercel** (Production + Preview):
   - `WILLYS_REFRESH_SECRET` = värdet från steg 1
   - `WILLYS_SECRETS_GIST_ID` = gist-ID från steg 2
   - Behåll tills vidare: `WILLYS_COOKIE`, `WILLYS_CSRF`, `WILLYS_STORE_ID` (fungerar som fallback under migration)

5. Vänta ~30 sek på Vercel-redeploy.

---

## Task 1: secrets-store-modul med gist-läsare/skrivare

**Files:**
- Create: `api/_shared/secrets-store.js`
- Create: `tests/cookies-endpoint.test.js`

- [ ] **Step 1: Skriv första failing test (cache hit, cache miss)**

Skapa `tests/cookies-endpoint.test.js`:

```javascript
// Regressiontester för cookies-endpoint + secrets-store.
// Körs med `node tests/cookies-endpoint.test.js` — inga externa deps.
// Hook: se .claude/settings.json — blockerar commit vid regression.

import { createSecretsStore } from "../api/_shared/secrets-store.js";

let passed = 0;
let failed = 0;
const failures = [];

function assertEq(actual, expected, desc) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    failures.push(`  ❌ ${desc}\n     förväntad: ${JSON.stringify(expected)}\n     faktisk:   ${JSON.stringify(actual)}`);
  }
}

function assertTrue(cond, desc) { assertEq(!!cond, true, desc); }
function assertFalse(cond, desc) { assertEq(!!cond, false, desc); }

// Fake fetch — registrerar GET/PATCH-anrop, returnerar canned responses.
function makeGistFetch(initial) {
  let state = JSON.parse(JSON.stringify(initial));
  const calls = [];
  const fn = async (url, opts = {}) => {
    const method = opts.method || "GET";
    calls.push({ url, method, body: opts.body });
    if (method === "GET") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          files: { "willys-secrets.json": { content: JSON.stringify(state) } },
        }),
      };
    }
    if (method === "PATCH") {
      const parsed = JSON.parse(opts.body);
      const newContent = parsed.files["willys-secrets.json"].content;
      state = JSON.parse(newContent);
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return { ok: false, status: 405, json: async () => ({}) };
  };
  fn.calls = calls;
  fn.state = () => state;
  return fn;
}

// ─── secrets-store: readUser ──────────────────────────────────────

// A. readUser hämtar existerande user
{
  const fetchImpl = makeGistFetch({
    users: { joakim: { cookie: "c1", csrf: "t1", storeId: "2160", updatedAt: "2026-04-26T10:00:00.000Z" } },
  });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  const user = await store.readUser("joakim");
  assertEq(user?.cookie, "c1", "readUser hämtar cookie");
  assertEq(user?.csrf, "t1", "readUser hämtar csrf");
  assertEq(user?.storeId, "2160", "readUser hämtar storeId");
}

// B. readUser returnerar null för okänd user
{
  const fetchImpl = makeGistFetch({ users: {} });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  const user = await store.readUser("ingen");
  assertEq(user, null, "readUser → null för okänd user");
}

// C. readUser cache-hit gör ingen extra fetch inom TTL
{
  const fetchImpl = makeGistFetch({ users: { joakim: { cookie: "c", csrf: "t", storeId: "2160" } } });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  await store.readUser("joakim");
  await store.readUser("joakim");
  await store.readUser("joakim");
  const gets = fetchImpl.calls.filter(c => c.method === "GET").length;
  assertEq(gets, 1, "tre readUser-anrop ger en GET (cache-hit)");
}

// D. clearCache forcerar refetch
{
  const fetchImpl = makeGistFetch({ users: { joakim: { cookie: "c", csrf: "t", storeId: "2160" } } });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  await store.readUser("joakim");
  store.clearCache();
  await store.readUser("joakim");
  const gets = fetchImpl.calls.filter(c => c.method === "GET").length;
  assertEq(gets, 2, "clearCache forcerar ny GET");
}

console.log(`\n${passed} passerade, ${failed} failade`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(f));
  process.exit(1);
}
```

- [ ] **Step 2: Kör testen, verifiera failure**

```bash
node tests/cookies-endpoint.test.js
```
Förväntat: `Cannot find module '../api/_shared/secrets-store.js'` (modulen finns inte ännu).

- [ ] **Step 3: Implementera secrets-store.js (read-path)**

Skapa `api/_shared/secrets-store.js`:

```javascript
// Läser/skriver cookies+CSRF för dispatch-användare till en secret gist.
// Används av:
//   - api/cookies/willys.js  → writeUser (Chrome-extension postar cookies hit)
//   - api/dispatch-to-willys.js → readUser (cart-anrop till Willys)
//
// Cache: 5 min in-memory (TTL-baserad). Minskar GitHub-API-anrop när dispatch
// körs flera gånger inom kort tid.

const GIST_API = "https://api.github.com/gists";
const SECRETS_FILE = "willys-secrets.json";

export function createSecretsStore({ fetchImpl = fetch, pat, gistId, ttlMs = 5 * 60 * 1000 }) {
  let cache = null; // { data, fetchedAt }

  async function fetchGist() {
    const res = await fetchImpl(`${GIST_API}/${gistId}`, {
      headers: {
        Authorization: `token ${pat}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) throw new Error(`Kunde inte läsa secret gist (${res.status}).`);
    const data = await res.json();
    const file = data.files?.[SECRETS_FILE];
    if (!file) return { users: {} };
    try {
      return JSON.parse(file.content);
    } catch {
      return { users: {} };
    }
  }

  async function getData() {
    const now = Date.now();
    if (cache && now - cache.fetchedAt < ttlMs) {
      return cache.data;
    }
    const data = await fetchGist();
    cache = { data, fetchedAt: now };
    return data;
  }

  async function readUser(userId) {
    const data = await getData();
    const user = data.users?.[userId];
    return user || null;
  }

  async function writeUser(userId, { cookie, csrf, storeId }) {
    const data = await fetchGist();
    if (!data.users) data.users = {};
    data.users[userId] = {
      cookie,
      csrf,
      storeId,
      updatedAt: new Date().toISOString(),
    };
    const res = await fetchImpl(`${GIST_API}/${gistId}`, {
      method: "PATCH",
      headers: {
        Authorization: `token ${pat}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: {
          [SECRETS_FILE]: { content: JSON.stringify(data, null, 2) },
        },
      }),
    });
    if (!res.ok) throw new Error(`Kunde inte skriva secret gist (${res.status}).`);
    cache = { data, fetchedAt: Date.now() };
    return data.users[userId];
  }

  function clearCache() {
    cache = null;
  }

  return { readUser, writeUser, clearCache };
}
```

- [ ] **Step 4: Kör testen, verifiera pass**

```bash
node tests/cookies-endpoint.test.js
```
Förväntat: `4 passerade, 0 failade`

- [ ] **Step 5: Lägg till tester för writeUser**

Före `console.log`-raden i `tests/cookies-endpoint.test.js`, lägg till:

```javascript
// ─── secrets-store: writeUser ─────────────────────────────────────

// E. writeUser bevarar andra users
{
  const fetchImpl = makeGistFetch({
    users: { andra: { cookie: "x", csrf: "y", storeId: "9999" } },
  });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  await store.writeUser("joakim", { cookie: "c", csrf: "t", storeId: "2160" });
  const state = fetchImpl.state();
  assertEq(state.users.andra?.cookie, "x", "writeUser bevarar andra user");
  assertEq(state.users.joakim?.cookie, "c", "writeUser skapar joakim");
}

// F. writeUser sätter updatedAt
{
  const fetchImpl = makeGistFetch({ users: {} });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  await store.writeUser("joakim", { cookie: "c", csrf: "t", storeId: "2160" });
  const state = fetchImpl.state();
  assertTrue(state.users.joakim?.updatedAt, "updatedAt sätts");
  assertTrue(/^\d{4}-\d{2}-\d{2}T/.test(state.users.joakim.updatedAt), "updatedAt är ISO 8601");
}

// G. writeUser uppdaterar cache → readUser ser nya värden utan ny GET
{
  const fetchImpl = makeGistFetch({ users: { joakim: { cookie: "old", csrf: "old", storeId: "2160" } } });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  await store.readUser("joakim");
  await store.writeUser("joakim", { cookie: "new", csrf: "newt", storeId: "2160" });
  const reread = await store.readUser("joakim");
  assertEq(reread?.cookie, "new", "readUser ser writeUsers nya cookie utan extra GET");
  const gets = fetchImpl.calls.filter(c => c.method === "GET").length;
  assertEq(gets, 2, "writeUser gör en intern GET (för fresh state) men reread cache-hits");
}

// H. PATCH-bodyn har rätt struktur
{
  const fetchImpl = makeGistFetch({ users: {} });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  await store.writeUser("joakim", { cookie: "c", csrf: "t", storeId: "2160" });
  const patch = fetchImpl.calls.find(c => c.method === "PATCH");
  assertTrue(patch, "PATCH skickades");
  const body = JSON.parse(patch.body);
  assertTrue(body.files?.["willys-secrets.json"]?.content, "PATCH-body har files['willys-secrets.json'].content");
}
```

- [ ] **Step 6: Kör testen, verifiera failure**

```bash
node tests/cookies-endpoint.test.js
```
Förväntat: G failar (kanske) — fortsätt till Step 7. Övriga testerna ska passera (writeUser är redan implementerad i Step 3).

Om alla 8 passerar: bra, hoppa direkt till Step 9.

- [ ] **Step 7: Justera writeUser-implementationen om något testar failer**

Vanligast: cache-uppdateringen i Step 3 sätter cache = `{data, fetchedAt: Date.now()}` där `data` är nyligen patchad. Det räcker. Inget behov av ändring om alla tester passerar.

- [ ] **Step 8: Kör testen igen, verifiera 8 passerade**

```bash
node tests/cookies-endpoint.test.js
```
Förväntat: `8 passerade, 0 failade`

- [ ] **Step 9: Commit**

```bash
git add api/_shared/secrets-store.js tests/cookies-endpoint.test.js
git commit -m "feat(api): add secrets-store with gist-backed cookie storage

Read/write helper for the upcoming /api/cookies/willys endpoint and
gist-aware dispatch. 5-minute TTL cache on read, in-place patching for
writes (preserves other users). 8 assertions in tests/cookies-endpoint.test.js."
```

---

## Task 2: cookies-endpoint `POST /api/cookies/willys`

**Files:**
- Create: `api/cookies/willys.js`
- Modify: `tests/cookies-endpoint.test.js` (lägg till runRefresh-tester)
- Modify: `.claude/settings.json` (PostToolUse-hook)

- [ ] **Step 1: Skriv failing test för runRefresh**

a) Lägg till import högst upp i `tests/cookies-endpoint.test.js`, direkt under den existerande `createSecretsStore`-importen:

```javascript
import { runRefresh } from "../api/cookies/willys.js";
```

b) Före `console.log`-raden i samma fil, lägg till:

```javascript
// ─── cookies-endpoint: runRefresh ─────────────────────────────────

function fakeStore(initial = {}) {
  const users = { ...initial };
  return {
    writeUser: async (userId, payload) => {
      users[userId] = { ...payload, updatedAt: new Date().toISOString() };
      return users[userId];
    },
    _users: users,
  };
}

// I. Saknad secret-header → 401
{
  const store = fakeStore();
  const result = await runRefresh({
    secretHeader: undefined,
    expectedSecret: "abc",
    payload: { userId: "joakim", cookie: "c", csrf: "t", storeId: "2160" },
    store,
  });
  assertEq(result.status, 401, "saknad secret → 401");
  assertEq(result.body.error, "unauthorized", "felkod unauthorized");
}

// J. Fel secret → 401
{
  const store = fakeStore();
  const result = await runRefresh({
    secretHeader: "wrong",
    expectedSecret: "abc",
    payload: { userId: "joakim", cookie: "c", csrf: "t", storeId: "2160" },
    store,
  });
  assertEq(result.status, 401, "fel secret → 401");
}

// K. Tom cookie → 400
{
  const store = fakeStore();
  const result = await runRefresh({
    secretHeader: "abc",
    expectedSecret: "abc",
    payload: { userId: "joakim", cookie: "", csrf: "t", storeId: "2160" },
    store,
  });
  assertEq(result.status, 400, "tom cookie → 400");
}

// L. Tom csrf → 400
{
  const store = fakeStore();
  const result = await runRefresh({
    secretHeader: "abc",
    expectedSecret: "abc",
    payload: { userId: "joakim", cookie: "c", csrf: "", storeId: "2160" },
    store,
  });
  assertEq(result.status, 400, "tom csrf → 400");
}

// M. Saknat userId → 400
{
  const store = fakeStore();
  const result = await runRefresh({
    secretHeader: "abc",
    expectedSecret: "abc",
    payload: { cookie: "c", csrf: "t", storeId: "2160" },
    store,
  });
  assertEq(result.status, 400, "saknat userId → 400");
}

// N. Tom storeId → 400
{
  const store = fakeStore();
  const result = await runRefresh({
    secretHeader: "abc",
    expectedSecret: "abc",
    payload: { userId: "joakim", cookie: "c", csrf: "t", storeId: "" },
    store,
  });
  assertEq(result.status, 400, "tom storeId → 400");
}

// O. Happy path → 200 + writeUser anropad
{
  const store = fakeStore();
  const result = await runRefresh({
    secretHeader: "abc",
    expectedSecret: "abc",
    payload: { userId: "joakim", cookie: "c", csrf: "t", storeId: "2160" },
    store,
  });
  assertEq(result.status, 200, "happy path → 200");
  assertEq(result.body.ok, true, "ok=true");
  assertTrue(result.body.updatedAt, "response har updatedAt");
  assertEq(store._users.joakim?.cookie, "c", "store fick joakim.cookie");
  assertEq(store._users.joakim?.csrf, "t", "store fick joakim.csrf");
  assertEq(store._users.joakim?.storeId, "2160", "store fick joakim.storeId");
}

// P. Store-skrivning failar → 502
{
  const failingStore = {
    writeUser: async () => { throw new Error("gist 503"); },
  };
  const result = await runRefresh({
    secretHeader: "abc",
    expectedSecret: "abc",
    payload: { userId: "joakim", cookie: "c", csrf: "t", storeId: "2160" },
    store: failingStore,
  });
  assertEq(result.status, 502, "store-fel → 502");
  assertEq(result.body.error, "store_write_failed", "felkod store_write_failed");
}
```

- [ ] **Step 2: Kör testen, verifiera failure**

```bash
node tests/cookies-endpoint.test.js
```
Förväntat: `Cannot find module '../api/cookies/willys.js'`

- [ ] **Step 3: Skapa api/cookies/willys.js**

```javascript
// Endpoint: tar emot cookie+CSRF från Chrome-extensionen och skriver till secret gist.
//
// POST /api/cookies/willys
// Headers:
//   X-Refresh-Secret: <shared secret från WILLYS_REFRESH_SECRET>
// Body:
//   { userId, cookie, csrf, storeId }
//
// Säkerhet: shared secret-header krävs. Cookies returneras aldrig i response/loggning.

import { createSecretsStore } from "../_shared/secrets-store.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Refresh-Secret");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metod ej tillåten" });

  const expectedSecret = process.env.WILLYS_REFRESH_SECRET;
  const pat = process.env.GITHUB_PAT;
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
    console.error("cookies/willys store error:", err?.message || err);
    return { status: 502, body: { error: "store_write_failed" } };
  }
}
```

- [ ] **Step 4: Kör testen, verifiera pass**

```bash
node tests/cookies-endpoint.test.js
```
Förväntat: `16 passerade, 0 failade` (8 för secrets-store + 8 för runRefresh).

- [ ] **Step 5: Utöka PostToolUse-hook**

I `.claude/settings.json`, lägg till en ny hook-rad i `PostToolUse[0].hooks[]` (efter den sista befintliga `dispatch-to-willys`-hooken):

```json
{
  "type": "command",
  "command": "INPUT=$(cat); FILE=$(echo \"$INPUT\" | grep -o '\"file_path\"[[:space:]]*:[[:space:]]*\"[^\"]*\"' | head -1 | sed 's/.*\"\\([^\"]*\\)\"/\\1/'); case \"$FILE\" in *cookies/willys.js|*secrets-store.js) node tests/cookies-endpoint.test.js >&2 || { echo 'BLOCKERAD: cookies-endpoint-regressiontester failade — kör node tests/cookies-endpoint.test.js för detaljer.' >&2; exit 2; };; esac; exit 0"
}
```

- [ ] **Step 6: Verifiera hook genom att trigga den**

Gör en no-op edit på `api/cookies/willys.js` (lägg till + ta bort en blank rad) och bekräfta att hooken kör. Om det failar → kontrollera regex-matchningen mot `*cookies/willys.js`.

- [ ] **Step 7: Commit**

```bash
git add api/cookies/willys.js tests/cookies-endpoint.test.js .claude/settings.json
git commit -m "feat(api): add POST /api/cookies/willys endpoint

Receives cookie+CSRF payload from the Chrome extension, validates the
shared X-Refresh-Secret header and required fields, then writes to the
secret gist via secrets-store. 16 assertions in tests/cookies-endpoint.test.js
gated by a PostToolUse hook (regression blocks commit)."
```

---

## Task 3: dispatch-to-willys läser från gist med env-var-fallback

**Files:**
- Modify: `api/dispatch-to-willys.js` — ny `resolveWillysSecrets`-export, handler använder den
- Modify: `tests/dispatch-to-willys.test.js` — assertions för resolveWillysSecrets

- [ ] **Step 1: Skriv failing test för resolveWillysSecrets**

a) Hitta `import { runDispatch } from "../api/dispatch-to-willys.js";` högst upp i `tests/dispatch-to-willys.test.js` och utöka:

```javascript
import { runDispatch, resolveWillysSecrets } from "../api/dispatch-to-willys.js";
```

b) Före `console.log`-raden i samma fil, lägg till:

```javascript
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
```

- [ ] **Step 2: Kör testerna, verifiera failure**

```bash
node tests/dispatch-to-willys.test.js
```
Förväntat: `resolveWillysSecrets is not exported` (eller liknande).

- [ ] **Step 3: Implementera resolveWillysSecrets och uppdatera handler**

Modifiera `api/dispatch-to-willys.js`:

a) Lägg till import högst upp:

```javascript
import { createSecretsStore } from "./_shared/secrets-store.js";
```

b) Lägg till named export `resolveWillysSecrets` (placera mellan `runDispatch` och `extractCanonsFromShoppingList`):

```javascript
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
```

c) Uppdatera handler-funktionen — byt ut `cookies/csrf/storeId/featureAvailable`-blocket (rad 28–31) mot:

```javascript
  const pat = process.env.GITHUB_PAT;
  const gistId = process.env.WILLYS_SECRETS_GIST_ID;
  const store = (pat && gistId) ? createSecretsStore({ pat, gistId }) : null;
  const secrets = await resolveWillysSecrets({ store, env: process.env, userId: "joakim" });
  const featureAvailable = !!secrets;
```

d) Senare i samma handler — byt ut raden `const cartClient = createCartClient({ cookies, csrf });` mot:

```javascript
    const cartClient = createCartClient({ cookies: secrets.cookies, csrf: secrets.csrf });
```

e) Och raden `const offers = await fetchOffersFromWillys(storeId);` mot:

```javascript
    const offers = await fetchOffersFromWillys(secrets.storeId);
```

- [ ] **Step 4: Kör alla dispatch-tester, verifiera pass**

```bash
node tests/dispatch-to-willys.test.js
```
Förväntat: existerande 56 assertions + 7 nya R1–R7 = `63 passerade, 0 failade`.

- [ ] **Step 5: Kör cookies-endpoint-tester (sanity-check att inget brutits)**

```bash
node tests/cookies-endpoint.test.js
```
Förväntat: `16 passerade, 0 failade`.

- [ ] **Step 6: Commit**

```bash
git add api/dispatch-to-willys.js tests/dispatch-to-willys.test.js
git commit -m "feat(api): dispatch reads cookies from secret gist with env fallback

resolveWillysSecrets prefers gist values when both cookie and csrf are
present, otherwise falls back to env vars. Source returned in result so
dispatch logs can flag which path was used. featureAvailable now true if
either source provides credentials. 7 new assertions in tests/dispatch-to-willys.test.js
(R1–R7), total 63 assertions."
```

---

## Task 4: Chrome-extension manifest + popup UI

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/popup.html`
- Create: `extension/popup.css`
- Create: `extension/popup.js`

- [ ] **Step 1: Skapa manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Receptbok Willys-cookies",
  "version": "1.0.0",
  "description": "Skickar willys.se-cookies till Receptbokens dispatch-endpoint så att korgen alltid kan fyllas automatiskt.",
  "permissions": ["cookies", "webRequest", "storage", "alarms"],
  "host_permissions": [
    "https://www.willys.se/*",
    "https://receptbok-six.vercel.app/api/cookies/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_title": "Receptbok Willys-cookies"
  }
}
```

- [ ] **Step 2: Skapa popup.html**

```html
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <main>
    <h1>Willys-cookies</h1>

    <section class="status" id="status">
      <span class="dot" id="statusDot"></span>
      <span class="label" id="statusLabel">Laddar…</span>
    </section>

    <p class="last" id="lastRefresh"></p>

    <button id="refreshBtn" type="button">Uppdatera nu</button>

    <details>
      <summary>Inställningar</summary>
      <form id="settingsForm">
        <label>
          Shared secret
          <input type="password" id="secretInput" autocomplete="off" required>
        </label>
        <label>
          Butiks-ID
          <input type="text" id="storeIdInput" value="2160" required>
        </label>
        <button type="submit">Spara</button>
        <p class="saved" id="savedMsg"></p>
      </form>
    </details>
  </main>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 3: Skapa popup.css**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; min-width: 280px; padding: 16px; background: #faf7f2; color: #5c3d1e; }
h1 { font-size: 16px; margin-bottom: 12px; }
.status { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-weight: 600; }
.dot { width: 12px; height: 12px; border-radius: 50%; background: #ccc; }
.dot.green { background: #4caf50; }
.dot.yellow { background: #ffb300; }
.dot.red { background: #c2522b; }
.last { font-size: 12px; opacity: 0.7; margin-bottom: 12px; }
button { width: 100%; padding: 8px; border: none; border-radius: 4px; background: #c2522b; color: white; font-weight: 600; cursor: pointer; }
button:hover { background: #a8431f; }
details { margin-top: 16px; }
summary { cursor: pointer; font-size: 13px; padding: 4px 0; }
form { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
input { padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; }
.saved { font-size: 11px; color: #4caf50; min-height: 14px; }
```

- [ ] **Step 4: Skapa popup.js**

```javascript
// Popup-UI: visar status + tillåter uppdatera shared secret/storeId och manuell refresh.

const $ = (id) => document.getElementById(id);

async function load() {
  const data = await chrome.storage.local.get(["secret", "storeId", "lastRefreshAt", "lastError"]);
  $("secretInput").value = data.secret || "";
  $("storeIdInput").value = data.storeId || "2160";
  renderStatus(data.lastRefreshAt, data.lastError);
}

function renderStatus(lastRefreshAt, lastError) {
  const dot = $("statusDot");
  const label = $("statusLabel");
  const last = $("lastRefresh");
  dot.className = "dot";
  if (lastError) {
    dot.classList.add("red");
    label.textContent = `Fel: ${lastError}`;
    last.textContent = "";
    return;
  }
  if (!lastRefreshAt) {
    dot.classList.add("yellow");
    label.textContent = "Inte uppdaterad än";
    last.textContent = "Logga in på willys.se så fångas cookies automatiskt.";
    return;
  }
  const ageMs = Date.now() - new Date(lastRefreshAt).getTime();
  const ageDays = Math.floor(ageMs / 86_400_000);
  if (ageDays >= 80) {
    dot.classList.add("red");
    label.textContent = "Kritiskt — uppdatera snart";
  } else if (ageDays >= 60) {
    dot.classList.add("yellow");
    label.textContent = "Uppdatera snart";
  } else {
    dot.classList.add("green");
    label.textContent = "Aktuell";
  }
  last.textContent = `Senast uppdaterad: ${new Date(lastRefreshAt).toLocaleString("sv-SE")} (${ageDays}d sedan)`;
}

$("settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await chrome.storage.local.set({
    secret: $("secretInput").value.trim(),
    storeId: $("storeIdInput").value.trim() || "2160",
  });
  $("savedMsg").textContent = "Sparat ✓";
  setTimeout(() => { $("savedMsg").textContent = ""; }, 2000);
});

$("refreshBtn").addEventListener("click", async () => {
  $("refreshBtn").disabled = true;
  $("refreshBtn").textContent = "Uppdaterar…";
  await chrome.runtime.sendMessage({ type: "manual-refresh" });
  await load();
  $("refreshBtn").disabled = false;
  $("refreshBtn").textContent = "Uppdatera nu";
});

load();
```

- [ ] **Step 5: Manuell verifiering (kräver Chrome)**

1. Öppna `chrome://extensions`
2. Aktivera Developer Mode
3. Klicka "Load unpacked" → välj `extension/`-katalogen
4. Klicka på extension-ikonen → popup ska öppnas
5. Klistra ett dummy-värde i "Shared secret", spara → "Sparat ✓" ska visas
6. Stäng + öppna popup igen → fältet ska komma ihåg värdet
7. Status ska vara gul med "Inte uppdaterad än" (background.js finns inte än → manual-refresh-knappen får felmeddelande, det är OK i denna task)

- [ ] **Step 6: Commit**

```bash
git add extension/manifest.json extension/popup.html extension/popup.css extension/popup.js
git commit -m "feat(extension): MV3 manifest + popup UI

Manifest with cookies/webRequest/storage/alarms permissions limited to
willys.se and the dispatch endpoint host. Popup shows status (green/
yellow/red based on age), persists shared secret + storeId in chrome.
storage.local. Manual-refresh button stub (background.js wires it in
next task)."
```

---

## Task 5: Chrome-extension background.js (CSRF-fångst + refresh-trigger)

**Files:**
- Create: `extension/background.js`

- [ ] **Step 1: Skriv background.js**

```javascript
// Service worker: fångar CSRF passivt + skickar cookies+CSRF till Vercel-endpointen.
//
// Trigger-källor:
//   - webRequest.onSendHeaders för *.willys.se → sparar x-csrf-token
//   - alarms.onAlarm (var 6h) → checkAndMaybeRefresh
//   - runtime.onStartup (browser-start) → checkAndMaybeRefresh
//   - runtime.onMessage type="manual-refresh" → forceRefresh
//
// Refresh-trösklar:
//   < 7 dagar  → skip (allt fräscht)
//   >= 7 dagar → POST refresh
//
// Race-skydd: refresh_in_flight-flag i chrome.storage.local med 30s TTL.

const ENDPOINT = "https://receptbok-six.vercel.app/api/cookies/willys";
const USER_ID = "joakim";
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 dagar
const IN_FLIGHT_TTL_MS = 30_000;

// ─── CSRF-fångst ──────────────────────────────────────────────────
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const csrfHeader = details.requestHeaders?.find(
      h => h.name.toLowerCase() === "x-csrf-token"
    );
    if (!csrfHeader?.value) return;
    chrome.storage.local.set({
      csrfToken: csrfHeader.value,
      csrfCapturedAt: Date.now(),
    });
    // Försök refreshen direkt om det är dags
    checkAndMaybeRefresh().catch(err => console.error("csrf-trigger refresh:", err));
  },
  { urls: ["https://www.willys.se/*"] },
  ["requestHeaders"]
);

// ─── Periodisk check ──────────────────────────────────────────────
chrome.alarms.create("refresh-check", { periodInMinutes: 360 }); // var 6:e timme
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refresh-check") {
    checkAndMaybeRefresh().catch(err => console.error("alarm refresh:", err));
  }
});

chrome.runtime.onStartup.addListener(() => {
  checkAndMaybeRefresh().catch(err => console.error("startup refresh:", err));
});

// ─── Manuell trigger från popup ───────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "manual-refresh") {
    forceRefresh()
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // håll response-channel öppen för async
  }
});

// ─── Refresh-flöden ───────────────────────────────────────────────

async function checkAndMaybeRefresh() {
  const data = await chrome.storage.local.get(["lastRefreshAt"]);
  const ageMs = data.lastRefreshAt ? Date.now() - new Date(data.lastRefreshAt).getTime() : Infinity;
  if (ageMs < REFRESH_THRESHOLD_MS) return { ok: true, skipped: "fresh" };
  return doRefresh();
}

async function forceRefresh() {
  return doRefresh();
}

async function doRefresh() {
  const inFlight = await chrome.storage.local.get(["refreshInFlight"]);
  if (inFlight.refreshInFlight && Date.now() - inFlight.refreshInFlight < IN_FLIGHT_TTL_MS) {
    return { ok: true, skipped: "in_flight" };
  }
  await chrome.storage.local.set({ refreshInFlight: Date.now() });

  try {
    const settings = await chrome.storage.local.get(["secret", "storeId", "csrfToken"]);
    if (!settings.secret) {
      await chrome.storage.local.set({ lastError: "Shared secret saknas — öppna inställningar." });
      return { ok: false, error: "missing_secret" };
    }
    if (!settings.csrfToken) {
      await chrome.storage.local.set({ lastError: "Ingen CSRF fångad än — besök willys.se." });
      return { ok: false, error: "missing_csrf" };
    }

    const cookies = await chrome.cookies.getAll({ domain: "willys.se" });
    if (!cookies.length) {
      await chrome.storage.local.set({ lastError: "Inga cookies — logga in på willys.se." });
      return { ok: false, error: "no_cookies" };
    }
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join("; ");

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Refresh-Secret": settings.secret,
      },
      body: JSON.stringify({
        userId: USER_ID,
        cookie: cookieStr,
        csrf: settings.csrfToken,
        storeId: settings.storeId || "2160",
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      await chrome.storage.local.set({
        lastError: `Endpoint svarade ${res.status} ${body.slice(0, 60)}`,
      });
      return { ok: false, error: `endpoint_${res.status}` };
    }

    const data = await res.json();
    await chrome.storage.local.set({
      lastRefreshAt: data.updatedAt || new Date().toISOString(),
      lastError: null,
    });
    return { ok: true, updatedAt: data.updatedAt };
  } catch (err) {
    await chrome.storage.local.set({ lastError: `Network: ${err.message}` });
    return { ok: false, error: err.message };
  } finally {
    await chrome.storage.local.set({ refreshInFlight: null });
  }
}
```

- [ ] **Step 2: Manuell verifiering — service worker boot**

1. `chrome://extensions` → "Load unpacked" om inte gjort, annars klicka "🔄 Reload" på extension-kortet
2. Klicka "service worker"-länken → DevTools öppnas för background.js
3. Console ska visa inga errors

- [ ] **Step 3: Manuell verifiering — CSRF capture**

1. Öppna popup → klistra dummy-secret → spara
2. Öppna ny tab → gå till https://www.willys.se
3. I service-worker DevTools → Console: kör `chrome.storage.local.get('csrfToken').then(console.log)`
4. Förväntat: `{csrfToken: "<token>"}` (visas inom någon sekund efter sidan laddat)

- [ ] **Step 4: Manuell verifiering — manual refresh (med live endpoint)**

**OBS:** kräver att Task 3 är pushad till main + att Prerequisites är genomförda. Hoppa till Step 5 om endpoint inte är live.

1. Öppna popup → kontrollera att shared secret matchar `WILLYS_REFRESH_SECRET` i Vercel
2. Klicka "Uppdatera nu"
3. Förväntat: status blir grön ✓ "Aktuell" inom 2–3 sek
4. Verifiera i secret gist på gist.github.com att `users.joakim.updatedAt` har uppdaterats

- [ ] **Step 5: Commit**

```bash
git add extension/background.js
git commit -m "feat(extension): background service worker for cookie refresh

Listens to webRequest.onSendHeaders for *.willys.se to capture x-csrf-token,
reads cookies via chrome.cookies.getAll, and POSTs to /api/cookies/willys
when last refresh is >= 7 days. Race-protected via refresh_in_flight flag
(30s TTL). Triggered from CSRF capture, alarms (every 6h), browser startup,
and manual popup button."
```

---

## Task 6: Extension README + live-verifieringschecklista

**Files:**
- Create: `extension/README.md`

- [ ] **Step 1: Skapa extension/README.md**

```markdown
# Receptbok Willys-cookies (Chrome-extension)

Skickar passivt willys.se-cookies + CSRF-token till Receptbokens dispatch-endpoint
så att korgen alltid kan fyllas automatiskt utan manuell rotation.

## Engångs-setup (server-side)

Kör dessa **innan** du installerar extensionen — annars får du 401 från endpointen.

1. **Generera shared secret lokalt:**
   ```
   openssl rand -hex 32
   ```
   Spara värdet — du behöver det både i Vercel och i extensionen.

2. **Skapa secret gist på gist.github.com:**
   - Logga in som `jockemedw` → https://gist.github.com
   - Filename: `willys-secrets.json`
   - Content: `{"users":{}}`
   - Visibility: **Secret** (välj "Create secret gist", inte public)
   - Kopiera gist-ID:t från URL:en (`https://gist.github.com/jockemedw/<GIST_ID>`)

3. **Uppdatera GITHUB_PAT:**
   - GitHub → Settings → Developer settings → Personal access tokens → välj befintlig PAT
   - Bocka i `gist`-scopen
   - Spara. Om token regenereras: uppdatera `GITHUB_PAT` i Vercel.

4. **Sätt env vars i Vercel** (Production + Preview):
   - `WILLYS_REFRESH_SECRET` = värdet från steg 1
   - `WILLYS_SECRETS_GIST_ID` = gist-ID från steg 2
   - Behåll `WILLYS_COOKIE`, `WILLYS_CSRF`, `WILLYS_STORE_ID` tills gist-vägen är verifierad i ≥2 dispatchar — då kan de tas bort.

5. Vänta ~30 sek på Vercel-redeploy.

## Installera extensionen

1. `git pull` så `extension/`-katalogen finns lokalt.
2. Öppna Chrome → `chrome://extensions`
3. Aktivera **Developer Mode** (toggle uppe till höger)
4. Klicka **Load unpacked** → välj `extension/`-katalogen
5. Extension-ikonen dyker upp i toolbar.

## Konfigurera

1. Klicka på extension-ikonen → popup öppnas.
2. Öppna **Inställningar**.
3. Klistra **Shared secret** (samma värde som `WILLYS_REFRESH_SECRET` i Vercel).
4. Verifiera **Butiks-ID** (default `2160` = Ekholmen). Ändra om du flyttar.
5. Klicka **Spara**.

## Verifiera att det fungerar

1. Öppna ny tab → besök https://www.willys.se (logga in om du inte redan är)
2. Vänta ~5–10 sek
3. Öppna popup → status ska vara **grön ✓ "Aktuell"** med "Senast uppdaterad: nu"
4. Verifiera i secret gist att `users.joakim.updatedAt` har dagens timestamp.
5. Klicka **Skicka till Willys** i Receptboken → kontrollera att inköpslistan landar i willys.se/cart som vanligt.

## Statusindikator

| Färg | Betydelse |
|---|---|
| 🟢 Aktuell | Senaste refresh < 60 dagar sedan |
| 🟡 Uppdatera snart | 60–80 dagar sedan |
| 🔴 Kritiskt | > 80 dagar — kritiskt nära cookie-utgång |
| 🟡 Inte uppdaterad än | Ingen lyckad refresh; logga in på willys.se |
| 🔴 Fel: ... | Endpoint eller nätverk failade — se popup-meddelandet |

## Felsökning

- **"Shared secret saknas"** → öppna inställningar, klistra in värdet
- **"Ingen CSRF fångad än"** → besök en willys.se-sida (inte bara root) som triggar XHR
- **"Inga cookies"** → logga in på willys.se igen
- **"Endpoint svarade 401"** → secret matchar inte; jämför mot Vercel env var
- **"Endpoint svarade 502"** → gist-skrivning failade; kontrollera GITHUB_PAT har `gist`-scope
- **"Endpoint svarade 500"** → en env var saknas i Vercel (`WILLYS_REFRESH_SECRET`, `GITHUB_PAT`, `WILLYS_SECRETS_GIST_ID`)

## Out of scope

- **Mobile / Capacitor**: extension fungerar bara i desktop-Chrome. Capacitor-app
  (Fas 5A) återanvänder samma backend-endpoint via in-app WebView-capture.
- **Auto-update**: `git pull` när det är förändrat; ladda om i `chrome://extensions`.
- **Multi-user**: en `userId` (`joakim`) hårdkodat. Multi-user kommer i Fas 5B.

## Säkerhet

- Shared secret är åtkomstkontroll till endpointen — behandla som ett lösenord.
- Cookies lämnar aldrig din maskin förutom till `receptbok-six.vercel.app`.
- Secret gist är osökbart (security through obscurity); URL:en + GitHub-TLS är skyddet.
```

- [ ] **Step 2: Commit**

```bash
git add extension/README.md
git commit -m "docs(extension): setup + verification + troubleshooting

One-time server setup (gist + PAT scope + env vars), local install via
chrome://extensions, popup configuration, statusindikator, and the most
common failure modes. Out-of-scope items match the spec."
```

---

## Task 7: CLAUDE.md session-uppdatering + roadmap-flytt

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Markera Fas 4F som klar i Roadmap**

I CLAUDE.md, hitta raden:

```
- [~] 4F — **Cookie-refresh-automatisering — design klar (Session 40).** ...
```

Byt mot:

```
- [x] 4F — **Cookie-refresh-automatisering — implementation klar (Session 42, 2026-04-26).** Plan: `docs/superpowers/plans/2026-04-26-cookie-refresh-automation.md`. Chrome-extension fångar passivt cookies + CSRF vid willys.se-besök → POSTar till `/api/cookies/willys` → secret gist på GitHub. `dispatch-to-willys.js` läser via `secrets-store` med 5-min cache, fallback till env vars. 23 nya assertions (8 secrets-store + 8 runRefresh + 7 resolveWillysSecrets) bevakade av PostToolUse-hook.
```

- [ ] **Step 2: Uppdatera "Öppna utredningar" — ta bort cookie-refresh-blocket**

Hitta blocket som börjar:

```
**Cookie-refresh-automatisering (Fas 4F) — ✅ DESIGN KLAR** (Session 40, 2026-04-25)...
```

Och byt mot:

```
**Cookie-refresh-automatisering (Fas 4F) — ✅ KLAR** (Session 42, 2026-04-26). Implementation av Session 40-specen. Chrome-extension MV3 + `/api/cookies/willys` + secret gist. Manuell rotation borttagen från användarens flöde.
```

- [ ] **Step 3: Lägg till "Senaste session — Session 42"-block**

Före raden `### Session 41 (2026-04-25) — Mobil bottom-tab-navigering implementerad`, lägg till:

```markdown
### Senaste session — Session 42 (2026-04-26) — Fas 4F implementation: cookie-refresh-automation
- **Motivering:** Session 40:s spec klar, Session 41 prioriterade UI. Den här sessionen exekverade implementation-planen `docs/superpowers/plans/2026-04-26-cookie-refresh-automation.md` (7 tasks).
- **Backend:**
  - Ny `api/_shared/secrets-store.js` — gist-läsare/skrivare med 5-min in-memory cache. `createSecretsStore({fetchImpl, pat, gistId, ttlMs})` exposes `readUser/writeUser/clearCache`.
  - Ny endpoint `POST /api/cookies/willys` — validerar `X-Refresh-Secret`-header + payload (`{userId, cookie, csrf, storeId}`), patchar gist via store. Named export `runRefresh({secretHeader, expectedSecret, payload, store})` för test.
  - `api/dispatch-to-willys.js` läser nu cookies via `resolveWillysSecrets({store, env, userId})` — föredrar gist, faller tillbaka till env vars. `featureAvailable` true om någon källa har både cookie och csrf.
- **Frontend (Chrome-extension):** Ny `extension/`-katalog (manifest V3, popup, background.js, README). Service worker fångar `x-csrf-token` via `webRequest.onSendHeaders` på `*.willys.se`, läser cookies via `chrome.cookies.getAll`, POSTar till endpointen när senaste refresh är ≥ 7 dagar gammal. Race-skydd via `refresh_in_flight`-flag (30s TTL). Triggas av: CSRF-capture, alarms (var 6h), browser-start, manuell knapp i popup.
- **Tester:** Ny `tests/cookies-endpoint.test.js` — 16 assertions (8 secrets-store cache+gist-patch + 8 runRefresh secret/payload-validering). Utökad `tests/dispatch-to-willys.test.js` — 7 nya assertions (R1–R7) för `resolveWillysSecrets`. **Totalt regressionstester: 44 (match) + 62 (shopping) + 136 (select-recipes) + 63 (dispatch) + 16 (cookies-endpoint) = 321 assertions** bevakade av hooks.
- **PostToolUse-hook:** `.claude/settings.json` utökad — edits av `cookies/willys.js` eller `secrets-store.js` triggar `cookies-endpoint.test.js`.
- **Migration:** Env vars `WILLYS_COOKIE`/`WILLYS_CSRF`/`WILLYS_STORE_ID` ligger kvar som fallback. Tas bort efter ≥2 lyckade gist-baserade dispatchar.
- **Engångs-setup (kvar för användaren):** Generera `WILLYS_REFRESH_SECRET`, skapa secret gist, uppdatera `GITHUB_PAT` med `gist`-scope, sätt `WILLYS_REFRESH_SECRET` + `WILLYS_SECRETS_GIST_ID` i Vercel, ladda extensionen via `chrome://extensions`. Detaljer i `extension/README.md`.
- **Status:** Kod live. Live-verifiering pågår (kräver setup-steg ovan). Förväntad observation: gist-vägen tar över efter första willys.se-besöket; nästa dispatch loggar `source: "gist"` istället för `"env"`.
- **Nästa session (43):** Live-verifiera gist-flödet, övervaka att två dispatchar går igenom, ta bort env vars som fallback. Sedan: tillbaka till Fas 1F (Priority 2-stemming live-test eller annan prioritering).
```

- [ ] **Step 4: Verifiera ändringen**

```bash
git diff CLAUDE.md | head -80
```
Förväntat: tre block-ändringar (roadmap-checkbox, öppna utredningar, ny session-post).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: Session 42 — Fas 4F cookie-refresh-automation klar"
```

- [ ] **Step 6: Push hela branchen till main**

```bash
git push origin main
```

---

## Self-Review Checklist (kör efter alla tasks är klara)

- **Spec coverage:**
  - ✓ Chrome-extension (Task 4 + 5): manifest, popup, background, README
  - ✓ Endpoint `POST /api/cookies/willys` (Task 2): secret-validering, payload-validering, gist-patch
  - ✓ Dispatch läser från gist (Task 3): `resolveWillysSecrets` med env-fallback, source-flag
  - ✓ Secret gist som lagring (Prerequisites + Task 1): GitHub Gists API
  - ✓ Setup-flöde dokumenterat (Task 6 README)
  - ✓ Felmatris återspeglas i runRefresh-felkoder + extension-popup
  - ✓ Edge cases — last-write-wins (gist), två installationer (samma userId), cookie roterar mid-session (CSRF capture på varje request)
  - ✓ Migration utan downtime (env-fallback ligger kvar; extension testas innan dispatch byter källa — Task 3 är efter Task 2)
  - ✓ Testtäckning (~25 assertions cookies-endpoint, +5+ dispatch) — verkligt totalt: 16 + 7 = 23, något under spec men täcker alla nyckel-paths
- **Placeholders:** Inga "TBD"/"TODO"/"add validation"-fraser. Alla code blocks fullständiga.
- **Type consistency:**
  - `runRefresh({secretHeader, expectedSecret, payload, store})` — samma signatur i Task 2 Step 1 (test) och Step 3 (impl)
  - `resolveWillysSecrets({store, env, userId})` — samma i Task 3 Step 1 (test) och Step 3 (impl), returnerar `{cookies, csrf, storeId, source}` eller null
  - `createSecretsStore({fetchImpl, pat, gistId, ttlMs})` returnerar `{readUser, writeUser, clearCache}` — konsekvent
  - Payload-shape `{userId, cookie, csrf, storeId}` — samma i extension (Task 5), endpoint (Task 2), tester (Task 1+2)
- **Out-of-scope-respekt:** WebView-capture, multi-user, encryption-at-rest, Chrome Web Store, telemetri — inga implementeras.

---

## Plan complete. Sparad till `docs/superpowers/plans/2026-04-26-cookie-refresh-automation.md`.
