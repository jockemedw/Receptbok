import { createHandler } from "./_shared/handler.js";
import { readFile, writeFile } from "./_shared/github.js";

// Lagringsformat i custom-days.json:
// { "entries": { "2026-04-25": { "note": "Pizza hemma" }, ... } }

export default createHandler(async (req, res, pat) => {
  const { action, dates, note } = req.body || {};
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
    const trimmed = typeof note === "string" ? note.trim().slice(0, 140) : "";
    for (const d of dates) {
      current.entries[d] = { note: trimmed };
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
