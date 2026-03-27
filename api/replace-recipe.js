const REPO_OWNER = "jockemedw";
const REPO_NAME  = "Receptbok";
const BRANCH     = "main";

async function fetchRecipes() {
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/recipes.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Kunde inte hämta receptdatabasen.");
  const data = await res.json();
  return data.recipes;
}

async function fetchHistory(pat) {
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/recipe-history.json?ref=${BRANCH}`;
  const res = await fetch(apiUrl, {
    headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return { usedOn: {} };
  try {
    const data = await res.json();
    const parsed = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
    if (parsed.history && !parsed.usedOn) {
      const usedOn = {};
      for (const entry of parsed.history) {
        for (const id of entry.recipeIds || []) {
          if (!usedOn[id] || entry.date > usedOn[id]) usedOn[id] = entry.date;
        }
      }
      return { usedOn };
    }
    return parsed;
  } catch {
    return { usedOn: {} };
  }
}

async function fetchWeeklyPlan(pat) {
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/weekly-plan.json?ref=${BRANCH}`;
  const res = await fetch(apiUrl, {
    headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error("Kunde inte hämta veckoplan.");
  const data = await res.json();
  return {
    plan: JSON.parse(Buffer.from(data.content, "base64").toString("utf-8")),
    sha: data.sha,
  };
}

async function writeFileToGitHub(path, content, pat) {
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const headers = {
    Authorization: `token ${pat}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
  };
  const encoded = Buffer.from(JSON.stringify(content, null, 2)).toString("base64");
  const message = `Receptbyte ${new Date().toISOString().slice(0, 10)} — autogenererad`;

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

function recentlyUsedIds(history, days = 14) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const ids = new Set();
  for (const [id, date] of Object.entries(history.usedOn || {})) {
    if (date >= cutoffStr) ids.add(parseInt(id, 10));
  }
  return ids;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Metod ej tillåten" });

  const pat = process.env.GITHUB_PAT;
  if (!pat) return res.status(500).json({ error: "GITHUB_PAT saknas i env" });

  const { date, currentRecipeId, weekRecipeIds = [] } = req.body || {};
  if (!date) return res.status(400).json({ error: "date saknas" });

  try {
    const [allRecipes, history, { plan, sha: planSha }] = await Promise.all([
      fetchRecipes(),
      fetchHistory(pat),
      fetchWeeklyPlan(pat),
    ]);

    const recentIds = recentlyUsedIds(history);
    const weekSet   = new Set(weekRecipeIds.filter(id => id !== currentRecipeId));

    // Pool: inte nyligen använd, inte redan i veckans plan, inte det vi ersätter
    let pool = allRecipes.filter(r =>
      r.id !== currentRecipeId &&
      !weekSet.has(r.id) &&
      !recentIds.has(r.id)
    );

    // Fallback: välj det som användes längst sedan om poolen är tom
    if (!pool.length) {
      const usedOn = history.usedOn || {};
      pool = allRecipes
        .filter(r => r.id !== currentRecipeId && !weekSet.has(r.id))
        .sort((a, b) => {
          const da = usedOn[a.id] || "0000-00-00";
          const db = usedOn[b.id] || "0000-00-00";
          return da < db ? -1 : 1;
        });
    }

    if (!pool.length) return res.status(409).json({ error: "Inga tillgängliga recept att byta till." });

    const picked = shuffle(pool)[0];

    // Uppdatera weekly-plan.json — byt ut rätt dag
    const dayIdx = plan.days.findIndex(d => d.date === date);
    if (dayIdx === -1) return res.status(404).json({ error: "Dagen hittades inte i veckoplanen." });

    plan.days[dayIdx] = {
      ...plan.days[dayIdx],
      recipe: picked.title,
      recipeId: picked.id,
    };

    await writeFileToGitHub("weekly-plan.json", plan, pat);

    return res.status(200).json({ recipe: picked.title, recipeId: picked.id });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Okänt fel" });
  }
}
