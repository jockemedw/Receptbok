const REPO_OWNER = "jockemedw";
const REPO_NAME  = "Receptbok";
const BRANCH     = "main";

async function readRecipes(pat) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/recipes.json`;
  const headers = {
    Authorization: `token ${pat}`,
    Accept: "application/vnd.github+json",
  };
  const res = await fetch(`${url}?t=${Date.now()}`, { headers });
  if (!res.ok) throw new Error("Kunde inte läsa receptdatabasen.");
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
  return { content, sha: data.sha };
}

async function writeRecipes(content, sha, pat) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/recipes.json`;
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
        message: "Receptdatabasen uppdaterad",
        content: encoded,
        branch: BRANCH,
        sha: currentSha,
      }),
    });
    if (res.ok) return;
    if (res.status === 409 && attempt < 2) continue;
    throw new Error("Kunde inte spara receptdatabasen — prova igen.");
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

  const { action, id, recipe } = req.body || {};

  try {
    const { content, sha } = await readRecipes(pat);
    const recipes = content.recipes;

    if (action === "toggle_tested") {
      const r = recipes.find(r => r.id === id);
      if (!r) return res.status(404).json({ error: "Recept hittades inte." });
      r.tested = !r.tested;
      await writeRecipes(content, sha, pat);
      return res.status(200).json({ ok: true, tested: r.tested });

    } else if (action === "update") {
      if (!recipe || !recipe.id) return res.status(400).json({ error: "Recept saknas." });
      const idx = recipes.findIndex(r => r.id === recipe.id);
      if (idx === -1) return res.status(404).json({ error: "Recept hittades inte." });
      recipes[idx] = recipe;
      content.meta.lastUpdated = new Date().toISOString().slice(0, 10);
      await writeRecipes(content, sha, pat);
      return res.status(200).json({ ok: true });

    } else if (action === "delete") {
      const idx = recipes.findIndex(r => r.id === id);
      if (idx === -1) return res.status(404).json({ error: "Recept hittades inte." });
      recipes.splice(idx, 1);
      content.meta.totalRecipes = recipes.length;
      content.meta.lastUpdated  = new Date().toISOString().slice(0, 10);
      await writeRecipes(content, sha, pat);
      return res.status(200).json({ ok: true });

    } else if (action === "add") {
      if (!recipe) return res.status(400).json({ error: "Recept saknas." });
      const maxId = recipes.reduce((max, r) => Math.max(max, r.id), 0);
      const newRecipe = {
        id: maxId + 1,
        title: recipe.title,
        tested: false,
        servings: recipe.servings || 4,
        time: recipe.time || null,
        timeNote: recipe.timeNote || null,
        tags: recipe.tags || [],
        protein: recipe.protein,
        ingredients: recipe.ingredients || [],
        instructions: recipe.instructions || [],
        notes: recipe.notes || null,
      };
      recipes.push(newRecipe);
      content.meta.totalRecipes = recipes.length;
      content.meta.lastUpdated = new Date().toISOString().slice(0, 10);
      await writeRecipes(content, sha, pat);
      return res.status(200).json({ ok: true, recipe: newRecipe });

    } else {
      return res.status(400).json({ error: "Okänd action." });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
