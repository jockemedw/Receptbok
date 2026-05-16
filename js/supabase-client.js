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
    const { data: { user } } = await auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    _householdIdCache = data.household_id;
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
