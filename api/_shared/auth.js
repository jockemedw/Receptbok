// Lokal verifiering av Supabase-access-tokens (Batch E1 i docs/prestanda-plan-2026-09.md).
//
// BAKGRUND. requireUser frågade tidigare Supabase Auth (db.auth.getUser) vid
// VARJE API-anrop — en nätverksrunda innan endpointen ens börjat arbeta. Uppmätt
// på Joakims iPhone 2026-09-04: /api/skip-day 3 478 ms, move-day 2 700 ms.
// Projektet signerar sina tokens med ES256 och publicerar den publika nyckeln på
// <SUPABASE_URL>/auth/v1/.well-known/jwks.json (publik, cache 600 s), så
// signaturen kan verifieras lokalt utan att fråga någon.
//
// SÄKERHETSHÅLLNING — läs innan du ändrar något här:
//   • Aldrig fail-open. Går den lokala verifieringen inte igenom returneras
//     null, och anroparen (requireUser i handler.js) faller tillbaka på den
//     gamla getUser-vägen som får avgöra. Ett FÖRFALSKAT token kostar alltså en
//     extra nätverksrunda och blir ändå avvisat — det blir aldrig insläppt.
//   • `algorithms` låses till de asymmetriska. Utan den låsningen kan en
//     angripare signera med HS256 och den PUBLIKA nyckeln som hemlighet
//     (alg-confusion) och bli godkänd.
//   • Issuer kontrolleras mot SUPABASE_URL — ett giltigt token från ett annat
//     Supabase-projekt får inte duga.
//
// KÄND AVVÄGNING — ÅTERKALLNING (säkerhetsgranskning 2026-09-04):
//   getUser frågade Supabase Auth och såg därför LEVANDE serverstatus: en
//   raderad, avstängd eller utloggad användares token avvisades direkt. Den här
//   vägen är en ren signatur- och utgångskontroll utan serverstatus. Ett
//   ÅTERKALLAT token fortsätter alltså gälla tills det går ut av sig självt.
//   Fönstret = projektets access-token-TTL (Supabase-default 1 h, men det är en
//   dashboard-inställning — höjs den vidgas fönstret tyst).
//   Formuleringen "ett fel här kostar latens, inte säkerhet" gäller alltså
//   förfalskade tokens, INTE återkallade. För familjens tre konton utan
//   självregistrering är avvägningen accepterad; blir det fel läge finns två
//   billiga vägar: (a) kräv getUser på de destruktiva endpointsen
//   (discard-plan, skip-day action:delete), (b) en liten deny-lista per varm
//   lambda. Måste omprövas vid M1, när främmande hushåll registrerar sig och
//   "ta bort medlem" behöver bita omedelbart.
//
// Testas av tests/auth-verify.test.js (giltigt, utgånget, fel issuer, fel
// nyckel, alg-confusion, saknad sub, skräp).

let _keySet = null;        // memoiserad JWKS mellan varma anrop
let _keySetIssuer = null;
let _testKeySet = null;    // sätts BARA av testsviten (se __setTestKeySet)

// Test-krok: låter testsviten injicera en lokal nyckeluppsättning i stället för
// den publika JWKS-hämtningen. Anropas aldrig i produktionskod.
export function __setTestKeySet(keySet) {
  _testKeySet = keySet;
  _keySet = null;
  _keySetIssuer = null;
}

// Supabase-projektets issuer, härledd ur env (aldrig hårdkodad — samma kod ska
// fungera mot ett annat projekt utan ändring).
export function issuerFromEnv() {
  const base = process.env.SUPABASE_URL;
  if (!base) return null;
  return `${String(base).replace(/\/+$/, "")}/auth/v1`;
}

async function getKeySet(issuer) {
  if (_testKeySet) return _testKeySet;
  if (_keySet && _keySetIssuer === issuer) return _keySet;
  const { createRemoteJWKSet } = await import("jose");
  _keySet = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  _keySetIssuer = issuer;
  return _keySet;
}

/**
 * Verifierar ett access-token lokalt.
 * @returns {Promise<{id: string, email: string|null, role: string|null}|null>}
 *          Användaren vid giltig signatur, annars null (= "vet inte" → anroparen
 *          faller tillbaka på Supabase Auth, som avgör).
 */
export async function verifyAccessToken(token, { keySet, issuer } = {}) {
  if (!token || typeof token !== "string") return null;
  const iss = issuer || issuerFromEnv();
  if (!iss) return null;   // ingen SUPABASE_URL → vi kan inte veta något

  try {
    const { jwtVerify } = await import("jose");
    const keys = keySet || (await getKeySet(iss));
    const { payload } = await jwtVerify(token, keys, {
      issuer: iss,
      // Låst till asymmetriska algoritmer — se alg-confusion ovan.
      algorithms: ["ES256", "RS256"],
      clockTolerance: 5,
    });
    if (!payload.sub) return null;
    if (payload.role === "anon") return null;   // anon-nyckel är inte en användare
    return {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      role: typeof payload.role === "string" ? payload.role : null,
    };
  } catch {
    // Utgånget, fel signatur, fel issuer, okänd kid, nätfel vid JWKS-hämtning —
    // allt landar här. Vi säger "vet inte", aldrig "okej".
    return null;
  }
}
