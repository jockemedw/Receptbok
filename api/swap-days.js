const REPO_OWNER = "jockemedw";
const REPO_NAME  = "Receptbok";
const BRANCH     = "main";

async function fetchWeeklyPlan(pat) {
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/weekly-plan.json?ref=${BRANCH}`;
  const res = await fetch(apiUrl, {
    headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error("Kunde inte hämta veckoplanen.");
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
  const message = `Dagsbyte ${new Date().toISOString().slice(0, 10)} — autogenererad`;

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

  const { date1, date2 } = req.body || {};
  if (!date1 || !date2) return res.status(400).json({ error: "date1 och date2 krävs" });
  if (date1 === date2) return res.status(400).json({ error: "Välj två olika dagar" });

  try {
    const { plan } = await fetchWeeklyPlan(pat);

    const idx1 = plan.days.findIndex((d) => d.date === date1);
    const idx2 = plan.days.findIndex((d) => d.date === date2);

    if (idx1 === -1 || idx2 === -1) return res.status(404).json({ error: "En eller båda dagarna finns inte i planen." });

    // Byt bara recipe och recipeId — datum och dagnamn stannar på sin plats
    const { recipe: r1, recipeId: rid1 } = plan.days[idx1];
    plan.days[idx1].recipe   = plan.days[idx2].recipe;
    plan.days[idx1].recipeId = plan.days[idx2].recipeId;
    plan.days[idx2].recipe   = r1;
    plan.days[idx2].recipeId = rid1;

    await writeFileToGitHub("weekly-plan.json", plan, pat);

    return res.status(200).json({ ok: true, weeklyPlan: plan });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
