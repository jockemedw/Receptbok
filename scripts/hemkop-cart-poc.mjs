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

async function main() {
  const creds = await loadCreds();
  console.log(`Hemköp-PoC mot ${BASE} (store ${creds.storeId})\n`);
  // Probes läggs till i Task 2.
}

main().catch((err) => {
  console.error("PoC-fel:", err?.message || err);
  process.exit(1);
});
