// Symmetrisk kryptering för hemligheter som måste kunna läsas tillbaka i klartext
// (till skillnad från lösenord vi själva verifierar, som ska hashas och aldrig
// dekrypteras). Butiksinloggningar hör till den första kategorin: vi måste kunna
// skicka lösenordet vidare till Hemköp vid varje inloggning.
//
// AES-256-GCM: krypterar OCH autentiserar. Ett manipulerat ciphertext ger ett
// kastat fel i stället för skräp-plaintext.
//
// Nyckeln kommer från env (STORE_CRED_KEY), aldrig från databasen. Det är hela
// poängen: en databasdump ensam räcker inte för att läsa lösenorden — man
// behöver även Vercel-miljön. Skyddet gäller INTE mot någon som redan kan köra
// kod i api/ (då är nyckeln läsbar) — det är en medveten avgränsning.
//
// Generera en nyckel:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;   // GCM-standard
const KEY_BYTES = 32;  // AES-256

// Lagringsformat: "v1.<iv>.<tag>.<ciphertext>", alla delar base64url.
// Versionsprefixet gör det möjligt att byta algoritm senare utan att gissa.
const VERSION = "v1";

export function getKey(env = process.env) {
  const raw = env.STORE_CRED_KEY;
  if (!raw) throw new Error("STORE_CRED_KEY saknas i env");
  let key;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error("STORE_CRED_KEY är inte giltig base64");
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(`STORE_CRED_KEY måste vara ${KEY_BYTES} byte base64-kodat (är ${key.length})`);
  }
  return key;
}

export function encrypt(plaintext, key) {
  if (typeof plaintext !== "string" || plaintext === "") {
    throw new Error("Inget att kryptera");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decrypt(packed, key) {
  if (typeof packed !== "string") throw new Error("Krypterat värde saknas");
  const parts = packed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Krypterat värde har okänt format");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  // GCM kastar här om nyckeln är fel eller datat manipulerat — vi översätter
  // inte felet, anroparen ska behandla det som "går inte att läsa".
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8");
}
