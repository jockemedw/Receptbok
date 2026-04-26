// Endpoint: tar emot cookie+CSRF från Chrome-extensionen och skriver till secret gist.
//
// POST /api/cookies/willys
// Headers:
//   X-Refresh-Secret: <shared secret från WILLYS_REFRESH_SECRET>
// Body:
//   { userId, cookie, csrf, storeId }
//
// Säkerhet: shared secret-header krävs. Cookies returneras aldrig i response/loggning.

import { createSecretsStore } from "../_shared/secrets-store.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Refresh-Secret");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metod ej tillåten" });

  const expectedSecret = process.env.WILLYS_REFRESH_SECRET;
  const pat = process.env.GITHUB_PAT;
  const gistId = process.env.WILLYS_SECRETS_GIST_ID;
  if (!expectedSecret || !pat || !gistId) {
    return res.status(500).json({ error: "Server saknar konfiguration (env vars)." });
  }

  const store = createSecretsStore({ pat, gistId });
  const result = await runRefresh({
    secretHeader: req.headers["x-refresh-secret"],
    expectedSecret,
    payload: req.body || {},
    store,
  });
  return res.status(result.status).json(result.body);
}

// Ren funktion — exporterad för test. Sidoeffekter sker bara via store.writeUser.
export async function runRefresh({ secretHeader, expectedSecret, payload, store }) {
  if (!secretHeader || secretHeader !== expectedSecret) {
    return { status: 401, body: { error: "unauthorized" } };
  }
  const { userId, cookie, csrf, storeId } = payload;
  if (!userId || typeof userId !== "string") {
    return { status: 400, body: { error: "bad_request", field: "userId" } };
  }
  if (!cookie || typeof cookie !== "string") {
    return { status: 400, body: { error: "bad_request", field: "cookie" } };
  }
  if (!csrf || typeof csrf !== "string") {
    return { status: 400, body: { error: "bad_request", field: "csrf" } };
  }
  if (!storeId || typeof storeId !== "string") {
    return { status: 400, body: { error: "bad_request", field: "storeId" } };
  }
  try {
    const written = await store.writeUser(userId, { cookie, csrf, storeId });
    return { status: 200, body: { ok: true, updatedAt: written.updatedAt } };
  } catch (err) {
    console.error("cookies/willys store error:", err?.message || err);
    return { status: 502, body: { error: "store_write_failed" } };
  }
}
