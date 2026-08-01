// Läser/skriver cookies+CSRF per användare OCH butik till en secret gist.
// Används av:
//   - api/dispatch-to-willys.js?op=refresh-cookies → writeUser (extensionen postar hit)
//   - api/dispatch-to-willys.js                    → readUser (cart-anrop till butiken)
//
// Format (users[<id>].stores[<butik>] är sanningen sedan Hemköp tillkom):
//   { "users": { "joakim": {
//       "cookie": "…", "csrf": "…", "storeId": "2160", "updatedAt": "…",   ← spegling, se nedan
//       "stores": {
//         "willys": { "cookie": "…", "csrf": "…", "storeId": "2160", "updatedAt": "…" },
//         "hemkop": { "cookie": "…", "csrf": "…", "updatedAt": "…" }
//       } } } }
//
// Bakåtkompatibilitet åt båda håll:
//   - LÄSNING: saknas stores[<butik>] faller Willys (och bara Willys) tillbaka på de
//     gamla platta fälten, så befintlig dispatch fungerar innan extensionen uppdaterats.
//   - SKRIVNING: en Willys-skrivning speglas till de platta fälten, så en rollback till
//     föregående kodversion fortsätter hitta cookien utan datamigrering.
//   Hemköp har medvetet INGEN sådan fallback — det finns inget legacy-läge att ärva,
//   och att låta Hemköp läsa Willys-cookien skulle skicka varor till fel butik.
//
// Cache: 5 min in-memory (TTL-baserad) på HELA gist-innehållet — alla användare och
// butiker delar den, så ett butiksbyte kostar inget extra GitHub-anrop.
//
// Concurrency: GitHub Gists API har ingen SHA-baserad concurrency control
// (till skillnad från Contents API i _shared/github.js). Skrivningar är
// last-write-wins. För single-user single-extension-flödet är race-risken
// försumbar; writeUser läser ändå fresh state innan PATCH för att inte
// stomp:a ev. parallella users.

import { DEFAULT_STORE } from "./axfood-stores.js";

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

  async function readUser(userId, store = DEFAULT_STORE) {
    const data = await getData();
    const user = data.users?.[userId];
    if (!user) return null;

    const perStore = user.stores?.[store];
    if (perStore && perStore.cookie) return perStore;

    // Legacy-fallback: de platta fälten är per definition Willys (formatet fanns
    // innan det gick att välja butik). Andra butiker får aldrig ärva dem.
    if (store === DEFAULT_STORE && user.cookie) {
      return { cookie: user.cookie, csrf: user.csrf, storeId: user.storeId, updatedAt: user.updatedAt };
    }
    return null;
  }

  async function writeUser(userId, store, { cookie, csrf, storeId }) {
    cache = null;
    const data = await fetchGist();
    if (!data.users) data.users = {};
    if (!data.users[userId]) data.users[userId] = {};
    const user = data.users[userId];
    if (!user.stores) user.stores = {};

    const updatedAt = new Date().toISOString();
    const entry = { cookie, csrf, updatedAt };
    // storeId används bara av campaigns-endpointen (reor) och finns därför bara
    // för Willys — utelämna fältet helt i stället för att skriva undefined.
    if (storeId !== undefined && storeId !== null && storeId !== "") entry.storeId = storeId;
    user.stores[store] = entry;

    // Spegla Willys till de platta fälten så en rollback till föregående
    // kodversion (som bara känner till det formatet) fortfarande hittar cookien.
    if (store === DEFAULT_STORE) {
      user.cookie = cookie;
      user.csrf = csrf;
      user.storeId = storeId;
      user.updatedAt = updatedAt;
    }
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
