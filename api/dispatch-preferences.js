import { readFileRaw, writeFile } from "./_shared/github.js";

const DEFAULTS = {
  blockedBrands: [],
  preferOrganic: {},
  preferSwedish: {},
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const pat = process.env.GITHUB_PAT;
  if (!pat) return res.status(500).json({ error: "GITHUB_PAT saknas i env" });

  try {
    if (req.method === "GET") {
      let prefs;
      try {
        prefs = await readFileRaw("dispatch-preferences.json");
      } catch {
        prefs = DEFAULTS;
      }
      return res.status(200).json(prefs);
    }

    if (req.method === "PUT") {
      const body = req.body;
      const prefs = {
        blockedBrands: (body.blockedBrands || []).map((b) => b.toLowerCase().trim()).filter(Boolean),
        preferOrganic: body.preferOrganic || {},
        preferSwedish: body.preferSwedish || {},
      };
      await writeFile("dispatch-preferences.json", prefs, pat, "Uppdatera inköpspreferenser");
      return res.status(200).json(prefs);
    }

    return res.status(405).json({ error: "Metod ej tillåten" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Kunde inte spara preferenserna — försök igen." });
  }
}
