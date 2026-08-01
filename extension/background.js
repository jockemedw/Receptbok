// Service worker: fångar CSRF passivt + skickar cookies+CSRF till Vercel-endpointen.
// Hanterar flera Axfood-butiker (willys.se + hemkop.se) med separat state per butik —
// en Willys-cookie fungerar inte mot Hemköp, så de måste hållas isär hela vägen.
//
// Trigger-källor:
//   - webRequest.onSendHeaders för butikernas domäner → sparar x-csrf-token per butik
//   - alarms.onAlarm (var 6h) → checkAndMaybeRefresh för alla butiker
//   - runtime.onStartup (browser-start) → samma
//   - runtime.onMessage type="manual-refresh" → forceRefresh för alla butiker
//
// Refresh-trösklar (utvärderas PER BUTIK — annars skulle ett färskt Willys-besök
// hindra Hemköps allra första refresh):
//   < 7 dagar  → skip (allt fräscht)
//   >= 7 dagar → POST refresh
//
// Race-skydd: refreshInFlight_<butik>-flag i chrome.storage.local med 30s TTL.

const ENDPOINT = "https://receptbok-six.vercel.app/api/dispatch-to-willys?op=refresh-cookies";
const USER_ID = "joakim";
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 dagar
const IN_FLIGHT_TTL_MS = 30_000;

// needsStoreId: bara Willys butiks-ID används av backend (rea-/campaigns-endpointen).
const STORES = [
  { id: "willys", label: "Willys", domain: "willys.se", urlPattern: "https://www.willys.se/*", needsStoreId: true },
  { id: "hemkop", label: "Hemköp", domain: "hemkop.se", urlPattern: "https://www.hemkop.se/*", needsStoreId: false },
];

const csrfKey = (store) => `csrf_${store}`;
const lastRefreshKey = (store) => `lastRefreshAt_${store}`;
const inFlightKey = (store) => `refreshInFlight_${store}`;
const lastErrorKey = (store) => `lastError_${store}`;

function storeForUrl(url) {
  return STORES.find(s => url.includes(s.domain))?.id || null;
}

// ─── Engångsmigrering av v1.0-nycklar ─────────────────────────────
// Före Hemköp-stödet fanns bara csrfToken/lastRefreshAt (underförstått Willys).
// Utan detta skulle tillägget se ut att ha glömt bort sig efter uppdateringen.
async function migrateLegacyKeys() {
  const old = await chrome.storage.local.get(["csrfToken", "lastRefreshAt", "legacyMigrated"]);
  if (old.legacyMigrated) return;
  const patch = { legacyMigrated: true };
  if (old.csrfToken) patch[csrfKey("willys")] = old.csrfToken;
  if (old.lastRefreshAt) patch[lastRefreshKey("willys")] = old.lastRefreshAt;
  await chrome.storage.local.set(patch);
}
migrateLegacyKeys().catch(err => console.error("legacy-migrering:", err));

// ─── CSRF-fångst ──────────────────────────────────────────────────
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const store = storeForUrl(details.url);
    if (!store) return;
    const csrfHeader = details.requestHeaders?.find(
      h => h.name.toLowerCase() === "x-csrf-token"
    );
    if (!csrfHeader?.value) return;
    chrome.storage.local.set({
      [csrfKey(store)]: csrfHeader.value,
      [`csrfCapturedAt_${store}`]: Date.now(),
    });
    // Försök refreshen direkt om det är dags — bara för den besökta butiken.
    checkAndMaybeRefresh(store).catch(err => console.error("csrf-trigger refresh:", err));
  },
  { urls: STORES.map(s => s.urlPattern) },
  ["requestHeaders"]
);

// ─── Periodisk check ──────────────────────────────────────────────
chrome.alarms.create("refresh-check", { periodInMinutes: 360 }); // var 6:e timme
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refresh-check") {
    refreshAll(checkAndMaybeRefresh).catch(err => console.error("alarm refresh:", err));
  }
});

chrome.runtime.onStartup.addListener(() => {
  refreshAll(checkAndMaybeRefresh).catch(err => console.error("startup refresh:", err));
});

// ─── Manuell trigger från popup ───────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "manual-refresh") {
    refreshAll(doRefresh)
      .then(results => sendResponse({ ok: true, results }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // håll response-channel öppen för async
  }
});

// ─── Refresh-flöden ───────────────────────────────────────────────

// Kör alla butiker och låter en butiks fel inte stoppa den andra.
async function refreshAll(fn) {
  const out = {};
  for (const s of STORES) {
    try {
      out[s.id] = await fn(s.id);
    } catch (err) {
      out[s.id] = { ok: false, error: err.message };
    }
  }
  return out;
}

async function checkAndMaybeRefresh(store) {
  const data = await chrome.storage.local.get([lastRefreshKey(store)]);
  const last = data[lastRefreshKey(store)];
  const ageMs = last ? Date.now() - new Date(last).getTime() : Infinity;
  if (ageMs < REFRESH_THRESHOLD_MS) return { ok: true, skipped: "fresh" };
  return doRefresh(store);
}

async function doRefresh(store) {
  const shop = STORES.find(s => s.id === store);
  if (!shop) return { ok: false, error: "unknown_store" };

  // Race-skydd är "best-effort": chrome.storage.local saknar atomic CAS, så
  // två triggers (t.ex. webRequest + alarm) i samma tick kan båda läsa null
  // och båda POSTa. Sannolikheten är låg vid 6h-cadence + endpointen är
  // idempotent (last-write-wins på gist). TTL:en (30s) säkerställer också
  // att flagan självläker om service worker dör mid-fetch.
  const inFlight = await chrome.storage.local.get([inFlightKey(store)]);
  const startedAt = inFlight[inFlightKey(store)];
  if (startedAt && Date.now() - startedAt < IN_FLIGHT_TTL_MS) {
    return { ok: true, skipped: "in_flight" };
  }
  await chrome.storage.local.set({ [inFlightKey(store)]: Date.now() });

  try {
    const settings = await chrome.storage.local.get(["secret", "storeId", csrfKey(store)]);
    if (!settings.secret) {
      await chrome.storage.local.set({ [lastErrorKey(store)]: "Shared secret saknas — öppna inställningar." });
      return { ok: false, error: "missing_secret" };
    }
    const csrf = settings[csrfKey(store)];
    if (!csrf) {
      await chrome.storage.local.set({ [lastErrorKey(store)]: `Ingen CSRF fångad än — besök ${shop.domain}.` });
      return { ok: false, error: "missing_csrf" };
    }

    const cookies = await chrome.cookies.getAll({ domain: shop.domain });
    if (!cookies.length) {
      await chrome.storage.local.set({ [lastErrorKey(store)]: `Inga cookies — logga in på ${shop.domain}.` });
      return { ok: false, error: "no_cookies" };
    }
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join("; ");

    const body = {
      userId: USER_ID,
      store: shop.id,
      cookie: cookieStr,
      csrf,
    };
    if (shop.needsStoreId) body.storeId = settings.storeId || "2160";

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Refresh-Secret": settings.secret,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      await chrome.storage.local.set({
        [lastErrorKey(store)]: `Endpoint svarade ${res.status} ${text.slice(0, 60)}`,
      });
      return { ok: false, error: `endpoint_${res.status}` };
    }

    const data = await res.json();
    await chrome.storage.local.set({
      [lastRefreshKey(store)]: data.updatedAt || new Date().toISOString(),
      [lastErrorKey(store)]: null,
    });
    return { ok: true, updatedAt: data.updatedAt };
  } catch (err) {
    await chrome.storage.local.set({ [lastErrorKey(store)]: `Network: ${err.message}` });
    return { ok: false, error: err.message };
  } finally {
    await chrome.storage.local.set({ [inFlightKey(store)]: null });
  }
}
