const REPO_OWNER = "jockemedw";
const REPO_NAME = "Receptbok";
const BRANCH = "main";

async function readFileFromGitHub(filename, pat) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filename}?ref=${BRANCH}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github.raw+json",
      "User-Agent": "Receptbok-App",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://jockemedw.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const pat = process.env.GITHUB_PAT;
  if (!pat) return res.status(500).json({ error: "Missing GITHUB_PAT" });

  try {
    const [weeklyPlan, shoppingList] = await Promise.all([
      readFileFromGitHub("weekly-plan.json", pat),
      readFileFromGitHub("shopping-list.json", pat),
    ]);
    return res.status(200).json({ weeklyPlan, shoppingList });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
