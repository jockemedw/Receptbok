// Läser/skriver cookies+CSRF för dispatch-användare till en secret gist.
// Används av:
//   - api/cookies/willys.js  → writeUser (Chrome-extension postar cookies hit)
//   - api/dispatch-to-willys.js → readUser (cart-anrop till Willys)
//
// Cache: 5 min in-memory (TTL-baserad). Minskar GitHub-API-anrop när dispatch
// körs flera gånger inom kort tid.

const GIST_API = "https://api.github.com/gists";
const SECRETS_FILE = "willys-secrets.json";

export function createSecretsStore({ fetchImpl = fetch, pat, gistId, ttlMs = 5 * 60 * 1000 }) {
  let cache = null; // { data, fetchedAt }

  async function fetchGist() {
    const res = await fetchImpl(`${GIST_API}/${gistId}`, {
      headers: {
        Authorization: `token ${pat}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) throw new Error(`Kunde inte läsa secret gist (${res.status}).`);
    const data = await res.json();
    const file = data.files?.[SECRETS_FILE];
    if (!file) return { users: {} };
    try {
      return JSON.parse(file.content);
    } catch {
      return { users: {} };
    }
  }

  async function getData() {
    const now = Date.now();
    if (cache && now - cache.fetchedAt < ttlMs) {
      return cache.data;
    }
    const data = await fetchGist();
    cache = { data, fetchedAt: now };
    return data;
  }

  async function readUser(userId) {
    const data = await getData();
    const user = data.users?.[userId];
    return user || null;
  }

  async function writeUser(userId, { cookie, csrf, storeId }) {
    const data = await fetchGist();
    if (!data.users) data.users = {};
    data.users[userId] = {
      cookie,
      csrf,
      storeId,
      updatedAt: new Date().toISOString(),
    };
    const res = await fetchImpl(`${GIST_API}/${gistId}`, {
      method: "PATCH",
      headers: {
        Authorization: `token ${pat}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: {
          [SECRETS_FILE]: { content: JSON.stringify(data, null, 2) },
        },
      }),
    });
    if (!res.ok) throw new Error(`Kunde inte skriva secret gist (${res.status}).`);
    cache = { data, fetchedAt: Date.now() };
    return data.users[userId];
  }

  function clearCache() {
    cache = null;
  }

  return { readUser, writeUser, clearCache };
}
