// Läser/skriver hushållets butiksinloggningar (db/migrations/010_store_credentials.sql).
//
// Lösenordet är krypterat i vila (api/_shared/crypto-box.js) med en nyckel som
// bor i Vercels env, aldrig i databasen. Klartexten finns bara i minnet i api/,
// under den millisekund det tar att skicka den vidare till butikens inloggning.
//
// Rollout-säkerhet (samma mönster som pantry_items): saknas tabellen behandlas
// det som "inga sparade uppgifter" → dispatchen fortsätter använda den skördade
// cookien precis som idag. Ingen kodändring behövs när migrationen väl körts.

import { db } from "./supabase.js";
import { encrypt, decrypt, getKey } from "./crypto-box.js";

// PostgREST-koden för "relationen finns inte".
function isMissingTable(error) {
  return error?.code === "42P01" || /does not exist/i.test(error?.message || "");
}

export async function saveCredentials({ householdId, store, username, password, database = db, env = process.env }) {
  const key = getKey(env);
  const row = {
    household_id: householdId,
    store,
    username,
    password_enc: encrypt(password, key),
    updated_at: new Date().toISOString(),
  };
  const { error } = await database.from("store_credentials").upsert(row, { onConflict: "household_id,store" });
  if (error) {
    // Samma resonemang som STORE_CRED_KEY-kontrollen i dispatch-to-willys.js:
    // bara en administratör kan hamna här, och då hjälper det exakta namnet.
    if (isMissingTable(error)) throw new Error("Butiksinloggningar är inte aktiverade än — migration 010_store_credentials.sql är inte körd.");
    throw new Error("Kunde inte spara inloggningen — prova igen.");
  }
  return { store, username, updatedAt: row.updated_at };
}

export async function clearCredentials({ householdId, store, database = db }) {
  const { error } = await database
    .from("store_credentials")
    .delete()
    .eq("household_id", householdId)
    .eq("store", store);
  if (error && !isMissingTable(error)) throw new Error("Kunde inte ta bort inloggningen — prova igen.");
  return { ok: true };
}

// → { username, password } | null. Dekrypteringsfel (fel/roterad nyckel) ger
// null i stället för att kasta: dispatchen ska falla tillbaka på cookien och
// säga "behöver kopplas", inte krascha.
export async function readCredentials({ householdId, store, database = db, env = process.env }) {
  const { data, error } = await database
    .from("store_credentials")
    .select("username, password_enc")
    .eq("household_id", householdId)
    .eq("store", store)
    .maybeSingle();
  if (error || !data) return null;

  try {
    return { username: data.username, password: decrypt(data.password_enc, getKey(env)) };
  } catch (err) {
    console.error(`store-credentials: kunde inte dekryptera ${store}-lösenordet:`, err?.message || err);
    return null;
  }
}

// Status till UI:t — vilka butiker som är kopplade, UTAN att röra lösenordet.
// Returnerar en Map<store, {username, updatedAt}>.
export async function credentialStatus({ householdId, database = db }) {
  const { data, error } = await database
    .from("store_credentials")
    .select("store, username, updated_at")
    .eq("household_id", householdId);
  if (error || !data) return new Map();
  return new Map(data.map((r) => [r.store, { username: r.username, updatedAt: r.updated_at }]));
}
