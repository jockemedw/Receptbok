// PoC: kan vi logga in på hemkop.se server-side med användarnamn + lösenord?
//
// Bakgrund: dispatchen autentiserar idag med cookies som skördas ur webbläsaren
// av en Chrome-extension. Det mönstret valdes för Willys, där inloggningen går
// via BankID. Hemköp har vanlig lösenordsinloggning — om den går att göra
// server-side försvinner både extensionen och den 3-månaders cookie-förnyelsen
// för Hemköps del. `scripts/hemkop-cart-poc.mjs` bevisade redan att korgen
// fungerar med en giltig session; den här PoC:n handlar BARA om att skaffa en.
//
// Körs manuellt:  node scripts/hemkop-login-poc.mjs
// Cred-fil (gitignorerad):  scripts/.hemkop-login.local
//     { "username": "din@epost.se", "password": "..." }
//
// ── SÄKERHETSREGLER (läs innan du ändrar något här) ────────────────────────
//  1. MAX ETT inloggningsförsök med riktiga uppgifter per körning. Upprepade
//     felförsök är det realistiska sättet att bli utelåst ur sitt eget konto.
//  2. Kandidat-endpoints provas i tur och ordning, MEN bara så länge svaret
//     betyder "den här endpointen finns inte" (404/405). Så fort en endpoint
//     svarar att uppgifterna är fel (401/403) STANNAR vi — då har vi förbrukat
//     vårt enda försök, och nästa endpoint skulle bli försök nummer två.
//  3. Lösenordet skrivs aldrig ut, loggas aldrig, sparas aldrig i en logg-fil.
//  4. Ingen checkout, inga varor läggs i korgen, inget beställs.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = "https://www.hemkop.se";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CREDS_FILE = join(SCRIPT_DIR, ".hemkop-login.local");

// ── Cookie-hantering ────────────────────────────────────────────────────────
// En enkel jar: vi måste bära JSESSIONID från inloggningssidan in i POST:en och
// vidare till cart-anropet, precis som en webbläsare gör.
function makeJar() {
  const jar = new Map();
  return {
    absorb(res) {
      // Node samlar flera Set-Cookie i getSetCookie() (Node 20+).
      const raw = res.headers.getSetCookie?.() || [];
      for (const line of raw) {
        const [pair] = line.split(";");
        const idx = pair.indexOf("=");
        if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    },
    header() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    has(name) { return jar.has(name); },
    get(name) { return jar.get(name); },
    names() { return [...jar.keys()]; },
  };
}

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

async function loadCreds() {
  let raw;
  try {
    raw = await readFile(CREDS_FILE, "utf8");
  } catch {
    throw new Error(
      `Hittar inte ${CREDS_FILE}.\n` +
      `Skapa den med:  { "username": "din@epost.se", "password": "..." }\n` +
      `(filen är gitignorerad och ska aldrig committas)`
    );
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`${CREDS_FILE} är inte giltig JSON.`); }
  for (const f of ["username", "password"]) {
    if (!parsed[f] || typeof parsed[f] !== "string") {
      throw new Error(`${CREDS_FILE} saknar fältet "${f}" (eller det är tomt).`);
    }
  }
  return parsed;
}

async function preview(res, n = 300) {
  try { return (await res.text()).slice(0, n).replace(/\s+/g, " "); }
  catch { return "(kunde inte läsa kropp)"; }
}

// ── Steg 1: hämta inloggningssidan → session + ev. CSRF-token ───────────────
async function fetchLoginPage(jar) {
  const res = await fetch(`${BASE}/login`, { method: "GET", headers: headers(jar) });
  jar.absorb(res);
  const html = await res.text();

  // Hybris lägger normalt CSRF-token i en meta-tagg eller ett doldt formulärfält.
  const meta = html.match(/name="_csrf"[^>]*content="([^"]+)"/i)?.[1]
    || html.match(/content="([^"]+)"[^>]*name="_csrf"/i)?.[1]
    || html.match(/name="CSRFToken"[^>]*value="([^"]+)"/i)?.[1]
    || null;

  console.log(`[1] GET /login → ${res.status}`);
  console.log(`    cookies: ${jar.names().join(", ") || "(inga)"}`);
  console.log(`    JSESSIONID: ${jar.has("JSESSIONID") ? "JA" : "NEJ"}`);
  console.log(`    CSRF i HTML: ${meta ? "JA" : "nej (hämtas troligen via XHR)"}`);

  // Tecken på OTP/captcha/BankID redan på sidan = kill-kriterium.
  const flags = ["recaptcha", "hcaptcha", "captcha", "bankid", "engångskod", "one-time"]
    .filter((f) => html.toLowerCase().includes(f));
  if (flags.length) console.log(`    ⚠ sidan nämner: ${flags.join(", ")}`);

  return { csrf: meta, html };
}

// ── Steg 2: prova kandidat-endpoints ───────────────────────────────────────
// Returnerar { tried, outcome } där outcome är "success" | "rejected" | "none".
const CANDIDATES = [
  {
    name: "POST /axfood/rest/customer/login (JSON)",
    async run(jar, creds, csrf) {
      return fetch(`${BASE}/axfood/rest/customer/login`, {
        method: "POST",
        headers: headers(jar, {
          "content-type": "application/json",
          "origin": BASE,
          "referer": `${BASE}/login`,
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        }),
        body: JSON.stringify({ username: creds.username, password: creds.password }),
        redirect: "manual",
      });
    },
  },
  {
    name: "POST /j_spring_security_check (form)",
    async run(jar, creds, csrf) {
      const form = new URLSearchParams({
        j_username: creds.username,
        j_password: creds.password,
        ...(csrf ? { CSRFToken: csrf } : {}),
      });
      return fetch(`${BASE}/j_spring_security_check`, {
        method: "POST",
        headers: headers(jar, {
          "content-type": "application/x-www-form-urlencoded",
          "origin": BASE,
          "referer": `${BASE}/login`,
        }),
        body: form.toString(),
        redirect: "manual",
      });
    },
  },
];

// 404/405/501 = endpointen finns inte här → säkert att prova nästa kandidat.
// Allt annat betyder att endpointen tog emot vårt försök.
function endpointMissing(status) {
  return status === 404 || status === 405 || status === 501;
}

async function tryLogin(jar, creds, csrf) {
  for (const cand of CANDIDATES) {
    let res;
    try {
      res = await cand.run(jar, creds, csrf);
    } catch (err) {
      console.log(`[2] ${cand.name} → nätverksfel: ${err.message}`);
      continue;
    }
    jar.absorb(res);
    const loc = res.headers.get("location") || "";
    console.log(`[2] ${cand.name} → ${res.status}${loc ? ` → ${loc}` : ""}`);

    if (endpointMissing(res.status)) {
      console.log(`    endpointen finns inte — provar nästa kandidat (inget inloggningsförsök förbrukat)`);
      continue;
    }

    // Härifrån har vi förbrukat vårt ENDA försök, oavsett utfall.
    const body = await preview(res);
    if (body) console.log(`    svar: ${body}`);
    if (/login\?error|badCredentials|felaktig/i.test(body + loc) || res.status === 401 || res.status === 403) {
      console.log(`    ⛔ uppgifterna avvisades — STANNAR (provar INTE nästa kandidat, kontolåsningsskydd)`);
      return { tried: cand.name, outcome: "rejected" };
    }
    return { tried: cand.name, outcome: "accepted" };
  }
  return { tried: null, outcome: "none" };
}

// ── Steg 3: är sessionen verkligen inloggad? ───────────────────────────────
async function verifySession(jar) {
  const res = await fetch(`${BASE}/axfood/rest/cart`, { method: "GET", headers: headers(jar) });
  jar.absorb(res);
  const csrfHeader = res.headers.get("x-csrf-token");
  console.log(`[3] GET /axfood/rest/cart → ${res.status}`);
  if (csrfHeader) console.log(`    x-csrf-token i svaret: JA (${csrfHeader.length} tecken)`);

  if (res.status !== 200) {
    console.log(`    svar: ${await preview(res)}`);
    return { ok: false, csrf: csrfHeader };
  }
  let json = null;
  try { json = JSON.parse(await res.text()); } catch { /* inte JSON */ }
  // En inloggad korg bär kundinfo; en anonym gör det inte.
  const looksLoggedIn = !!(json?.customer || json?.user || json?.userId || json?.potentialOrderPromotions);
  console.log(`    korgen ser ${looksLoggedIn ? "INLOGGAD" : "anonym"} ut`);
  return { ok: true, loggedIn: looksLoggedIn, csrf: csrfHeader };
}

async function main() {
  console.log("Hemköp login-PoC — ETT inloggningsförsök, ingen retry, inga varor läggs i korgen.\n");
  const creds = await loadCreds();
  console.log(`Användare: ${creds.username.replace(/(.{2}).*(@.*)/, "$1***$2")}\n`);

  const jar = makeJar();
  const { csrf } = await fetchLoginPage(jar);
  console.log();

  const { tried, outcome } = await tryLogin(jar, creds, csrf);
  console.log();

  if (outcome === "none") {
    console.log("RESULTAT: ingen kandidat-endpoint fanns. Öppna DevTools på hemkop.se/login,");
    console.log("logga in manuellt och titta vilket anrop som går iväg — lägg till det i CANDIDATES.");
    process.exit(2);
  }
  if (outcome === "rejected") {
    console.log("RESULTAT: uppgifterna avvisades. Kontrollera lösenordet MANUELLT i webbläsaren");
    console.log("innan du kör igen — fler automatiska försök riskerar att låsa kontot.");
    process.exit(1);
  }

  const session = await verifySession(jar);
  console.log();
  if (session.ok && session.loggedIn) {
    console.log(`✅ PASS — ${tried} gav en inloggad session.`);
    console.log(`   CSRF-källa: ${session.csrf ? "svarsheader från /axfood/rest/cart" : csrf ? "meta-tagg i /login" : "OKÄND — måste lösas innan bygget"}`);
    console.log("   Vägen är farbar: bygg vidare enligt planen.");
    process.exit(0);
  }
  console.log("❌ FAIL — inloggningen såg ut att gå igenom men sessionen är inte autentiserad.");
  console.log("   Troligen krävs ytterligare ett steg (OTP, device-check) → kill-kriteriet gäller.");
  process.exit(1);
}

main().catch((err) => {
  console.error(`\nAvbröt: ${err.message}`);
  process.exit(1);
});
