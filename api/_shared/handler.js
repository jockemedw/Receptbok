/**
 * Wrapper som hanterar CORS, OPTIONS, metodkontroll och GITHUB_PAT.
 * Anvaends: export default createHandler(async (req, res, pat) => { ... })
 */
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
      res.status(500).json({ error: err.message || "Något gick fel." });
    }
  };
}
