import { createClient } from "@supabase/supabase-js";

// Service-role-klient för backend-operationer — kringgår RLS.
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY injiceras av Vercel-Supabase-integrationen.
//
// Lazy-initialisering via Proxy: createClient() anropas inte vid import-tid utan
// först när db.from(...) eller liknande anropas. Förhindrar krasch i testmiljöer
// där env vars inte är satta.
let _db = null;

function getOrCreateDb() {
  if (!_db) {
    _db = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
  }
  return _db;
}

export const db = new Proxy({}, {
  get(_, prop) {
    return getOrCreateDb()[prop];
  },
});

// Hämtar household_id för v1-familjeappen (en household i systemet).
// Kan utökas till att ta emot ett user-token när appen växer till multi-family.
export async function getHouseholdId() {
  const { data, error } = await db
    .from("households")
    .select("id")
    .limit(1)
    .single();
  if (error || !data) throw new Error("Hittade ingen household — kör migrationen först.");
  return data.id;
}
