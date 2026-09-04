/**
 * Wrapper som hanterar CORS, OPTIONS, metodkontroll och GITHUB_PAT.
 * Anvaends: export default createHandler(async (req, res, pat) => { ... })
 */

// Avsiktligt kastade fel (new Error("Kunde inte ...")) har begripliga svenska
// meddelanden och får visas för användaren. Programfel (TypeError m.fl.) och
// icke-Error-throws läcker tekniska detaljer — de maskeras med ett generiskt
// meddelande och loggas i sin helhet på servern.
function userMessage(err) {
  const intentional = err instanceof Error && err.constructor === Error && err.message;
  return intentional ? err.message : "Något gick fel — prova igen om en stund.";
}

// Verifierar Supabase-JWT:n i "Authorization: Bearer <token>"-headern. Endpoints
// kör med service-role-nyckeln (kringgår RLS), så utan detta kan vem som helst
// som känner URL:en anropa dem — t.ex. POST /api/discard-plan och radera
// familjens matsedel. Frontend skickar token via den delade apiFetch-wrappern.
//
// TVÅ VÄGAR (Batch E1, docs/prestanda-plan-2026-09.md):
//   1. Snabb väg — signaturen verifieras LOKALT mot projektets publika nyckel
//      (api/_shared/auth.js). Ingen nätverksrunda. Detta är normalfallet.
//   2. Reserv — den gamla getUser-vägen mot Supabase Auth. Används när den
//      lokala verifieringen säger "vet inte" (okänd nyckel, JWKS onåbar,
//      annan algoritm) OCH när tokenet är ogiltigt. Reserven AVGÖR alltid.
// Fail-closed: allt som inte är ett giltigt token ger 401. Den snabba vägen kan
// bara släppa igenom, aldrig avvisa på egen hand — så ett fel i den kostar
// latens, inte säkerhet.
//
// auth.js/supabase.js importeras DYNAMISKT (först vid request) så att testsviten
// kan importera wrappade endpoints utan att dra in jose/@supabase/supabase-js
// vid import-tid.
//
// Den verifierade användaren läggs på req.user ({ id, email, role }) för
// framtida bruk (hushåll ur token — backlog #6).
export async function requireUser(req, res) {
  const authz = req.headers?.authorization || req.headers?.Authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: "Du måste vara inloggad för att göra det här." });
    return false;
  }

  // 1. Lokal verifiering.
  try {
    const { verifyAccessToken } = await import("./auth.js");
    const user = await verifyAccessToken(token);
    if (user) {
      req.user = user;
      return true;
    }
  } catch (err) {
    // Modulen kunde inte laddas/köras alls — logga och gå vidare till reserven.
    console.error("Lokal token-verifiering kunde inte köras:", err);
  }

  // 2. Reserv mot Supabase Auth — samma beteende som före Batch E.
  try {
    const { db } = await import("./supabase.js");
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) {
      res.status(401).json({ error: "Din session har gått ut — logga in igen." });
      return false;
    }
    req.user = { id: data.user.id, email: data.user.email ?? null, role: null };
    return true;
  } catch (err) {
    console.error("Auth-verifiering misslyckades:", err);
    res.status(401).json({ error: "Din session har gått ut — logga in igen." });
    return false;
  }
}
// Server-Timing gör auth-kostnaden synlig i webbläsarens nätverkspanel och
// därmed mätbar utifrån. Sätts före handlern körs — efteråt kan svaret redan
// ha skickats. Misslyckas det är det ingen fara: det är diagnostik, inte logik.
function setAuthTiming(res, ms) {
  try { res.setHeader("Server-Timing", `auth;dur=${ms}`); } catch { /* svaret redan påbörjat */ }
}

export function createHandler(fn) {
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Metod ej tillåten" });

    const pat = process.env.GITHUB_PAT;
    if (!pat) return res.status(500).json({ error: "GITHUB_PAT saknas i env" });

    const tAuth = Date.now();
    if (!(await requireUser(req, res))) return;
    setAuthTiming(res, Date.now() - tAuth);

    try {
      await fn(req, res, pat);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: userMessage(err) });
    }
  };
}

// Variant utan GITHUB_PAT — används av Supabase-baserade endpoints.
export function createSupabaseHandler(fn, { allowGet = false } = {}) {
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", allowGet ? "GET, POST, OPTIONS" : "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") return res.status(200).end();
    const allowed = allowGet ? ["GET", "POST"] : ["POST"];
    if (!allowed.includes(req.method)) return res.status(405).json({ error: "Metod ej tillåten" });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY saknas i env" });
    }

    const tAuth = Date.now();
    if (!(await requireUser(req, res))) return;
    setAuthTiming(res, Date.now() - tAuth);

    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: userMessage(err) });
    }
  };
}
