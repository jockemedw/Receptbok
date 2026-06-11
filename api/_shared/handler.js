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
export function createHandler(fn) {
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Metod ej tillåten" });

    const pat = process.env.GITHUB_PAT;
    if (!pat) return res.status(500).json({ error: "GITHUB_PAT saknas i env" });

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
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    const allowed = allowGet ? ["GET", "POST"] : ["POST"];
    if (!allowed.includes(req.method)) return res.status(405).json({ error: "Metod ej tillåten" });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY saknas i env" });
    }

    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: userMessage(err) });
    }
  };
}
