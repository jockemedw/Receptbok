// Eko-kontroll för meal_days-realtime: stämmer en inkommande rad redan med det
// vi har lokalt (planen + egna dagar)? Då är eventet vårt eget eko (eller ett
// redan känt läge) och vyn behöver inte hämtas om. Rena funktioner — inga DOM-
// eller window-beroenden, testas i tests/echo-match.test.js.
//
// Försiktig regel: allt vi inte säkert kan jämföra räknas som "okänt" → ingen
// träff → omhämtning som förut. Ett fel åt det hållet kostar bara en extra
// omladdning; en felaktig träff skulle däremot tappa partnerns ändring.

// Fälten som jämförs. Saknas något av dem i eventets rad vet vi inte → ingen träff.
export const ECHO_FIELDS = ['date', 'plan_id', 'recipe_id', 'blocked', 'custom_note', 'shopped_at', 'shopping_list_id'];

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const norm = (v) => (v === undefined ? null : v);

// Tidsstämplar kan komma i olika textform (realtime vs PostgREST) — jämför instant.
function sameInstant(a, b) {
  a = norm(a); b = norm(b);
  if (a === null || b === null) return a === b;
  if (a === b) return true;
  const ta = Date.parse(a), tb = Date.parse(b);
  return Number.isFinite(ta) && ta === tb;
}

const sameId = (a, b) => {
  a = norm(a); b = norm(b);
  if (a === null || b === null) return a === b;
  return String(a) === String(b);
};

// Besparing: lokalt nollställs ett utbytt recept till 0/[] medan servern
// skriver null — båda betyder "ingen besparing".
const noSaving = (v) => v == null || v === 0;
function sameSaving(a, b) {
  if (noSaving(a) || noSaving(b)) return noSaving(a) && noSaving(b);
  return Number(a) === Number(b);
}
const noMatches = (v) => v == null || (Array.isArray(v) && v.length === 0);
function sameMatches(a, b) {
  if (noMatches(a) || noMatches(b)) return noMatches(a) && noMatches(b);
  try { return stableJson(a) === stableJson(b); } catch { return false; }
}
// jsonb sorterar om objektnycklar — jämför med sorterade nycklar.
function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}
const sameText = (a, b) => (norm(a) || '') === (norm(b) || '');

// Extrafält som bara jämförs när eventet bär dem (realtime skickar hela raden).
// Skiljer de sig är det en ändring vi inte gjort → ingen träff.
function extrasMatch(row, local, { titleKey, planId }) {
  if (has(row, 'recipe_title_snapshot') && !sameText(row.recipe_title_snapshot, local[titleKey])) return false;
  if (planId === undefined) return true;   // egen dag: övriga fält finns inte lokalt
  // Planens id finns bara när planen lästs direkt ur Supabase; saknas det
  // lokalt går plan_id-värdet inte att jämföra (nollskillnaden är redan koll).
  if (planId != null && !sameId(row.plan_id, planId)) return false;
  if (has(row, 'locked') && (row.locked === true) !== (local.locked === true)) return false;
  if (has(row, 'saving') && !sameSaving(row.saving, local.saving)) return false;
  if (has(row, 'saving_matches') && !sameMatches(row.saving_matches, local.savingMatches)) return false;
  return true;
}

// row: payload.new från postgres_changes (INSERT/UPDATE).
// plan: window._lastPlan ({ days: [{ date, recipeId, blocked, shoppedAt, listId }] }).
// customDays: window._customDays ({ entries: { [date]: { note, recipeId, blocked, shoppedAt, listId } } }).
export function mealDayRowMatches(row, plan, customDays) {
  if (!row || typeof row !== 'object') return false;
  if (!ECHO_FIELDS.every((k) => has(row, k))) return false;
  if (typeof row.date !== 'string' || !row.date) return false;

  const planDay = (plan?.days || []).find((d) => d.date === row.date) || null;
  const custom = customDays?.entries?.[row.date] || null;

  if (row.plan_id != null) {
    // Plandag: måste finnas i den lokala planen och inte samtidigt som egen dag.
    if (!planDay || custom) return false;
    if (norm(row.custom_note) !== null) return false;   // plandagar bär ingen notering lokalt
    return sameId(row.recipe_id, planDay.recipeId)
      && (row.blocked === true) === (planDay.blocked === true)
      && sameInstant(row.shopped_at, planDay.shoppedAt)
      && sameId(row.shopping_list_id, planDay.listId)
      && extrasMatch(row, planDay, { titleKey: 'recipe', planId: plan?.id ?? null });
  }

  // Egen dag (plan_id NULL). Datumet får inte samtidigt vara en lokal plandag.
  if (planDay) return false;
  if (!custom) return false;
  return sameId(row.recipe_id, custom.recipeId)
    && (row.blocked === true) === (custom.blocked === true)
    && (norm(row.custom_note) || '') === (custom.note || '')
    && sameInstant(row.shopped_at, custom.shoppedAt)
    && sameId(row.shopping_list_id, custom.listId)
    && extrasMatch(row, custom, { titleKey: 'recipeTitle', planId: undefined });
}

// Speglar serverns steg 5 i rebuildActiveList (api/_shared/shopping-store.js)
// lokalt efter ett API-svar med ny lista: byggdagarna pekar på nya listan och
// o-inhandlade dagar som pekade på en annan (den gamla aktiva) lista nollas.
// Muterar plan.days / customDays.entries på plats; returnerar true om något
// ändrades. Utan coveredDates görs inget (okänd täckning → låt ekot avgöra).
// Gissar vi fel på någon rad avviker serverns eko → planen hämtas om som förut.
export function applyListCoverage(plan, customDays, { listId, coveredDates }) {
  if (!listId || !Array.isArray(coveredDates)) return false;
  const covered = new Set(coveredDates);
  let changed = false;
  const fix = (d, date) => {
    if (covered.has(date)) {
      if (d.listId !== listId) { d.listId = listId; changed = true; }
    } else if (d.listId != null && d.listId !== listId && !d.shoppedAt) {
      d.listId = null; changed = true;
    }
  };
  for (const d of plan?.days || []) fix(d, d.date);
  for (const [date, e] of Object.entries(customDays?.entries || {})) fix(e, date);
  return changed;
}
