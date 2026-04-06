import { REPO_OWNER, REPO_NAME, BRANCH } from "./constants.js";

const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;

function authHeaders(pat) {
  return {
    Authorization: `token ${pat}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
  };
}

/**
 * Laeser en JSON-fil via GitHub API (kringgaar CDN-cache).
 * Returnerar { content (parsed JSON), sha }.
 */
export async function readFile(path, pat) {
  const url = `${API_BASE}/${path}?t=${Date.now()}`;
  const res = await fetch(url, { headers: authHeaders(pat) });
  if (!res.ok) throw new Error(`Kunde inte laesa ${path}.`);
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
  return { content, sha: data.sha };
}

/**
 * Laeser en JSON-fil via raw URL (CDN-cachad, snabbare men kan vara ~60s gammal).
 * Returnerar parsed JSON.
 */
export async function readFileRaw(path) {
  const res = await fetch(`${RAW_BASE}/${path}`);
  if (!res.ok) throw new Error(`Kunde inte haemta ${path}.`);
  return res.json();
}

/**
 * Skriver en JSON-fil till GitHub med 3-foersoeks retry och SHA-konflikthantering.
 */
export async function writeFile(path, content, pat, message) {
  const url = `${API_BASE}/${path}`;
  const headers = authHeaders(pat);
  const encoded = Buffer.from(JSON.stringify(content, null, 2)).toString("base64");

  for (let attempt = 0; attempt < 3; attempt++) {
    let sha;
    const getRes = await fetch(`${url}?t=${Date.now()}`, { headers });
    if (getRes.ok) sha = (await getRes.json()).sha;

    const putRes = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({ message, content: encoded, branch: BRANCH, ...(sha ? { sha } : {}) }),
    });
    if (putRes.ok) return;
    if (putRes.status === 409 && attempt < 2) continue;
    throw new Error(`Kunde inte spara ${path} — prova igen.`);
  }
}
