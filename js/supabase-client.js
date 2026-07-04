// Supabase-klient — singleton som hela frontend delar.
// SUPABASE_URL + publishable key är medvetet hårdkodade — anon-nivån
// skyddas av RLS (sektion 3 i 2026-05-16-supabase-migration-design.md).

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://zqeznveicagqwblltvsa.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_aB6kIJA9j4fyGZ7Df_GEZQ_rDeHjZ5x';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

export const db = supabase;
export const auth = supabase.auth;

// Supabase free-tier pausar databasen efter ~1 veckas inaktivitet (se
// CLAUDE.md → Arkitektur). Då failar anropen på nätverksnivå (fetch kastar)
// eller gatewayen svarar 5xx — det är inte användarens fel och går över av
// sig självt när projektet vaknar (~30 sek). De här hjälparna låter UI:t
// skilja "databasen vilar" från riktiga fel och säga det på svenska.
export const DB_RESTING_MESSAGE =
  'Appen har vilat en stund och databasen håller på att vakna. Vänta en halv minut och prova sedan igen.';

export function isDbUnreachable(err) {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  if (/failed to fetch|load failed|networkerror|network request failed|fetch failed|timed out|timeout/.test(msg)) return true;
  const status = typeof err.status === 'number' ? err.status : null;
  return status !== null && status >= 500;
}

let _lastDbError = null;
export function getLastDbError() { return _lastDbError; }

let _householdIdCache = null;
let _householdIdPromise = null;

export async function getHouseholdId() {
  if (_householdIdCache) return _householdIdCache;
  if (_householdIdPromise) return _householdIdPromise;

  _householdIdPromise = (async () => {
    // getSession läser från localStorage (inget nätverksanrop) — snabbare än getUser().
    const { data: { session } } = await auth.getSession();
    const user = session?.user || null;

    // Snabb väg: household_id är stabilt per användare → cacha mellan sidladdningar
    // så vi slipper en extra nätverksrunda vid varje omladdning.
    const lsKey = user ? `hh:${user.id}` : null;
    if (lsKey) {
      const stored = localStorage.getItem(lsKey);
      if (stored) { _householdIdCache = stored; return stored; }
    }

    let q = supabase.from('household_members').select('household_id').limit(1).maybeSingle();
    if (user) q = q.eq('user_id', user.id);
    const { data, error } = await q;
    _lastDbError = error || null;
    if (error || !data) return null;
    _householdIdCache = data.household_id;
    if (lsKey) localStorage.setItem(lsKey, data.household_id);
    return _householdIdCache;
  })();

  const id = await _householdIdPromise;
  _householdIdPromise = null;
  return id;
}

export function clearHouseholdCache() {
  _householdIdCache = null;
  _householdIdPromise = null;
}

// Delad wrapper för /api/*-anrop: bifogar Supabase-access-token som Bearer så
// backend (som kör med service-role och kringgår RLS) kan verifiera att
// anroparen är inloggad. Utan detta kan vem som helst som känner URL:en anropa
// mutations-endpoints (t.ex. radera matsedeln). Appen är alltid inloggad när de
// här anropen sker (auth-gate gatar init), så token finns i praktiken alltid.
export async function apiFetch(path, options = {}) {
  let token = null;
  try {
    const { data: { session } } = await auth.getSession();
    token = session?.access_token || null;
  } catch { /* ingen session → backend svarar 401, hanteras av anroparen */ }
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(path, { ...options, headers });
}

auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') clearHouseholdCache();
});

window.supabase = supabase;
window.db = db;
window.auth = auth;
window.apiFetch = apiFetch;
window.getHouseholdId = getHouseholdId;
window.isDbUnreachable = isDbUnreachable;
