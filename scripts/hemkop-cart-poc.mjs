// PoC: verifierar om hemkop.se (Axfood-plattformen) tar emot addProducts som Willys.
// Spegling av scripts/willys-cart-poc.mjs (Session 37).
//
// Körs manuellt:  node scripts/hemkop-cart-poc.mjs [söktermin]
// Läser cookies/CSRF/butiks-ID från scripts/.hemkop-cookies.local (gitignorerad):
//   { "cookie": "<full cookie-sträng>", "csrf": "<x-csrf-token>", "storeId": "<id>" }
//
// PoC:n lägger EN vara i korgen och verifierar. Ingen checkout, ingen tömning.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = "https://www.hemkop.se";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
const CREDS_FILE = join(dirname(fileURLToPath(import.meta.url)), ".hemkop-cookies.local");

async function loadCreds() {
  let raw;
  try {
    raw = await readFile(CREDS_FILE, "utf8");
  } catch {
    throw new Error(
      `Hittar inte ${CREDS_FILE}. Skapa filen med { "cookie": "...", "csrf": "...", "storeId": "..." } ` +
      `— se docs/superpowers/specs/2026-06-22-hemkop-poc-design.md för devtools-proceduren.`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${CREDS_FILE} är inte giltig JSON.`);
  }
  for (const field of ["cookie", "csrf", "storeId"]) {
    if (!parsed[field] || typeof parsed[field] !== "string") {
      throw new Error(`${CREDS_FILE} saknar fältet "${field}" (eller det är tomt).`);
    }
  }
  return { cookie: parsed.cookie, csrf: parsed.csrf, storeId: parsed.storeId };
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
async function probeOffers(creds) {
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
    try { const d = JSON.parse(await verRes.text()); entries = d.entries || d.products || []; } catch { /* ej JSON */ }
  }
  const landed = entries.some((e) => JSON.stringify(e).includes(code.split("_")[0]));
  const codeFormat = /_(st|kg)$/i.test(code) ? "matchar <id>_ST/_KG" : `avviker: "${code}"`;
  return { pass: landed, addStatus: addRes.status, verifyStatus: verRes.status, codeFormat };
}

async function main() {
  const creds = await loadCreds();
  const term = process.argv[2] || "mjölk";
  console.log(`Hemköp-PoC mot ${BASE} (store ${creds.storeId}, sökterm "${term}")\n`);

  const rows = [];

  const pre = await probePreflight(creds);
  rows.push(["2. Auth (preflight GET /cart)", pre.pass, `status ${pre.status}`]);

  const search = await probeSearch(creds, term);
  rows.push(["4a. Sök (GET /search)", search.pass, `status ${search.status}, kod ${search.code || "—"}`]);

  const offers = await probeOffers(creds);
  rows.push(["4b. Erbjudanden (campaigns)", offers.pass, `status ${offers.status}, antal ${offers.count}`]);

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
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}  (${detail})`);
  }
  const allPass = rows.every(([, pass]) => pass);
  console.log(`\n${allPass ? "ALLA PASS — Hemköp-dispatch genomförbar." : "DELVIS/FAIL — se rader ovan + loggade rå-svar."}`);
}

main().catch((err) => {
  console.error("PoC-fel:", err?.message || err);
  process.exit(1);
});
