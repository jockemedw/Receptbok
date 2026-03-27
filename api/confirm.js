import { buildShoppingList } from "./_shared/shopping-builder.js";

const REPO_OWNER = "jockemedw";
const REPO_NAME  = "Receptbok";
const BRANCH     = "main";

async function fetchFileFromGitHub(path, pat) {
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`;
  const res = await fetch(apiUrl, {
    headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`Kunde inte hämta ${path}.`);
  const data = await res.json();
  return { content: JSON.parse(Buffer.from(data.content, "base64").toString("utf-8")), sha: data.sha };
}

async function fetchRecipes() {
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/recipes.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Kunde inte hämta receptdatabasen.");
  const data = await res.json();
  return data.recipes;
}

async function writeFileToGitHub(path, content, pat) {
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const headers = {
    Authorization: `token ${pat}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
  };
  const encoded = Buffer.from(JSON.stringify(content, null, 2)).toString("base64");
  const message = `Bekräftad matsedel ${new Date().toISOString().slice(0, 10)} — autogenererad`;

  for (let attempt = 0; attempt < 3; attempt++) {
    let sha;
    const getRes = await fetch(`${apiUrl}?t=${Date.now()}`, { headers });
    if (getRes.ok) sha = (await getRes.json()).sha;

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({ message, content: encoded, branch: BRANCH, ...(sha ? { sha } : {}) }),
    });
    if (putRes.ok) return;
    if (putRes.status === 409 && attempt < 2) continue;
    throw new Error(`Kunde inte spara ${path} — prova igen.`);
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metod ej tillåten" });

  const pat = process.env.GITHUB_PAT;
  if (!pat) return res.status(500).json({ error: "GITHUB_PAT saknas i env" });

  try {
    const [{ content: plan }, allRecipes] = await Promise.all([
      fetchFileFromGitHub("weekly-plan.json", pat),
      fetchRecipes(),
    ]);

    if (!plan?.days?.length) return res.status(400).json({ error: "Ingen veckoplan att bekräfta." });

    const selectedIds = plan.days.map((d) => d.recipeId).filter(Boolean);
    const shoppingCategories = buildShoppingList(selectedIds, allRecipes);

    const today = new Date().toISOString().slice(0, 10);

    // Hämta befintlig shopping-list för att bevara manuella varor
    let existingManual = [];
    try {
      const { content: existingShop } = await fetchFileFromGitHub("shopping-list.json", pat);
      existingManual = existingShop?.manualItems || [];
    } catch { /* ingen befintlig lista — OK */ }

    const shoppingList = {
      generated: today,
      startDate: plan.startDate,
      endDate: plan.endDate,
      recipeItems: shoppingCategories,
      recipeItemsMovedAt: null,
      manualItems: existingManual,
    };

    // Sätt confirmedAt på planen och spara båda
    const confirmedPlan = { ...plan, confirmedAt: new Date().toISOString() };

    await Promise.all([
      writeFileToGitHub("weekly-plan.json", confirmedPlan, pat),
      writeFileToGitHub("shopping-list.json", shoppingList, pat),
    ]);

    return res.status(200).json({ ok: true, weeklyPlan: confirmedPlan, shoppingList });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
