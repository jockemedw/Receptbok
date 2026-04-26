// Service worker: fångar CSRF passivt + skickar cookies+CSRF till Vercel-endpointen.
//
// Trigger-källor:
//   - webRequest.onSendHeaders för *.willys.se → sparar x-csrf-token
//   - alarms.onAlarm (var 6h) → checkAndMaybeRefresh
//   - runtime.onStartup (browser-start) → checkAndMaybeRefresh
//   - runtime.onMessage type="manual-refresh" → forceRefresh
//
// Refresh-trösklar:
//   < 7 dagar  → skip (allt fräscht)
//   >= 7 dagar → POST refresh
//
// Race-skydd: refresh_in_flight-flag i chrome.storage.local med 30s TTL.

const ENDPOINT = "https://receptbok-six.vercel.app/api/dispatch-to-willys?op=refresh-cookies";
const USER_ID = "joakim";
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 dagar
const IN_FLIGHT_TTL_MS = 30_000;

// ─── CSRF-fångst ──────────────────────────────────────────────────
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const csrfHeader = details.requestHeaders?.find(
      h => h.name.toLowerCase() === "x-csrf-token"
    );
    if (!csrfHeader?.value) return;
    chrome.storage.local.set({
      csrfToken: csrfHeader.value,
      csrfCapturedAt: Date.now(),
    });
    // Försök refreshen direkt om det är dags
    checkAndMaybeRefresh().catch(err => console.error("csrf-trigger refresh:", err));
  },
  { urls: ["https://www.willys.se/*"] },
  ["requestHeaders"]
);

// ─── Periodisk check ──────────────────────────────────────────────
chrome.alarms.create("refresh-check", { periodInMinutes: 360 }); // var 6:e timme
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refresh-check") {
    checkAndMaybeRefresh().catch(err => console.error("alarm refresh:", err));
  }
});

chrome.runtime.onStartup.addListener(() => {
  checkAndMaybeRefresh().catch(err => console.error("startup refresh:", err));
});

// ─── Manuell trigger från popup ───────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "manual-refresh") {
    forceRefresh()
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // håll response-channel öppen för async
  }
});

// ─── Refresh-flöden ───────────────────────────────────────────────

async function checkAndMaybeRefresh() {
  const data = await chrome.storage.local.get(["lastRefreshAt"]);
  const ageMs = data.lastRefreshAt ? Date.now() - new Date(data.lastRefreshAt).getTime() : Infinity;
  if (ageMs < REFRESH_THRESHOLD_MS) return { ok: true, skipped: "fresh" };
  return doRefresh();
}

async function forceRefresh() {
  return doRefresh();
}

async function doRefresh() {
  // Race-skydd är "best-effort": chrome.storage.local saknar atomic CAS, så
  // två triggers (t.ex. webRequest + alarm) i samma tick kan båda läsa null
  // och båda POSTa. Sannolikheten är låg vid 6h-cadence + endpointen är
  // idempotent (last-write-wins på gist). TTL:en (30s) säkerställer också
  // att flagan självläker om service worker dör mid-fetch.
  const inFlight = await chrome.storage.local.get(["refreshInFlight"]);
  if (inFlight.refreshInFlight && Date.now() - inFlight.refreshInFlight < IN_FLIGHT_TTL_MS) {
    return { ok: true, skipped: "in_flight" };
  }
  await chrome.storage.local.set({ refreshInFlight: Date.now() });

  try {
    const settings = await chrome.storage.local.get(["secret", "storeId", "csrfToken"]);
    if (!settings.secret) {
      await chrome.storage.local.set({ lastError: "Shared secret saknas — öppna inställningar." });
      return { ok: false, error: "missing_secret" };
    }
    if (!settings.csrfToken) {
      await chrome.storage.local.set({ lastError: "Ingen CSRF fångad än — besök willys.se." });
      return { ok: false, error: "missing_csrf" };
    }

    const cookies = await chrome.cookies.getAll({ domain: "willys.se" });
    if (!cookies.length) {
      await chrome.storage.local.set({ lastError: "Inga cookies — logga in på willys.se." });
      return { ok: false, error: "no_cookies" };
    }
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join("; ");

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Refresh-Secret": settings.secret,
      },
      body: JSON.stringify({
        userId: USER_ID,
        cookie: cookieStr,
        csrf: settings.csrfToken,
        storeId: settings.storeId || "2160",
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      await chrome.storage.local.set({
        lastError: `Endpoint svarade ${res.status} ${body.slice(0, 60)}`,
      });
      return { ok: false, error: `endpoint_${res.status}` };
    }

    const data = await res.json();
    await chrome.storage.local.set({
      lastRefreshAt: data.updatedAt || new Date().toISOString(),
      lastError: null,
    });
    return { ok: true, updatedAt: data.updatedAt };
  } catch (err) {
    await chrome.storage.local.set({ lastError: `Network: ${err.message}` });
    return { ok: false, error: err.message };
  } finally {
    await chrome.storage.local.set({ refreshInFlight: null });
  }
}
