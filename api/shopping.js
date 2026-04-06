const REPO_OWNER = "jockemedw";
const REPO_NAME = "Receptbok";
const BRANCH = "main";

async function readShoppingList(pat) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/shopping-list.json`;
  const headers = {
    Authorization: `token ${pat}`,
    Accept: "application/vnd.github+json",
  };
  const res = await fetch(`${url}?t=${Date.now()}`, { headers });
  if (!res.ok) throw new Error("Kunde inte läsa inköpslistan.");
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
  return { content, sha: data.sha };
}

async function writeShoppingList(content, sha, pat) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/shopping-list.json`;
  const headers = {
    Authorization: `token ${pat}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
  };
  const encoded = Buffer.from(JSON.stringify(content, null, 2)).toString("base64");

  for (let attempt = 0; attempt < 3; attempt++) {
    let currentSha = sha;
    if (attempt > 0) {
      const getRes = await fetch(`${url}?t=${Date.now()}`, { headers });
      if (getRes.ok) currentSha = (await getRes.json()).sha;
    }
    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: "Inköpslista uppdaterad",
        content: encoded,
        branch: BRANCH,
        sha: currentSha,
      }),
    });
    if (res.ok) return;
    if (res.status === 409 && attempt < 2) continue;
    throw new Error("Kunde inte spara inköpslistan — prova igen.");
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const pat = process.env.GITHUB_PAT;
  if (!pat) return res.status(500).json({ error: "GITHUB_PAT saknas" });

  const { action, item, checkedItems } = req.body || {};

  try {
    const { content, sha } = await readShoppingList(pat);

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

    await writeShoppingList(content, sha, pat);
    return res.status(200).json({ ok: true, content });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
