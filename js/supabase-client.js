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

auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') clearHouseholdCache();
});

window.supabase = supabase;
window.db = db;
window.auth = auth;
window.getHouseholdId = getHouseholdId;
