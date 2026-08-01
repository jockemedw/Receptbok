// Regressiontester för cookies-endpoint + secrets-store.
// Körs med `node tests/cookies-endpoint.test.js` — inga externa deps.
// Hook: se .claude/settings.json — blockerar commit vid regression.

import { createSecretsStore } from "../api/_shared/secrets-store.js";
import { runRefresh, secretsMatch } from "../api/dispatch-to-willys.js";

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

// ─── secrets-store: writeUser ─────────────────────────────────────

// E. writeUser bevarar andra users
{
  const fetchImpl = makeGistFetch({
    users: { andra: { cookie: "x", csrf: "y", storeId: "9999" } },
  });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  await store.writeUser("joakim", "willys", { cookie: "c", csrf: "t", storeId: "2160" });
  const state = fetchImpl.state();
  assertEq(state.users.andra?.cookie, "x", "writeUser bevarar andra user");
  assertEq(state.users.joakim?.cookie, "c", "writeUser skapar joakim");
}

// F. writeUser sätter updatedAt
{
  const fetchImpl = makeGistFetch({ users: {} });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  await store.writeUser("joakim", "willys", { cookie: "c", csrf: "t", storeId: "2160" });
  const state = fetchImpl.state();
  assertTrue(state.users.joakim?.updatedAt, "updatedAt sätts");
  assertTrue(/^\d{4}-\d{2}-\d{2}T/.test(state.users.joakim.updatedAt), "updatedAt är ISO 8601");
}

// G. writeUser uppdaterar cache → readUser ser nya värden utan ny GET
{
  const fetchImpl = makeGistFetch({ users: { joakim: { cookie: "old", csrf: "old", storeId: "2160" } } });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  await store.readUser("joakim");
  await store.writeUser("joakim", "willys", { cookie: "new", csrf: "newt", storeId: "2160" });
  const reread = await store.readUser("joakim");
  assertEq(reread?.cookie, "new", "readUser ser writeUsers nya cookie utan extra GET");
  const gets = fetchImpl.calls.filter(c => c.method === "GET").length;
  assertEq(gets, 2, "writeUser gör en intern GET (för fresh state) men reread cache-hits");
}

// H. PATCH-bodyn har rätt struktur
{
  const fetchImpl = makeGistFetch({ users: {} });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  await store.writeUser("joakim", "willys", { cookie: "c", csrf: "t", storeId: "2160" });
  const patch = fetchImpl.calls.find(c => c.method === "PATCH");
  assertTrue(patch, "PATCH skickades");
  const body = JSON.parse(patch.body);
  assertTrue(body.files?.["willys-secrets.json"]?.content, "PATCH-body har files['willys-secrets.json'].content");
}

// ─── cookies-endpoint: runRefresh ─────────────────────────────────

// Speglar produktionsstorets kontrakt: skriver per butik under stores[<butik>]
// och speglar Willys till de platta fälten (rollback-garantin).
function fakeStore(initial = {}) {
  const users = { ...initial };
  return {
    writeUser: async (userId, store, payload) => {
      if (!users[userId]) users[userId] = {};
      if (!users[userId].stores) users[userId].stores = {};
      const entry = { ...payload, updatedAt: new Date().toISOString() };
      users[userId].stores[store] = entry;
      if (store === "willys") Object.assign(users[userId], payload, { updatedAt: entry.updatedAt });
      return entry;
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

// ─── Butiksuppdelning: cookies per butik (Willys + Hemköp) ───────────────────

// S1. writeUser skriver under stores[<butik>] och speglar Willys platt
{
  const fetchImpl = makeGistFetch({ users: {} });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  await store.writeUser("joakim", "willys", { cookie: "wc", csrf: "wt", storeId: "2160" });
  const state = fetchImpl.state();
  assertEq(state.users.joakim.stores.willys.cookie, "wc", "willys-skrivning hamnar i stores.willys");
  assertEq(state.users.joakim.cookie, "wc", "willys-skrivning speglas till platta fältet (rollback-garanti)");
  assertEq(state.users.joakim.storeId, "2160", "speglingen tar med storeId");
}

// S2. Hemköp-skrivning speglas INTE platt (annars läser gammal kod fel butik)
{
  const fetchImpl = makeGistFetch({
    users: { joakim: { cookie: "wc", csrf: "wt", storeId: "2160", stores: { willys: { cookie: "wc", csrf: "wt", storeId: "2160" } } } },
  });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  await store.writeUser("joakim", "hemkop", { cookie: "hc", csrf: "ht" });
  const state = fetchImpl.state();
  assertEq(state.users.joakim.stores.hemkop.cookie, "hc", "hemköp-skrivning hamnar i stores.hemkop");
  assertEq(state.users.joakim.cookie, "wc", "hemköp-skrivning rör inte det platta willys-fältet");
  assertEq(state.users.joakim.stores.willys.cookie, "wc", "hemköp-skrivning rör inte stores.willys");
  assertEq(state.users.joakim.stores.hemkop.storeId, undefined, "utelämnat storeId skrivs inte som fält");
}

// S3. Willys-skrivning rör inte en befintlig Hemköp-entry
{
  const fetchImpl = makeGistFetch({
    users: { joakim: { stores: { hemkop: { cookie: "hc", csrf: "ht" } } } },
  });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  await store.writeUser("joakim", "willys", { cookie: "wc", csrf: "wt", storeId: "2160" });
  assertEq(fetchImpl.state().users.joakim.stores.hemkop.cookie, "hc", "willys-skrivning bevarar hemköp");
}

// S4. readUser läser rätt butik
{
  const fetchImpl = makeGistFetch({
    users: { joakim: { stores: {
      willys: { cookie: "wc", csrf: "wt", storeId: "2160" },
      hemkop: { cookie: "hc", csrf: "ht" },
    } } },
  });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  assertEq((await store.readUser("joakim", "willys"))?.cookie, "wc", "readUser('willys') ger willys-cookien");
  assertEq((await store.readUser("joakim", "hemkop"))?.cookie, "hc", "readUser('hemkop') ger hemköp-cookien");
  assertEq((await store.readUser("joakim"))?.cookie, "wc", "readUser utan butik defaultar till willys");
}

// S5. Legacy-fallback: bara Willys ärver de gamla platta fälten
{
  const fetchImpl = makeGistFetch({
    users: { joakim: { cookie: "legacy", csrf: "lt", storeId: "2160" } }, // inget stores-objekt
  });
  const store = createSecretsStore({ fetchImpl, pat: "pat", gistId: "g1", ttlMs: 60_000 });
  assertEq((await store.readUser("joakim", "willys"))?.cookie, "legacy", "willys faller tillbaka på platta fältet");
  assertEq(await store.readUser("joakim", "hemkop"), null, "hemköp ärver ALDRIG willys-cookien");
}

// ─── runRefresh: butiksvalidering ────────────────────────────────────────────

// S6. Saknat store-fält behandlas som willys (gammal extension)
{
  const store = fakeStore();
  const result = await runRefresh({
    secretHeader: "abc", expectedSecret: "abc",
    payload: { userId: "joakim", cookie: "c", csrf: "t", storeId: "2160" },
    store,
  });
  assertEq(result.status, 200, "saknat store → 200");
  assertEq(result.body.store, "willys", "saknat store defaultar till willys");
  assertTrue(store._users.joakim.stores.willys, "skrevs under stores.willys");
}

// S7. Okänd butik → 400 (aldrig tyst willys-fallback)
{
  const store = fakeStore();
  const result = await runRefresh({
    secretHeader: "abc", expectedSecret: "abc",
    payload: { userId: "joakim", cookie: "c", csrf: "t", storeId: "2160", store: "coop" },
    store,
  });
  assertEq(result.status, 400, "okänd butik → 400");
  assertEq(result.body.field, "store", "felfältet är store");
}

// S8. Hemköp utan storeId är giltigt (butiks-ID används bara av Willys reor)
{
  const store = fakeStore();
  const result = await runRefresh({
    secretHeader: "abc", expectedSecret: "abc",
    payload: { userId: "joakim", cookie: "hc", csrf: "ht", store: "hemkop" },
    store,
  });
  assertEq(result.status, 200, "hemköp utan storeId → 200");
  assertEq(result.body.store, "hemkop", "svaret rapporterar hemkop");
  assertEq(store._users.joakim.stores.hemkop.cookie, "hc", "hemköp-cookien skrevs");
}

// S9. Willys utan storeId är fortfarande ogiltigt
{
  const store = fakeStore();
  const result = await runRefresh({
    secretHeader: "abc", expectedSecret: "abc",
    payload: { userId: "joakim", cookie: "c", csrf: "t", store: "willys" },
    store,
  });
  assertEq(result.status, 400, "willys utan storeId → 400");
  assertEq(result.body.field, "storeId", "felfältet är storeId");
}

// ─── secretsMatch (konstant-tids-jämförelse) ─────────────────────────────────
// Q. Identiska hemligheter matchar
assertTrue(secretsMatch("hemlig-abc123", "hemlig-abc123"), "secretsMatch: identiska → true");
// R. Olika hemligheter (samma längd) matchar inte
assertFalse(secretsMatch("hemlig-abc123", "hemlig-xyz789"), "secretsMatch: olika samma längd → false");
// S. Olika längd matchar inte (och kastar inte)
assertFalse(secretsMatch("kort", "mycket-längre-hemlighet"), "secretsMatch: olika längd → false");
// T. Tom/saknad hemlighet matchar aldrig (env ej satt → alltid avvisa)
assertFalse(secretsMatch("", ""), "secretsMatch: båda tomma → false");
assertFalse(secretsMatch("abc", ""), "secretsMatch: tom förväntad → false");
assertFalse(secretsMatch(undefined, "abc"), "secretsMatch: undefined header → false");
assertFalse(secretsMatch("abc", undefined), "secretsMatch: undefined expected → false");
// U. En presensskillnad i sista tecknet fångas
assertFalse(secretsMatch("hemlighet1", "hemlighet2"), "secretsMatch: skillnad i sista tecknet → false");

console.log(`\n${passed} passerade, ${failed} failade`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(f));
  process.exit(1);
}
