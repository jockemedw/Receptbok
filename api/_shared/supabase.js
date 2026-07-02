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

// Hushållets portionsmål för inköpslistan (backlog #12). Kolumnen skapas av
// db/migrations/003_target_servings.sql — saknas den (migration ej körd) eller
// är värdet orimligt returneras null, vilket betyder "ingen skalning" (exakt
// samma inköpslista som före Fas #12).
export async function fetchTargetServings(householdId) {
  try {
    const { data, error } = await db
      .from("households")
      .select("target_servings")
      .eq("id", householdId)
      .maybeSingle();
    if (error || !data) return null;
    const n = parseInt(data.target_servings, 10);
    return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
  } catch {
    return null;
  }
}
