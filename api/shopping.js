import { createHandler } from "./_shared/handler.js";
import { readFileRaw, writeFile } from "./_shared/github.js";

const PREFS_DEFAULTS = { blockedBrands: [], preferOrganic: {}, preferSwedish: {} };

export default createHandler(async (req, res, pat) => {
  const { action, preferences } = req.body || {};

  if (action === "get_preferences") {
    let prefs;
    try { prefs = await readFileRaw("dispatch-preferences.json"); } catch { prefs = PREFS_DEFAULTS; }
    return res.status(200).json(prefs);
  }

  if (action === "set_preferences") {
    const prefs = {
      blockedBrands: (preferences?.blockedBrands || []).map((b) => b.toLowerCase().trim()).filter(Boolean),
      preferOrganic: preferences?.preferOrganic || {},
      preferSwedish: preferences?.preferSwedish || {},
    };
    await writeFile("dispatch-preferences.json", prefs, pat, "Uppdatera inköpspreferenser");
    return res.status(200).json(prefs);
  }

  return res.status(400).json({ error: "Okänd action" });
});
