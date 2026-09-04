// Tester för den lokala JWT-verifieringen (Batch E1) och requireUsers
// fail-closed-garanti. Kräver node_modules (jose).
//
// Kör: node tests/auth-verify.test.js
//
// Nyckeln genereras lokalt i testet — inget nät, inget riktigt Supabase-token.
// Det som verifieras är precis de egenskaper som gör den snabba vägen säker:
// giltig signatur släpps igenom, allt annat gör det INTE.

import assert from "node:assert";
import { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet } from "jose";

// Env måste vara satt innan modulerna importeras (issuerFromEnv läser den).
// 127.0.0.1:1 är avsiktligt: reservvägen mot Supabase Auth ska fallera
// ÖGONBLICKLIGEN (connection refused) i stället för att hänga på en timeout.
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

const ISSUER = "http://127.0.0.1:1/auth/v1";

const { verifyAccessToken, __setTestKeySet, issuerFromEnv } = await import("../api/_shared/auth.js");
const { requireUser } = await import("../api/_shared/handler.js");

// ── Nycklar ──────────────────────────────────────────────────────────────────
const kp = await generateKeyPair("ES256", { extractable: true });
const jwk = { ...(await exportJWK(kp.publicKey)), kid: "test-key", alg: "ES256", use: "sig" };
const keySet = createLocalJWKSet({ keys: [jwk] });

// En ANNAN nyckel — för att bevisa att fel signatur inte släpps igenom.
const other = await generateKeyPair("ES256", { extractable: true });

__setTestKeySet(keySet);

function sign(payload, { key = kp.privateKey, alg = "ES256", exp = "1h", iss = ISSUER } = {}) {
  let t = new SignJWT(payload)
    .setProtectedHeader({ alg, kid: "test-key" })
    .setIssuedAt()
    .setIssuer(iss);
  if (exp) t = t.setExpirationTime(exp);
  return t.sign(key);
}

let pass = 0;
async function test(name, fn) {
  await fn();
  pass++;
  console.log(`  ok  ${name}`);
}

console.log("verifyAccessToken:");

await test("giltigt token släpps igenom och ger användaren", async () => {
  const token = await sign({ sub: "user-123", email: "a@b.se", role: "authenticated" });
  const user = await verifyAccessToken(token);
  assert.ok(user, "skulle godkännas");
  assert.strictEqual(user.id, "user-123");
  assert.strictEqual(user.email, "a@b.se");
  assert.strictEqual(user.role, "authenticated");
});

await test("utgånget token avvisas", async () => {
  const token = await sign({ sub: "user-123" }, { exp: "-1h" });
  assert.strictEqual(await verifyAccessToken(token), null);
});

await test("token från ett annat Supabase-projekt (fel issuer) avvisas", async () => {
  const token = await sign({ sub: "user-123" }, { iss: "https://annat-projekt.supabase.co/auth/v1" });
  assert.strictEqual(await verifyAccessToken(token), null);
});

await test("token signerat med FEL nyckel avvisas", async () => {
  const token = await sign({ sub: "user-123" }, { key: other.privateKey });
  assert.strictEqual(await verifyAccessToken(token), null);
});

await test("alg-confusion: HS256 med publika nyckeln som hemlighet avvisas", async () => {
  // Klassiskt angrepp: signera symmetriskt med den PUBLIKA nyckeln som
  // hemlighet. Utan algorithms-låsningen i auth.js skulle detta godkännas.
  const secret = new TextEncoder().encode(JSON.stringify(jwk));
  const token = await new SignJWT({ sub: "angripare" })
    .setProtectedHeader({ alg: "HS256", kid: "test-key" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime("1h")
    .sign(secret);
  assert.strictEqual(await verifyAccessToken(token), null);
});

await test("token utan sub avvisas", async () => {
  const token = await sign({ email: "a@b.se" });
  assert.strictEqual(await verifyAccessToken(token), null);
});

await test("anon-roll avvisas", async () => {
  const token = await sign({ sub: "anon-user", role: "anon" });
  assert.strictEqual(await verifyAccessToken(token), null);
});

await test("skräp, tomt och fel typ avvisas", async () => {
  for (const bad of ["", "inte-ett-token", "a.b.c", null, undefined, 42, {}]) {
    assert.strictEqual(await verifyAccessToken(bad), null, `${JSON.stringify(bad)} skulle avvisas`);
  }
});

await test("issuerFromEnv härleds ur SUPABASE_URL och tål avslutande slash", async () => {
  assert.strictEqual(issuerFromEnv(), ISSUER);
  const saved = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = "https://x.supabase.co///";
  assert.strictEqual(issuerFromEnv(), "https://x.supabase.co/auth/v1");
  process.env.SUPABASE_URL = saved;
});

// ── requireUser: fail-closed ─────────────────────────────────────────────────

function fakeRes() {
  const r = {
    statusCode: null,
    body: null,
    headers: {},
    status(c) { r.statusCode = c; return r; },
    json(b) { r.body = b; return r; },
    setHeader(k, v) { r.headers[k] = v; },
  };
  return r;
}

console.log("requireUser:");

await test("utan Authorization-header → 401", async () => {
  const res = fakeRes();
  assert.strictEqual(await requireUser({ headers: {} }, res), false);
  assert.strictEqual(res.statusCode, 401);
  assert.match(res.body.error, /inloggad/i);
});

await test("giltigt token → true och användaren på req.user", async () => {
  const token = await sign({ sub: "user-abc", email: "j@ex.se", role: "authenticated" });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = fakeRes();
  assert.strictEqual(await requireUser(req, res), true);
  assert.strictEqual(req.user.id, "user-abc");
  assert.strictEqual(res.statusCode, null, "inget felsvar skulle skickas");
});

await test("ogiltigt token → 401 (reservvägen avgör, släpper inte igenom)", async () => {
  // Lokal verifiering säger "vet inte" → reserven mot Supabase Auth körs och
  // fallerar (127.0.0.1:1) → 401. Det är fail-closed-garantin: ett fel i den
  // snabba vägen kostar latens, aldrig åtkomst.
  const token = await sign({ sub: "angripare" }, { key: other.privateKey });
  const res = fakeRes();
  assert.strictEqual(await requireUser({ headers: { authorization: `Bearer ${token}` } }, res), false);
  assert.strictEqual(res.statusCode, 401);
});

console.log(`\n${pass} test ok — auth-verify`);
