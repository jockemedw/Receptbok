import { createHandler } from "./_shared/handler.js";
import { readFile, writeFile } from "./_shared/github.js";

// Lagringsformat i custom-days.json:
// { "entries": { "2026-04-25": { "note": "...", "recipeId": 42, "recipeTitle": "..." } } }
// Antingen note, recipeId eller båda.

export default createHandler(async (req, res, pat) => {
  const { action, dates, note, recipeId, recipeTitle } = req.body || {};
  if (!["set", "clear"].includes(action)) {
    return res.status(400).json({ error: "action måste vara 'set' eller 'clear'" });
  }
  if (!Array.isArray(dates) || !dates.length) {
    return res.status(400).json({ error: "dates saknas" });
  }

  let current = { entries: {} };
  try {
    const { content } = await readFile("custom-days.json", pat);
    if (content && typeof content === "object") {
      current = { entries: content.entries || {} };
    }
  } catch { /* filen kan saknas, OK */ }

  if (action === "set") {
    const trimmedNote = typeof note === "string" ? note.trim().slice(0, 140) : "";
    const rid = Number.isInteger(recipeId) ? recipeId : null;
    const rTitle = typeof recipeTitle === "string" ? recipeTitle.trim().slice(0, 200) : "";
    for (const d of dates) {
      const entry = {};
      if (trimmedNote) entry.note = trimmedNote;
      if (rid) {
        entry.recipeId = rid;
        if (rTitle) entry.recipeTitle = rTitle;
      }
      current.entries[d] = entry;
    }
  } else {
    for (const d of dates) {
      delete current.entries[d];
    }
  }

  const commitMsg = action === "set"
    ? `Egen planering ${dates.length === 1 ? dates[0] : `${dates.length} dagar`}`
    : `Rensa egen planering ${dates.length === 1 ? dates[0] : `${dates.length} dagar`}`;

  await writeFile("custom-days.json", current, pat, commitMsg);
  return res.status(200).json({ ok: true, customDays: current });
});
