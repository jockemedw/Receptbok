// PoC: verifierar om hemkop.se (Axfood-plattformen) tar emot addProducts som Willys.
// Spegling av scripts/willys-cart-poc.mjs (Session 37).
//
// Körs manuellt:  node scripts/hemkop-cart-poc.mjs [söktermin]
// Cred-källor (i prioritetsordning, båda gitignorerade):
//   1. scripts/.hemkop-curl.local  — rå "Copy as cURL" (Windows-cmd) från addProducts-anropet.
//      cookie + x-csrf-token parsas ut automatiskt. Butiks-ID kan inte härledas härur.
//   2. scripts/.hemkop-cookies.local — JSON { "cookie", "csrf", "storeId" }.
// storeId är valfritt; saknas det hoppas erbjudande-proben (ej kärnan i frågan).
//
// PoC:n lägger EN vara i korgen och verifierar. Ingen checkout, ingen tömning.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = "https://www.hemkop.se";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CREDS_FILE = join(SCRIPT_DIR, ".hemkop-cookies.local");
const CURL_FILE = join(SCRIPT_DIR, ".hemkop-curl.local");

// Plockar cookie + x-csrf-token ur en rå Windows-cmd "Copy as cURL".
// Chrome-cmd escapar varje specialtecken med caret (^); att ta bort alla
// caret-tecken återställer den avsedda strängen ( ^%^2F → %2F, ^" → " osv).
function parseCurl(raw) {
  const clean = raw.replace(/\^/g, "");
  const cookie = clean.match(/-b "([^"]+)"/)?.[1];
  const csrf = clean.match(/-H "x-csrf-token:\s*([^"]+)"/i)?.[1];
  if (!cookie) throw new Error(`${CURL_FILE} saknar en -b "..."-cookie-sträng.`);
  if (!csrf) throw new Error(`${CURL_FILE} saknar en x-csrf-token-header.`);
  return { cookie, csrf, storeId: null };
}

async function loadCreds() {
  // 1. cURL-fil (om den finns) — parsa cookie + csrf.
  try {
    const raw = await readFile(CURL_FILE, "utf8");
    return parseCurl(raw);
  } catch (err) {
    if (err.code !== "ENOENT") throw err; // parse-fel ska bubbla upp
  }
  // 2. JSON-fil.
  let raw;
  try {
    raw = await readFile(CREDS_FILE, "utf8");
  } catch {
    throw new Error(
      `Hittar varken ${CURL_FILE} eller ${CREDS_FILE}. Klistra in "Copy as cURL" i den förra, ` +
      `eller skapa den senare med { "cookie": "...", "csrf": "...", "storeId": "..." }.`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${CREDS_FILE} är inte giltig JSON.`);
  }
  for (const field of ["cookie", "csrf"]) {
    if (!parsed[field] || typeof parsed[field] !== "string") {
      throw new Error(`${CREDS_FILE} saknar fältet "${field}" (eller det är tomt).`);
    }
  }
  return { cookie: parsed.cookie, csrf: parsed.csrf, storeId: parsed.storeId || null };
}

function baseHeaders(creds, extra = {}) {
  return {
    "user-agent": UA,
    "accept": "*/*",
    "accept-language": "sv-SE,sv;q=0.9",
    "cookie": creds.cookie,
    ...extra,
  };
}

// Trunkerar en svarskropp för loggning (avslöjar inga cookies — det är upstream-svar).
async function bodyPreview(res) {
  try {
    const text = await res.text();
    return text.slice(0, 300);
  } catch {
    return "(kunde inte läsa kropp)";
  }
}

// [2] Auth-modell: GET /axfood/rest/cart med cookies → 200 = auth funkar.
async function probePreflight(creds) {
  const res = await fetch(`${BASE}/axfood/rest/cart`, { method: "GET", headers: baseHeaders(creds) });
  const pass = res.status === 200;
  if (!pass) console.log(`  preflight oväntat svar: ${await bodyPreview(res)}`);
  return { pass, status: res.status };
}

// [4a] Sök: GET /search?q=<term> → data.results[]. Plockar första köpbara koden.
async function probeSearch(creds, term) {
  const url = `${BASE}/search?q=${encodeURIComponent(term)}&size=20`;
  const res = await fetch(url, { headers: baseHeaders(creds, { accept: "application/json" }) });
  if (res.status !== 200) {
    console.log(`  sök oväntat svar (${res.status}): ${await bodyPreview(res)}`);
    return { pass: false, status: res.status, code: null };
  }
  let data;
  try { data = JSON.parse(await res.text()); } catch { data = null; }
  const results = data?.results || [];
  const first = results.find((r) => r?.code && r.outOfStock !== true && r.online !== false) || results[0];
  const code = first?.code || null;
  if (!code) console.log(`  sök gav 200 men ingen kod i results[] (form skiljer?). Antal: ${results.length}`);
  return { pass: !!code, status: res.status, code };
}

// [4b] Erbjudanden: campaigns-endpoint med butiks-ID → kampanj-array.
// Hoppas (pass=null) om butiks-ID saknas — den frågan är sekundär.
async function probeOffers(creds) {
  if (!creds.storeId) return { pass: null, status: null, count: 0 };
  const url = `${BASE}/search/campaigns/online?q=${creds.storeId}&type=PERSONAL_GENERAL&page=0&size=500`;
  const res = await fetch(url, { headers: baseHeaders(creds, { accept: "application/json" }) });
  if (res.status !== 200) {
    console.log(`  erbjudanden oväntat svar (${res.status}): ${await bodyPreview(res)}`);
    return { pass: false, status: res.status, count: 0 };
  }
  let data;
  try { data = JSON.parse(await res.text()); } catch { data = null; }
  const count = (data?.results || []).length;
  if (count === 0) console.log(`  erbjudanden gav 200 men tom/okänd form.`);
  return { pass: count > 0, status: res.status, count };
}

// [1+3] addProducts + verify: lägg EN kod i korgen, läs tillbaka, kolla kods-format.
async function probeAddAndVerify(creds, code) {
  const pickUnit = /_kg$/i.test(code) ? "kilograms" : "pieces";
  const addRes = await fetch(`${BASE}/axfood/rest/cart/addProducts`, {
    method: "POST",
    headers: baseHeaders(creds, {
      "content-type": "application/json",
      "origin": BASE,
      "referer": `${BASE}/`,
      "x-csrf-token": creds.csrf,
    }),
    body: JSON.stringify({
      products: [{ productCodePost: code, qty: 1, pickUnit, hideDiscountToolTip: false, noReplacementFlag: false }],
    }),
  });
  if (addRes.status !== 200) {
    console.log(`  addProducts oväntat svar (${addRes.status}): ${await bodyPreview(addRes)}`);
    return { pass: false, addStatus: addRes.status, verifyStatus: null, codeFormat: null };
  }
  const verRes = await fetch(`${BASE}/axfood/rest/cart`, { method: "GET", headers: baseHeaders(creds) });
  let entries = [];
  if (verRes.status === 200) {
    let d = null;
    try { d = JSON.parse(await verRes.text()); } catch { /* ej JSON */ }
    entries = d?.entries || d?.products || [];
    if (entries.length === 0 && d) {
      console.log(`  verify: korgen saknar kända fält (entries/products) — faktiska nycklar: ${Object.keys(d).join(", ")}`);
    }
  } else {
    console.log(`  verify oväntat svar (${verRes.status}): ${await bodyPreview(verRes)}`);
  }
  const landed = entries.some((e) => JSON.stringify(e).includes(code.split("_")[0]));
  const codeFormat = /_(st|kg)$/i.test(code) ? "matchar <id>_ST/_KG" : `avviker: "${code}"`;
  return { pass: landed, addStatus: addRes.status, verifyStatus: verRes.status, codeFormat };
}

async function main() {
  const creds = await loadCreds();
  const term = process.argv[2] || "mjölk";
  console.log(`Hemköp-PoC mot ${BASE} (store ${creds.storeId || "—"}, sökterm "${term}")\n`);

  const rows = [];

  const pre = await probePreflight(creds);
  rows.push(["2. Auth (preflight GET /cart)", pre.pass, `status ${pre.status}`]);

  const search = await probeSearch(creds, term);
  rows.push(["4a. Sök (GET /search)", search.pass, `status ${search.status}, kod ${search.code || "—"}`]);

  const offers = await probeOffers(creds);
  rows.push(["4b. Erbjudanden (campaigns)", offers.pass,
    offers.pass === null ? "hoppad — inget butiks-ID i cURL" : `status ${offers.status}, antal ${offers.count}`]);

  if (search.code) {
    const av = await probeAddAndVerify(creds, search.code);
    rows.push(["1. Korg (POST addProducts)", av.addStatus === 200, `addStatus ${av.addStatus}`]);
    rows.push(["3. Verify + kods-format", av.pass, `verify ${av.verifyStatus ?? "—"}, ${av.codeFormat ?? "—"}`]);
  } else {
    rows.push(["1. Korg (POST addProducts)", false, "hoppad — ingen kod från sök"]);
    rows.push(["3. Verify + kods-format", false, "hoppad — ingen kod från sök"]);
  }

  console.log("\n─── Sammanfattning ───");
  for (const [label, pass, detail] of rows) {
    const tag = pass === null ? "SKIP" : pass ? "PASS" : "FAIL";
    console.log(`  ${tag}  ${label}  (${detail})`);
  }
  // SKIP-rader (null) räknas inte mot verdict:et — bara äkta PASS/FAIL.
  const graded = rows.filter(([, pass]) => pass !== null);
  const allPass = graded.every(([, pass]) => pass);
  console.log(`\n${allPass ? "ALLA PASS — Hemköp-dispatch genomförbar." : "DELVIS/FAIL — se rader ovan + loggade rå-svar."}`);
}

main().catch((err) => {
  console.error("PoC-fel:", err?.message || err);
  process.exit(1);
});
