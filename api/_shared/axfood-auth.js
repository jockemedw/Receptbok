// Lösenordsinloggning mot Axfood-plattformen (Hemköp).
//
// Ger dispatchen en färsk session utan Chrome-extensionen: samma
// { cookie, csrf }-par som `secrets-store.js` levererar från gisten, så
// `axfood-cart-client.js` fungerar oförändrat oavsett varifrån sessionen kom.
//
// Willys kan INTE använda den här vägen — där går inloggningen via BankID.
// Se `hasPasswordLogin` i axfood-stores.js.
//
// ── KONTOLÅSNINGSSKYDD (viktigast i hela filen) ────────────────────────────
// Upprepade felaktiga inloggningar är det realistiska sättet att bli utelåst ur
// sitt eget konto. Därför:
//   - Kandidat-endpoints provas i tur och ordning, men BARA så länge svaret
//     betyder "endpointen finns inte här" (404/405/501). Det är ingen
//     inloggning och kostar inget försök.
//   - Så fort en endpoint avvisar uppgifterna (401/403 eller ett felsvar som
//     nämner badCredentials) STANNAR vi och kastar. Vi provar ALDRIG nästa
//     kandidat med samma lösenord — det vore försök nummer två.
//   - Ingen intern retry. Anroparen får försöka igen först när en människa
//     rättat uppgifterna.
//
// Endpoint-ordningen är fastställd av scripts/hemkop-login-poc.mjs. Ändrar
// Hemköp sin inloggning är det den PoC:n som ska köras om, inte den här filen
// som ska gissas i.

import { STORES } from "./axfood-stores.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

// Fel som betyder "uppgifterna är fel" — dessa ska nå användaren som en
// uppmaning att rätta dem, och får aldrig utlösa ett nytt försök.
export class CredentialsRejected extends Error {
  constructor(message) {
    super(message || "Butiken avvisade användarnamnet eller lösenordet.");
    this.name = "CredentialsRejected";
    this.rejected = true;
  }
}

function endpointMissing(status) {
  return status === 404 || status === 405 || status === 501;
}

// Samlar Set-Cookie från alla steg till EN cookie-sträng, som en webbläsare.
function makeJar() {
  const jar = new Map();
  return {
    absorb(res) {
      const lines = res.headers?.getSetCookie?.() || [];
      for (const line of lines) {
        const [pair] = String(line).split(";");
        const idx = pair.indexOf("=");
        if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    },
    header() { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "); },
    size() { return jar.size; },
  };
}

export function createAuthClient({ fetchImpl = fetch, baseUrl = STORES.hemkop.baseUrl } = {}) {
  const BASE = baseUrl;

  function headers(jar, extra = {}) {
    const h = {
      "user-agent": UA,
      "accept": "*/*",
      "accept-language": "sv-SE,sv;q=0.9",
      ...extra,
    };
    const cookie = jar.header();
    if (cookie) h.cookie = cookie;
    return h;
  }

  // Hämtar inloggningssidan för att få en session att logga in I, plus en
  // ev. CSRF-token ur markupen.
  async function primeSession(jar) {
    const res = await fetchImpl(`${BASE}/login`, { method: "GET", headers: headers(jar) });
    jar.absorb(res);
    let html = "";
    try { html = await res.text(); } catch { /* tom sida duger */ }
    return html.match(/name="_csrf"[^>]*content="([^"]+)"/i)?.[1]
        || html.match(/name="CSRFToken"[^>]*value="([^"]+)"/i)?.[1]
        || null;
  }

  function candidates(jar, { username, password }, pageCsrf) {
    return [
      {
        name: "customer/login",
        run: () => fetchImpl(`${BASE}/axfood/rest/customer/login`, {
          method: "POST",
          headers: headers(jar, {
            "content-type": "application/json",
            "origin": BASE,
            "referer": `${BASE}/login`,
            ...(pageCsrf ? { "x-csrf-token": pageCsrf } : {}),
          }),
          body: JSON.stringify({ username, password }),
          redirect: "manual",
        }),
      },
      {
        name: "j_spring_security_check",
        run: () => fetchImpl(`${BASE}/j_spring_security_check`, {
          method: "POST",
          headers: headers(jar, {
            "content-type": "application/x-www-form-urlencoded",
            "origin": BASE,
            "referer": `${BASE}/login`,
          }),
          body: new URLSearchParams({
            j_username: username,
            j_password: password,
            ...(pageCsrf ? { CSRFToken: pageCsrf } : {}),
          }).toString(),
          redirect: "manual",
        }),
      },
    ];
  }

  // Bekräftar att sessionen faktiskt är inloggad OCH plockar ut CSRF-token för
  // REST-anropen. Utan båda delarna är sessionen värdelös för cart-klienten.
  async function confirm(jar) {
    const res = await fetchImpl(`${BASE}/axfood/rest/cart`, { method: "GET", headers: headers(jar) });
    jar.absorb(res);
    if (res.status !== 200) return null;
    const csrf = res.headers?.get?.("x-csrf-token") || null;
    return { csrf };
  }

  // → { cookie, csrf }  |  kastar CredentialsRejected / Error (svensk text)
  async function login({ username, password }) {
    if (!username || !password) throw new Error("Användarnamn och lösenord krävs.");

    const jar = makeJar();
    const pageCsrf = await primeSession(jar);

    let accepted = false;
    for (const cand of candidates(jar, { username, password }, pageCsrf)) {
      const res = await cand.run();
      jar.absorb(res);

      if (endpointMissing(res.status)) continue;   // inget försök förbrukat

      let body = "";
      try { body = (await res.text()).slice(0, 500); } catch { /* ingen kropp */ }
      const location = res.headers?.get?.("location") || "";
      const rejected = res.status === 401 || res.status === 403
        || /login\?error|badcredentials|felaktig/i.test(`${body} ${location}`);
      if (rejected) {
        // STANNA. Nästa kandidat vore försök nummer två med samma lösenord.
        throw new CredentialsRejected();
      }
      accepted = true;
      break;
    }

    if (!accepted) {
      throw new Error("Butikens inloggning svarade inte som väntat.");
    }

    const confirmed = await confirm(jar);
    if (!confirmed) throw new Error("Inloggningen gick igenom men sessionen blev inte giltig.");

    const cookie = jar.header();
    if (!cookie || !confirmed.csrf) {
      throw new Error("Inloggningen gav ingen användbar session.");
    }
    return { cookie, csrf: confirmed.csrf };
  }

  return { login };
}
