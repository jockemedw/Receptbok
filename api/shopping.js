import { createHandler } from "./_shared/handler.js";
import { readFile, writeFile } from "./_shared/github.js";

// ── Handler ─────────────────────────────────────────────────────────────────

export default createHandler(async (req, res, pat) => {
  const { action, item, checkedItems } = req.body || {};

  const { content } = await readFile("shopping-list.json", pat);

  if (action === "add") {
    if (!item?.trim()) return res.status(400).json({ error: "Tom vara" });
    content.manualItems = content.manualItems || [];
    if (!content.manualItems.includes(item.trim())) {
      content.manualItems.push(item.trim());
    }
  } else if (action === "remove") {
    content.manualItems = (content.manualItems || []).filter((i) => i !== item);
  } else if (action === "move") {
    content.recipeItemsMovedAt = new Date().toISOString().slice(0, 10);
  } else if (action === "set_checked") {
    content.checkedItems = checkedItems || {};
  } else if (action === "clear") {
    content.recipeItems = {};
    content.manualItems = [];
    content.checkedItems = {};
    content.recipeItemsMovedAt = null;
  } else {
    return res.status(400).json({ error: "Okänd action" });
  }

  await writeFile("shopping-list.json", content, pat, "Inköpslista uppdaterad");
  return res.status(200).json({ ok: true, content });
});
