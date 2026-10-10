// Veckovyn: rendering, receptbyte, dagbyte, bekräftelse.
// Läser state: RECIPES, planConfirmed, isSnapping, scrollUpAccum
// Skriver state: planConfirmed, isSnapping, scrollUpAccum

import { fmtIso, fmtShort, PROTEIN_COLOR, getHolidayName, isoWeekNumber, escapeHtml, jsStringAttr, retroWindowStartIso } from '../utils.js';
import { mealDayRowMatches, applyListCoverage } from './echo-match.js';

const ICON_COIN = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 7.5v9 M9.5 9.7c.6-.7 1.5-1 2.5-1s2 .3 2.4 1c.5.8 0 1.7-1 2-.7.2-2.7.3-3.4.7-.9.4-1.4 1.3-.9 2.1.5.7 1.6 1 2.5 1s1.9-.3 2.5-1"/></svg>';
const ICON_POT = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13c0-3.5 3.5-6 8-6s8 2.5 8 6"/><path d="M3 13h18"/><path d="M5.5 13v2c0 1.5 1 2.5 2.5 2.5h8c1.5 0 2.5-1 2.5-2.5v-2"/><path d="M11 4.5c0-.8.5-1.5 1-1.5s1 .7 1 1.5"/></svg>';
const ICON_NOTE = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h11l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 11h8 M8 14h8 M8 17h5"/></svg>';
const ICON_TRASH = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12"/><path d="M10 11v6 M14 11v6"/></svg>';
const ICON_CALENDAR = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>';

// Fel som kastas med en känd svensk server-text flaggas userFacing → catch-
// blocken visar dem för användaren. Nätverks-/parse-fel (t.ex. webbläsarens
// TypeError 'Failed to fetch') saknar flaggan och faller till den svenska
// fallbacktexten, så råa engelska tekniska strängar aldrig når användaren.
function serverError(msg) {
  const e = new Error(msg || 'Okänt fel');
  e.userFacing = true;
  return e;
}
function userFacingMessage(e, fallback) {
  return (e && e.userFacing && e.message && e.message !== 'Okänt fel') ? e.message : fallback;
}

// ── Realtime-prenumeration för matsedeln ──────────────────────────────────────
let _planChannel = null;

// F231: ett meal_days-event som kommer in under en interaktion (byt-läge,
// deluxe-vyns byt/flytta-läge) eller vårt eget 4s-ekofönster fick tidigare
// bara kastas — ingen uppskjuten omhämtning schemalades, så vyn blev stale
// tills en helt orelaterad ändring råkade trigga en ny omladdning. Vi
// markerar nu planen som "stale" i stället och hämtar om så snart läget
// avslutas (se exitReplaceMode/exitCustomPickMode och switchTab-städningen
// nedan) eller ekofönstret löper ut.
//
// Radnivå-eko: varje stale-markering minns eventets rad (senaste per datum).
// När omhämtningen väl ska köras jämförs raderna igen mot det lokala läget —
// ekot från en egen skrivning kan komma FÖRE API-svaret, och när svaret sedan
// landat stämmer raden. Då behövs ingen omhämtning alls. DELETE och rader utan
// datum går inte att jämföra → "okänt" → omhämtning som förut.
const _staleRows = new Map();   // datum → payload.new
let _staleUnknown = false;

function markPlanStale(payload) {
  window._planStale = true;
  const row = payload?.new;
  if (payload && payload.eventType !== 'DELETE' && row && typeof row.date === 'string') _staleRows.set(row.date, row);
  else _staleUnknown = true;
}

function clearPlanStale() {
  window._planStale = false;
  _staleRows.clear();
  _staleUnknown = false;
}

// Stämmer eventets rad redan med planen/egna dagarna i minnet?
function isKnownRow(payload) {
  if (!payload || payload.eventType === 'DELETE') return false;
  return mealDayRowMatches(payload.new, window._lastPlan, window._customDays);
}

// Optimistiska receptval (Välj själv) som väntar på serversvar. Under tiden
// får en stale-omhämtning INTE köras — den skulle läsa det gamla läget ur
// databasen och "blinka tillbaka" det nya receptet. Omhämtningen sker i
// stället när svaret landat (se finishOptimistic nedan).
let _optimisticInFlight = 0;

function reloadIfStale() {
  if (_optimisticInFlight > 0) return;
  if (!window._planStale) return;
  const allKnown = !_staleUnknown && _staleRows.size > 0
    && [..._staleRows.values()].every((row) => mealDayRowMatches(row, window._lastPlan, window._customDays));
  clearPlanStale();
  if (allKnown) return;   // bara våra egna ekon — vyn visar redan rätt läge
  window.loadWeeklyPlan();
}

// Eko-dämpning FÖRE en egen skrivning: realtime-eventet från vår egen ändring
// kan komma medan anropet pågår — sätt fönstret innan fetch, inte efter svaret.
// Delas av alla vägar som byter recept (Välj själv, reor, prisoptimera).
export function suppressPlanEcho(ms = 4000) {
  window._planMutateUntil = Math.max(window._planMutateUntil || 0, Date.now() + ms);
}

// Delad spärr (window._opBusy) för receptbyten: en ändring i taget. Returnerar
// false (och säger till) om en tidigare ändring fortfarande sparas.
export function takeOpLock() {
  if (window._opBusy) {
    window.showToast?.('Vänta – förra ändringen sparas fortfarande.');
    return false;
  }
  window._opBusy = true;
  return true;
}

// Bakgrundssparning (optimistiskt val): för användaren ser ändringen redan
// klar ut, men spärren hålls tills servern svarat. Nästa åtgärd (Slumpa,
// flytta, nytt val …) ska då VÄNTA IN sparningen och sedan köras — aldrig
// tyst tappas ("random-väljaren buggar").
let _bgSave = null;   // Promise som löses när bakgrundssparningen släppt spärren

function beginBgSave() {
  let done;
  _bgSave = new Promise((resolve) => { done = resolve; });
  return () => { _bgSave = null; done(); };
}

export function opBgSaving() {
  return !!(window._opBusy && _bgSave);
}

// Synkron förkoll för knappar/gester: true = stoppa (och säg till varför).
// Under en bakgrundssparning släpps åtgärden fram — den köar i acquireOpLock.
export function opBlocked() {
  if (!window._opBusy || _bgSave) return false;
  window.showToast?.('Vänta – förra ändringen sparas fortfarande.');
  return true;
}

// Ta spärren; pågår en bakgrundssparning väntas den in först.
export async function acquireOpLock() {
  while (window._opBusy && _bgSave) {
    try { await _bgSave; } catch { /* sparningen hanterar sina egna fel */ }
  }
  return takeOpLock();
}

function beginOptimistic() {
  _optimisticInFlight++;
  suppressPlanEcho();
}

// Samma bakgrundssparnings-mönster för andra optimistiska vägar (Slumpa med
// förhandsval i premiumvyn). Anropas EFTER att spärren tagits; returnerar
// avslutet som släpper spärren, löser köade åtgärder och hanterar ekot.
// done({ failed: true }) = sparningen gav fel → planen hämtas om (se finishOptimistic).
export function beginOptimisticSave() {
  const endBgSave = beginBgSave();
  beginOptimistic();
  return ({ failed = false } = {}) => {
    window._opBusy = false;
    endBgSave();
    finishOptimistic({ failed });
  };
}

// Svaret har landat: förläng ekofönstret (ekot kan komma strax efter svaret)
// och hämta om först när fönstret löpt ut, om ett event markerat planen stale.
//
// failed: sparningen gav fel och dagen rullades tillbaka. Servern kan ändå ha
// hunnit skriva (replace-recipe skriver meal_days FÖRE historik/listbygget, och
// mobilnätet kan tappa svaret efter commit). Ekot av den skrivningen stämde med
// det optimistiska läget och svaldes av isKnownRow — det kommer inte igen. Hämta
// därför alltid om planen direkt, så vyn visar databasens faktiska läge.
function finishOptimistic({ failed = false } = {}) {
  _optimisticInFlight = Math.max(0, _optimisticInFlight - 1);
  suppressPlanEcho();
  if (failed) {
    markPlanStale(null);   // okänd rad → reloadIfStale hämtar alltid om
    setTimeout(reloadIfStale, 50);
    return;
  }
  if (window._planStale) {
    setTimeout(reloadIfStale, Math.max(0, (window._planMutateUntil || 0) - Date.now()) + 50);
  }
}

function subscribeMealDays(householdId) {
  if (_planChannel) return; // redan prenumererar
  _planChannel = window.db
    .channel(`meal_days:${householdId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_days', filter: `household_id=eq.${householdId}` }, (payload) => {
      // Radnivå-eko: raden stämmer redan med det vi visar (vårt eget eko efter
      // ett API-svar) → inget att hämta. Skiljer den sig (partnerns ändring,
      // eller ekot kom före svaret) körs de vanliga vägarna nedan.
      if (isKnownRow(payload)) return;
      // Inköpsrundor: partnerns "Vi har handlat"/add_day syns i Inköp-flikens
      // täckningsrad utan omladdning (billig, egen hämtning — ingen plan-reload).
      window.refreshShopCoverage?.();
      // Ladda inte om direkt om användaren är mitt i en interaktion — men
      // tappa inte eventet: markera planen som stale (F231).
      if (window.replaceMode || window.customPickMode) { markPlanStale(payload); return; }
      if (window._dlxSwap || window._dlxMove) { markPlanStale(payload); return; }   // premiumvyns byt/flytta-läge
      // Eko-dämpning: våra egna skrivningar har redan uppdaterat vyn från
      // API-svaret — hoppa över omhämtningen som annars orsakar ett blink.
      // Men fönstret är tidsbaserat och dämpar därför även partnerns
      // samtidiga skrivningar — schemalägg en uppskjuten omhämtning när
      // fönstret löper ut ifall eventet faktiskt var partnerns.
      // Ett optimistiskt val väntar fortfarande på servern (t.ex. kallstart
      // längre än ekofönstret): en omhämtning nu skulle läsa det gamla receptet
      // och skriva över valet. finishOptimistic hämtar om när svaret landat.
      if (_optimisticInFlight > 0) { markPlanStale(payload); return; }
      if (window._planMutateUntil && Date.now() < window._planMutateUntil) {
        markPlanStale(payload);
        setTimeout(reloadIfStale, (window._planMutateUntil - Date.now()) + 50);
        return;
      }
      window.loadWeeklyPlan();
    })
    .subscribe();
}

const TIMELINE_DAYS_BACK_MIN = 14;
const TIMELINE_DAYS_FORWARD_MIN = 14;
const TIMELINE_DAYS_CAP = 45;
const DAY_NAMES_SHORT = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
const DAY_NAMES_LONG  = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];

function diffDaysIso(a, b) {
  const da = new Date(a + 'T12:00:00');
  const db = new Date(b + 'T12:00:00');
  return Math.round((db - da) / 86400000);
}

// Bygger tidslinje med dynamisk horisont: alltid minst ±14 dagar runt idag,
// men expanderas så hela aktiv plan + äldsta arkivet alltid syns (cap 45 åt varje håll).
function buildTimeline(plan, archive, customDays) {
  const todayIso = fmtIso(new Date());
  const byDate = new Map();
  const customEntries = (customDays && customDays.entries) || {};

  // plan_archives är LEGACY (Session 137): en generering arkiverar inte längre
  // bort den gamla planens dagar utan behåller dem som egna dagar i meal_days.
  // Kvarvarande arkivrader läses fortfarande så inga dagar försvinner ur vyn
  // innan migration 011 har materialiserat dem — men en riktig rad (egen dag
  // eller aktiv plan) äger alltid dagen och vinner över arkivet. Utan den
  // regeln göms en egen planering tyst bakom ett arkivkort för samma datum.
  const sortedArchive = (archive?.plans || []).slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
  sortedArchive.forEach((p, idx) => {
    const planId = `arch-${p.startDate}`;
    const planLabel = `${fmtShort(p.startDate)} – ${fmtShort(p.endDate)}`;
    const colorIndex = idx % 4;
    for (const d of p.days) {
      if (customEntries[d.date]) continue;
      byDate.set(d.date, { ...d, planId, planLabel, planColorIndex: colorIndex, isArchive: true });
    }
  });

  if (plan?.days?.length) {
    const planId = 'active';
    const planLabel = plan.startDate && plan.endDate
      ? `${fmtShort(plan.startDate)} – ${fmtShort(plan.endDate)}`
      : 'Aktuell matsedel';
    for (const d of plan.days) {
      byDate.set(d.date, { ...d, planId, planLabel, planColorIndex: -1, isArchive: false });
    }
  }

  // ── Dynamisk horisont ──────────────────────────────────────────────────────
  let back = TIMELINE_DAYS_BACK_MIN;
  let forward = TIMELINE_DAYS_FORWARD_MIN;

  if (sortedArchive.length) {
    const oldest = sortedArchive[0].startDate;
    back = Math.max(back, diffDaysIso(oldest, todayIso));
    // Arkiverade dagar kan ligga i FRAMTIDEN: genererar man två matsedlar efter
    // varandra arkiveras den första även om den täcker kommande dagar. Utan
    // detta föll de utanför horisonten och syntes varken i matsedeln eller i
    // dagväljaren — bara den senaste planens dagar gick att handla för.
    const newestEnd = sortedArchive.reduce((m, p) => (p.endDate > m ? p.endDate : m), sortedArchive[0].endDate);
    forward = Math.max(forward, diffDaysIso(todayIso, newestEnd));
  }
  if (plan?.endDate) {
    forward = Math.max(forward, diffDaysIso(todayIso, plan.endDate));
  }
  if (plan?.startDate) {
    back = Math.max(back, diffDaysIso(plan.startDate, todayIso));
  }
  // Custom-dagar kan ligga utanför plan/arkiv → se till att de kommer med
  for (const dateIso of Object.keys(customEntries)) {
    const d = diffDaysIso(todayIso, dateIso);
    if (d >= 0) forward = Math.max(forward, d);
    else back = Math.max(back, -d);
  }

  // Arkivdagar kan gå längre tillbaka än normalt cap (de döljs av default)
  const archiveBack = sortedArchive.length
    ? Math.max(0, diffDaysIso(sortedArchive[0].startDate, todayIso))
    : 0;
  const backCap = Math.min(Math.max(archiveBack, TIMELINE_DAYS_CAP), 365);
  back = Math.min(Math.max(back, 0), backCap);
  forward = Math.min(Math.max(forward, 0), TIMELINE_DAYS_CAP);

  const days = [];
  const todayDate = new Date(todayIso + 'T12:00:00');
  for (let offset = -back; offset <= forward; offset++) {
    const cur = new Date(todayDate);
    cur.setDate(cur.getDate() + offset);
    const iso = fmtIso(cur);
    const dow = cur.getDay();
    const entry = byDate.get(iso) || {};
    const custom = customEntries[iso];
    // En plan_id-lös rad som BARA är en fri dag (ingen notering, inget recept)
    // renderas som fri dag — inte som tom egen planering (Session 142: fria
    // dagar flyttas som vilket innehåll som helst och kan lämna sin plan).
    const customFreeOnly = !!custom && custom.blocked && !custom.note && !custom.recipeId && !custom.recipeTitle;
    const isCustom = !!custom && !entry.recipeId && !customFreeOnly;
    // Inköpsrundor: dagens rundstatus — från plan-dagen eller custom-dagen.
    const shoppedAt = entry.shoppedAt || custom?.shoppedAt || null;
    const dayListId = entry.listId || custom?.listId || null;
    days.push({
      date: iso,
      day: DAY_NAMES_LONG[dow],
      dayShort: DAY_NAMES_SHORT[dow],
      dayNum: cur.getDate(),
      month: cur.getMonth(),
      weekNumber: isoWeekNumber(iso),
      isPast: iso < todayIso,
      isToday: iso === todayIso,
      isWeekend: dow === 0 || dow === 6,
      holiday: getHolidayName(iso),
      recipe: entry.recipe || null,
      recipeId: entry.recipeId || null,
      saving: entry.saving || null,
      savingMatches: entry.savingMatches || null,
      blocked: !!((entry.blocked && !entry.recipeId) || (customFreeOnly && !entry.recipeId)),
      planId: entry.planId || null,
      planLabel: entry.planLabel || null,
      planColorIndex: entry.planColorIndex ?? null,
      isArchive: !!entry.isArchive,
      isCustom,
      customNote: isCustom ? (custom.note || '') : '',
      customRecipeId: isCustom ? (custom.recipeId || null) : null,
      customRecipeTitle: isCustom ? (custom.recipeTitle || '') : '',
      shoppedAt,
      onList: !!dayListId && dayListId === window._activeShopListId,
    });
  }
  return days;
}

async function loadArchive() {
  try {
    const householdId = await window.getHouseholdId();
    const { data, error } = await window.db
      .from('plan_archives')
      .select('*')
      .eq('household_id', householdId)
      .order('archived_at', { ascending: false });
    if (error) throw error;
    return {
      plans: (data || []).map(row => ({
        startDate:  row.start_date,
        endDate:    row.end_date,
        archivedAt: row.archived_at,
        days:       row.days || [],
      }))
    };
  } catch { return { plans: [] }; }
}

async function loadCustomDays() {
  try {
    const householdId = await window.getHouseholdId();
    const { data, error } = await window.db
      .from('meal_days')
      .select('*')
      .eq('household_id', householdId)
      .is('plan_id', null);
    if (error) throw error;
    const entries = {};
    for (const row of (data || [])) {
      entries[row.date] = {
        note:        row.custom_note || '',
        recipeId:    row.recipe_id ?? null,
        recipeTitle: row.recipe_title_snapshot || '',
        // Fri dag som lämnat sin plan (Session 137 detach / flyttad fri dag)
        blocked:     row.blocked === true,
        // Inköpsrundor (migration 009) — saknas kolumnerna blir de undefined → null
        shoppedAt:   row.shopped_at ?? null,
        listId:      row.shopping_list_id ?? null,
      };
    }
    return { entries };
  } catch { return { entries: {} }; }
}

async function loadActivePlanFromSupabase(householdId) {
  const { data: plans, error: plansErr } = await window.db
    .from('weekly_plans')
    .select('*')
    .eq('household_id', householdId)
    .eq('is_active', true)
    .limit(1);
  if (plansErr) throw plansErr;
  const wp = plans?.[0];
  if (!wp) return null;
  const { data: mealDays, error: daysErr } = await window.db
    .from('meal_days')
    .select('*')
    .eq('plan_id', wp.id)
    .order('date');
  if (daysErr) throw daysErr;
  return {
    id:          wp.id,   // för realtime-ekokontrollen (plan_id-värdet)
    generated:   wp.generated_at,
    startDate:   wp.start_date,
    endDate:     wp.end_date,
    confirmedAt: wp.confirmed_at || null,
    days: (mealDays || []).map(row => ({
      date:          row.date,
      recipe:        row.recipe_title_snapshot || null,
      recipeId:      row.recipe_id ?? null,
      saving:        row.saving ?? null,
      savingMatches: row.saving_matches ?? null,
      locked:        row.locked === true,
      blocked:       row.blocked === true,
      shoppedAt:     row.shopped_at ?? null,        // inköpsrundor (migration 009)
      listId:        row.shopping_list_id ?? null,
    })),
  };
}

async function loadShopSummaryFromSupabase(householdId) {
  const { data: lists } = await window.db
    .from('shopping_lists')
    .select('*')
    .eq('household_id', householdId)
    .eq('is_active', true)
    .limit(1);
  const list = lists?.[0];
  if (!list) return null;
  const { data: items } = await window.db
    .from('shopping_items')
    .select('category, name, position')
    .eq('list_id', list.id)
    .eq('source', 'recipe')
    .order('position');
  const recipeItems = {};
  for (const row of (items || [])) {
    if (!recipeItems[row.category]) recipeItems[row.category] = [];
    while (recipeItems[row.category].length <= row.position) recipeItems[row.category].push(null);
    recipeItems[row.category][row.position] = row.name;
  }
  for (const cat of Object.keys(recipeItems)) recipeItems[cat] = recipeItems[cat].filter(Boolean);
  return {
    listId:             list.id,   // för "på listan"-chipsen (inköpsrundor)
    recipeItems:        Object.keys(recipeItems).length ? recipeItems : null,
    recipeItemsMovedAt: list.recipe_items_moved_at || null,
  };
}

// ── Replace-läge ─────────────────────────────────────────────────────────────

// Väljläget (Välj själv / egen dag): body-klass döljer import-knappen (+) som
// annars skymmer korten, och gamla felrader från tidigare försök städas bort.
function setPickChrome(on) {
  document.body.classList.toggle('pick-mode', !!on);
  document.querySelectorAll('#replaceBanner .replace-err, #customPickBanner .replace-err')
    .forEach(el => el.remove());
}

export function enterReplaceMode(date, dayName) {
  window.dlxCloseSheet?.();   // lämna dag-sheeten när vi navigerar till receptboken
  window.customPickMode = null;
  window.replaceMode = { date, dayName };
  document.getElementById('replaceBannerDay').textContent = dayName;
  const rv = document.getElementById('receptView');
  rv.classList.remove('custom-pick-mode');
  rv.classList.add('replace-mode');
  setPickChrome(true);
  window.switchTab('recept');
}

export function exitReplaceMode({ reload = true } = {}) {
  window.replaceMode = null;
  document.getElementById('receptView').classList.remove('replace-mode');
  setPickChrome(!!window.customPickMode);
  if (reload) reloadIfStale();   // F231: hämta om ifall vi missade ett event under läget
}

// Efter ett val: visa Matsedel på RÄTT vecka (dagen kan ligga en annan vecka
// än den innevarande) med dagen i bild, glöd-kvitto och ev. väntar-markering.
function showPickedDay(date, { pending = false } = {}) {
  window.switchTab('vecka');
  if (window.dlxAfterPick) window.dlxAfterPick(date, { pending });
  else window.dlxWeekGoto?.(date);
}

// /api/shopping-svar (add_day/remove_day): rita nya listan direkt ur svaret
// (id:n, bockar, "på listan"-chips) i stället för att ladda om Inköp-fliken.
async function adoptShopResponse(res) {
  let data = {};
  try { data = await res.json(); } catch { /* ingen JSON */ }
  if (data.shoppingList && window.renderShoppingData) {
    window.renderShoppingData(data.shoppingList);
  } else {
    window._preserveChecked = false;
    window.refreshShoppingTab?.();
  }
}

function rerenderPlan() {
  renderWeeklyPlanData(window._lastPlan || null, window._lastShop || null, false, window._planArchive, window._customDays);
}

// _lastShop är matsedelns vy av inköpslistan och återanvänds vid senare
// omritningar. Ögonblicksfälten ur ett API-svar (täckning, rad-id:n, bockar)
// gäller bara just det svaret — sparas de och återanvänds skulle gammal
// täckning skrivas över färskare läge. Rensa bort dem.
function planShopView(shop) {
  if (!shop || typeof shop !== 'object') return shop || null;
  if (!('coveredDates' in shop || 'itemIds' in shop || 'checkedItems' in shop)) return shop;
  const { coveredDates, itemIds, checkedItems, ...rest } = shop;
  return rest;
}

// Föregående aktiva listans id — behövs av applyShopListToPlan, eftersom
// premiumvyns rerender(plan, shop) hinner sätta det nya id:t (via
// renderWeeklyPlanData) innan renderShoppingData → applyShopListToPlan körs.
let _prevActiveShopListId = null;
function setActiveShopListId(id) {
  const cur = window._activeShopListId ?? null;
  if (cur !== (id ?? null)) _prevActiveShopListId = cur;
  window._activeShopListId = id ?? null;
}

// Ett API-svar med ombyggd inköpslista (listId + coveredDates): spegla serverns
// täckningspekare lokalt så "på listan"-chipsen stämmer direkt — och så att
// realtime-ekona för pekarna känns igen som egna (ingen omhämtning). Anropas
// från renderShoppingData. Ritar bara om planen om något faktiskt ändrats.
export function applyShopListToPlan(shop) {
  if (!shop?.listId) return false;
  const cur = window._activeShopListId || null;
  // Serverns steg 5 nollar pekare till listan som var aktiv FÖRE ombygget.
  const oldListId = cur !== shop.listId ? cur : (_prevActiveShopListId || null);
  const changed = applyListCoverage(window._lastPlan, window._customDays, {
    listId: shop.listId, coveredDates: shop.coveredDates, oldListId,
  });
  const idChanged = cur !== shop.listId;
  setActiveShopListId(shop.listId);
  _prevActiveShopListId = null;   // förbrukad — ett upprepat svar ska inte nolla igen
  // rerenderPlan läser listId ur _lastShop — annars skulle det gamla id:t
  // skrivas tillbaka. API-formen är samma som runDayOp redan ritar med.
  if (idChanged) window._lastShop = planShopView(shop);
  if ((changed || idChanged) && (window._lastPlan || window._customDays)) rerenderPlan();
  return changed || idChanged;
}

// Välj själv: tryck på ett receptkort → matsedeln visar receptet DIREKT
// (optimistiskt), sparningen sker i bakgrunden. Misslyckas den återställs
// dagen och en toast förklarar. Servern (/api/replace-recipe) är oförändrad.
export async function selectRecipeForDay(event, recipeId, title) {
  event?.stopPropagation?.();
  if (window.customPickMode) {
    return selectRecipeForCustomDay(event, recipeId, title);
  }
  if (!window.replaceMode) return;
  if (!(await acquireOpLock())) return;
  if (!window.replaceMode) { window._opBusy = false; return; }   // avbröts medan vi väntade
  const { date } = window.replaceMode;
  const endBgSave = beginBgSave();

  const day = window._lastPlan?.days?.find(d => d.date === date);
  const snapshot = day
    ? { recipe: day.recipe, recipeId: day.recipeId, saving: day.saving, savingMatches: day.savingMatches }
    : null;

  let failed = false;
  beginOptimistic();
  updateLastPlanDay(date, recipeId, title);
  exitReplaceMode({ reload: false });
  rerenderPlan();
  showPickedDay(date, { pending: true });

  try {
    const res = await window.apiFetch('/api/replace-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, newRecipeId: recipeId }),
    });
    let data = {};
    try { data = await res.json(); } catch { /* ingen JSON */ }
    if (!res.ok) throw serverError(data.error);

    window.dlxSetPending?.(date, false);
    if (data.shoppingList) {
      window.renderIngredientPreview(
        data.shoppingList.recipeItems || null,
        data.shoppingList.recipeItemsMovedAt || null,
        false
      );
      if (window.renderShoppingData) window.renderShoppingData(data.shoppingList);
    }
  } catch (err) {
    // Återställ dagen — men bara om ingen annan hunnit ändra den under tiden.
    const d = window._lastPlan?.days?.find(x => x.date === date);
    if (d && snapshot && d.recipeId === recipeId) Object.assign(d, snapshot);
    window.dlxSetPending?.(date, false);
    rerenderPlan();
    if (document.body.dataset.activeTab === 'vecka') window.dlxWeekGoto?.(date);
    window.showToast?.(userFacingMessage(err, 'Kunde inte byta recept — prova igen.'), { type: 'error' });
    failed = true;
  } finally {
    window._opBusy = false;
    endBgSave();
    finishOptimistic({ failed });
  }
}

// ── Custom-pick-läge (välj enstaka recept till egen-planering-dag) ──────────

export function enterCustomPickMode(dateIso, dayName) {
  window.dlxCloseSheet?.();   // lämna dag-sheeten när vi navigerar till receptboken
  window.customPickMode = { date: dateIso, dayName };
  window.replaceMode = null;
  const label = document.getElementById('customPickBannerDay');
  if (label) label.textContent = `${dayName} ${fmtShort(dateIso)}`;
  document.getElementById('receptView').classList.remove('replace-mode');
  document.getElementById('receptView').classList.add('custom-pick-mode');
  setPickChrome(true);
  window.switchTab('recept');
}

export function exitCustomPickMode({ reload = true } = {}) {
  window.customPickMode = null;
  document.getElementById('receptView').classList.remove('custom-pick-mode');
  setPickChrome(!!window.replaceMode);
  if (reload) reloadIfStale();   // F231: hämta om ifall vi missade ett event under läget
}

// Egen dag: samma optimistiska mönster — dagen visas direkt, skrivningen mot
// meal_days (plan_id NULL, oförändrad logik) sker i bakgrunden.
export async function selectRecipeForCustomDay(event, recipeId, title) {
  event?.stopPropagation?.();
  if (!window.customPickMode) return;
  if (!(await acquireOpLock())) return;   // delad spärr med premiumvyn (backlog #10)
  if (!window.customPickMode) { window._opBusy = false; return; }   // avbröts medan vi väntade
  const { date } = window.customPickMode;
  const endBgSave = beginBgSave();

  const prevCustomDays = window._customDays;
  const existing = (prevCustomDays?.entries || {})[date] || {};
  const updatedEntries = { ...(prevCustomDays?.entries || {}), [date]: { ...existing, note: existing.note || '', recipeId, recipeTitle: title } };

  let failed = false;
  beginOptimistic();
  window._customDays = { ...(prevCustomDays || {}), entries: updatedEntries };
  exitCustomPickMode({ reload: false });
  rerenderPlan();
  showPickedDay(date, { pending: true });

  try {
    const householdId = await window.getHouseholdId();
    const { data: row, error: readErr } = await window.db
      .from('meal_days').select('plan_id').eq('household_id', householdId).eq('date', date).maybeSingle();
    if (readErr) throw readErr;
    let dbErr;
    if (row && row.plan_id == null) {
      ({ error: dbErr } = await window.db.from('meal_days')
        .update({ recipe_id: recipeId, recipe_title_snapshot: title, custom_note: existing.note || null })
        .eq('household_id', householdId).eq('date', date));
    } else if (!row) {
      ({ error: dbErr } = await window.db.from('meal_days')
        .insert({ household_id: householdId, date, plan_id: null, recipe_id: recipeId, recipe_title_snapshot: title, custom_note: existing.note || null }));
    } else {
      // Dagen tillhör nu en aktiv plan (t.ex. genererad från en annan enhet
      // medan sheeten var öppen) — skriv aldrig över plan-dagar (invariant #1).
      // Utan denna gren föll koden tyst igenom till "sparat"-vägen (F042).
      dbErr = serverError('Dagen ingår nu i en matsedel — kunde inte spara.');
    }
    if (dbErr) throw dbErr;
    window.dlxSetPending?.(date, false);

    // Låg dagen redan på inköpslistan (inköpsrundor)? Då gäller listans varor
    // det GAMLA receptet — bygg om via add_day så listan speglar det nya.
    // Inhandlade dagar rörs inte ("Lägg tillbaka" är ett uttryckligt val i dag-vyn).
    if (window._timelineByDate?.[date]?.onList) {
      try {
        const res = await window.apiFetch('/api/shopping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add_day', date }),
        });
        if (res.ok) {
          // Servern (add_day) nollar dagens shopped_at — spegla det lokalt så
          // ekot känns igen som eget (annars full omhämtning av planen).
          const entry = window._customDays?.entries?.[date];
          const wasShopped = !!entry?.shoppedAt;
          if (wasShopped) entry.shoppedAt = null;
          await adoptShopResponse(res);
          if (wasShopped) rerenderPlan();
        }
        else window.showToast?.('Receptet sparades, men inköpslistan kunde inte uppdateras — öppna dagen och välj "Lägg ingredienser på inköpslistan".', { type: 'error' });
      } catch {
        window.showToast?.('Receptet sparades, men inköpslistan kunde inte uppdateras — öppna dagen och välj "Lägg ingredienser på inköpslistan".', { type: 'error' });
      }
    }
  } catch (e) {
    // Återställ den egna dagen — bara om ingen annan hunnit ändra den under tiden.
    const cur = window._customDays?.entries?.[date];
    if (cur && cur.recipeId === recipeId) {
      const entries = { ...(window._customDays.entries || {}) };
      if (prevCustomDays?.entries?.[date]) entries[date] = prevCustomDays.entries[date];
      else delete entries[date];
      window._customDays = { ...window._customDays, entries };
    }
    window.dlxSetPending?.(date, false);
    rerenderPlan();
    if (document.body.dataset.activeTab === 'vecka') window.dlxWeekGoto?.(date);
    window.showToast?.(userFacingMessage(e, 'Kunde inte spara receptet — prova igen.'), { type: 'error' });
    failed = true;
  } finally {
    window._opBusy = false;
    endBgSave();
    finishOptimistic({ failed });
  }
}

// ── Starta matsedelsgenerering från vald dag ────────────────────────────────

export function startPlanFromDate(dateIso) {
  const startEl = document.getElementById('startDate');
  const endEl = document.getElementById('endDate');
  if (!startEl || !endEl) return;

  const start = new Date(dateIso + 'T12:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  startEl.value = fmtIso(start);
  endEl.value = fmtIso(end);

  if (window.updateDateHint) window.updateDateHint();
  if (window.updateSettingsPreview) window.updateSettingsPreview();
  if (window.toggleTrigger) window.toggleTrigger();

  window.dlxCloseSheet?.();   // dag-sheeten ska inte ligga kvar över generatorn

  const trigger = document.getElementById('triggerSection');
  if (trigger) {
    const hh = document.querySelector('header').offsetHeight || 0;
    const top = trigger.getBoundingClientRect().top + window.scrollY - hh - 8;
    window.smoothScrollTo(top, 380);
  }
}

// ── Receptbyte (slumpa/välj) ──────────────────────────────────────────────────

// Håll in-memory-planen (window._lastPlan) i synk när en enskild dags recept
// byts. Annars kan en senare full re-render återställa dagen till gammalt recept.
function updateLastPlanDay(date, recipeId, recipe) {
  const day = window._lastPlan?.days?.find(d => d.date === date);
  if (day) {
    day.recipe = recipe;
    day.recipeId = recipeId;
    day.saving = 0;
    day.savingMatches = [];
  }
}

// ── Fri dag ──────────────────────────────────────────────────────────────────
// Att göra/ångra fri dag är sedan Session 142 vanliga dagoperationer i
// dag-sheeten (plan-viewer-deluxe.js → /api/day push/pull). Här bor bara
// editorn för en befintlig fri dag.

// Editor-HTML för en fri dag — renderas inline i premiumvyns utfällda kort
// (samma mönster som customDayEditorHtml). Knapparna kallar globala
// window-funktioner och bryr sig inte om var HTML:n sitter.
export function blockedDayEditorHtml(dateIso, dayName) {
  const dateLabel = fmtShort(dateIso);
  const todayIso = fmtIso(new Date());
  const isPast = dateIso < todayIso;
  const notePlaceholder = isPast
    ? 'T.ex. rester, åt ute, beställde hem…'
    : 'T.ex. pizza, rester, äter ute…';

  // Samma radgrammatik som dag-sheetens övriga vyer: rubrik, EN radlista
  // (noteringen fälls ut på plats), destruktiv åtgärd sist.
  return `<div class="detail-inner custom-day-editor">
    ${editorHeadHtml(dayName, dateLabel, 'Fri dag', '')}
    <div class="custom-options">
      ${noteRowHtml('blockedDayNote', '', notePlaceholder, `convertBlockedToCustom('${dateIso}')`, false)}
    </div>
    <div class="dlx-sheet-dangerzone"><button type="button" class="dlx-sheet-danger" onclick="dlxSheetDeleteDay()">${ICON_TRASH}<span>Ta bort dagen helt</span></button></div>
  </div>`;
}

// Rubrik i editorerna — samma form som dag-sheetens sheetHead (plan-viewer-deluxe.js).
function editorHeadHtml(dayName, dateLabel, title, meta) {
  return `<div class="dlx-sheet-head">
      <p class="dlx-sheet-eyebrow">${escapeHtml(dayName || '')} · ${escapeHtml(dateLabel)}</p>
      <h2 class="dlx-sheet-title">${escapeHtml(title)}</h2>
      ${meta ? `<p class="dlx-sheet-sub">${escapeHtml(meta)}</p>` : ''}
    </div>`;
}

// Noteringsrad som fälls ut till ett fält + Spara vid tryck (dlxExpandNote).
// Fältets id och .custom-note-save läses av spara-flödena — behåll dem.
function noteRowHtml(inputId, value, placeholder, saveCall, hasNote) {
  return `<div class="dlx-note-exp">
      <button type="button" class="dlx-sheet-row" aria-expanded="false" onclick="dlxExpandNote(this)">
        <span class="dlx-sheet-ic">${ICON_NOTE}</span>
        <span class="dlx-sheet-txt"><span class="dlx-sheet-t">${hasNote ? 'Ändra noteringen' : 'Skriv en notering'}</span></span>
      </button>
      <div class="dlx-sheet-addrow">
        <input type="text" id="${inputId}" class="custom-note-input" maxlength="140"
               placeholder="${placeholder}" aria-label="Notering" value="${value}"
               onkeydown="if(event.key==='Enter'){event.preventDefault();${saveCall}}">
        <button type="button" class="dlx-sheet-addbtn custom-note-save" onclick="${saveCall}">Spara</button>
      </div>
    </div>`;
}
window.blockedDayEditorHtml = blockedDayEditorHtml;

export async function convertBlockedToCustom(dateIso) {
  const note = document.getElementById('blockedDayNote')?.value?.trim();
  if (!note) return;
  if (!(await acquireOpLock())) return;   // delad spärr med premiumvyn (backlog #10)
  try {
    await postCustomDays('set', [dateIso], note);
    window.dlxCloseSheet?.();   // editorn bor i dag-sheeten
    window.loadWeeklyPlan();
  } catch {
    window.showToast?.('Kunde inte spara noteringen — prova igen.', { type: 'error' });
  } finally {
    window._opBusy = false;
  }
}

// ── Besparings-popover ───────────────────────────────────────────────────────

// esc = utils.escapeHtml (samma semantik) — behåller det korta lokala namnet
// på anropssidorna men en enda implementation i utils.
const esc = escapeHtml;

function fmtKr(value) {
  if (value == null) return '–';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded} kr` : `${rounded.toFixed(1).replace('.', ',')} kr`;
}

export function openSavingPopover(dateIso) {
  const day = window._timelineByDate?.[dateIso];
  if (!day || !day.savingMatches?.length) return;

  const rows = day.savingMatches.map((m) => {
    const brand = m.brandLine ? `<div class="saving-brand">${esc(m.brandLine)}</div>` : '';
    const loyalty = m.loyalty ? `<span class="saving-loyalty">Willys Plus</span>` : '';
    const bulk = m.bulk ? `<span class="saving-bulk" title="Stor förpackning — räcker ofta till fler måltider">storpack</span>` : '';
    const validStr = m.validUntil
      ? `Gäller t.o.m. ${fmtShort(m.validUntil.slice(0, 10))}`
      : '';
    return `
      <li class="saving-row">
        <div class="saving-row-main">
          <div class="saving-canon">${esc(m.canon)}${loyalty}${bulk}</div>
          <div class="saving-product">${esc(m.name)}</div>
          ${brand}
          <div class="saving-prices">
            <span class="saving-promo">${fmtKr(m.promoPrice)}</span>
            <span class="saving-regular">normalt ${fmtKr(m.regularPrice)}</span>
          </div>
          ${validStr ? `<div class="saving-valid">${esc(validStr)}</div>` : ''}
        </div>
        <div class="saving-delta">−${fmtKr(m.savingPerUnit)}</div>
      </li>`;
  }).join('');

  const title = day.recipe ? esc(day.recipe) : `${day.dayShort} ${day.dayNum}`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay saving-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeSavingPopover(); };
  overlay.innerHTML = `
    <div class="modal-box saving-box" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>${ICON_COIN} Sparat ca ${day.saving} kr</h2>
        <button type="button" aria-label="Stäng" onclick="closeSavingPopover()">✕</button>
      </div>
      <p class="saving-sub">På <strong>${title}</strong> — jämfört med normalpris på Willys Ekholmen.</p>
      <ul class="saving-list">${rows}</ul>
      <p class="saving-footnote">Besparingen räknas per enhet och förutsätter att du handlar erbjudandet. Reapriser kan ändras eller löpa ut.</p>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

export function closeSavingPopover() {
  document.querySelectorAll('.saving-overlay').forEach((el) => el.remove());
}

// ── Bekräftelse ───────────────────────────────────────────────────────────────

export async function discardPlan() {
  const ok = await window.confirmDialog({
    title: 'Kassera förslaget?',
    message: 'Den föreslagna matsedeln tas bort. Inköpslistan påverkas inte.',
    confirmLabel: 'Kassera',
    danger: true,
  });
  if (!ok) return;
  const btn = document.getElementById('discardPlanBtn');
  const confirmBtn = document.getElementById('confirmPlanBtn');
  const statusEl = document.getElementById('confirmStatus');
  btn.disabled = true;
  if (confirmBtn) confirmBtn.disabled = true;
  btn.textContent = 'Kasserar…';
  statusEl.textContent = '';

  try {
    const res = await window.apiFetch('/api/discard-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    let data = {};
    try { data = await res.json(); } catch { /* ingen JSON */ }
    if (!res.ok) throw serverError(data.error || `Serverfel ${res.status}`);

    window.planConfirmed = false;
    window.dlxCloseSheet?.();

    // Använd returnerad tomma planen direkt — Vercels statiska weekly-plan.json
    // har inte hunnit re-deploya efter API-commiten (~30 sek), så fetch skulle
    // fortfarande leverera den gamla planen. Hämta arkiv/custom-days/inköpslista
    // med cache-bust för att reflektera senaste tillstånd.
    const emptyPlan = data.weeklyPlan || { days: [], startDate: null, endDate: null };
    let archive    = { plans: [] };
    let customDays = window._customDays || { entries: {} };
    let shop       = window._lastShop || null;
    try {
      const householdId = await window.getHouseholdId();
      [archive, customDays, shop] = await Promise.all([
        loadArchive(),
        loadCustomDays(),
        loadShopSummaryFromSupabase(householdId),
      ]);
    } catch { /* kör med fallbacks */ }
    renderWeeklyPlanData(emptyPlan, shop, false, archive, customDays);
    if (data.restored > 0) {
      window.showToast?.(data.restored === 1
        ? 'Förslaget är borttaget — dagen det ersatte är tillbaka.'
        : `Förslaget är borttaget — ${data.restored} dagar det ersatte är tillbaka.`, { type: 'success' });
    }
  } catch (e) {
    btn.disabled = false;
    if (confirmBtn) confirmBtn.disabled = false;
    btn.textContent = 'Kassera förslag';
    statusEl.textContent = e.userFacing
      ? `Kunde inte kassera: ${e.message} — prova igen.`
      : 'Kunde inte kassera — prova igen.';
    statusEl.className = 'confirm-status';
    console.error('discardPlan error:', e);
  }
}

export async function confirmPlan() {
  const btn      = document.getElementById('confirmPlanBtn');
  const statusEl = document.getElementById('confirmStatus');
  btn.disabled    = true;
  btn.textContent = 'Bekräftar…';
  statusEl.textContent = '';

  try {
    const res  = await window.apiFetch('/api/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json();
    if (!res.ok) throw serverError(data.error);

    window.planConfirmed = true;
    if (window._lastPlan) window._lastPlan.confirmedAt = data.weeklyPlan?.confirmedAt || new Date().toISOString();
    document.getElementById('confirmPlanWrap').style.display = 'none';
    // Bekräftad plan → ta bort snabbåtgärderna (slumpa/byt dag) från korten
    document.querySelectorAll('.day-card-actions').forEach(b => b.remove());

    // Inköpslistan byggs INTE här längre (Session 134) — familjen väljer själv
    // vilka dagar som ska handlas. Toasten bär genvägen till det steget.
    window.showToast?.('Matsedeln bekräftad — välj sedan vilka dagar du vill handla för.', {
      type: 'success',
      duration: 6000,
      action: { label: 'Välj dagar', onClick: () => window.openShoppingDayPicker?.() },
    });
  } catch (e) {
    btn.disabled    = false;
    btn.textContent = '✓ Bekräfta matsedeln';
    statusEl.textContent = userFacingMessage(e, 'Kunde inte bekräfta — prova igen.');
    statusEl.className   = 'confirm-status';
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

export function renderWeeklyPlanData(plan, shop, freshlyGenerated = false, archive = null, customDays = null) {
  const hasActivePlan = !!plan?.days?.length;
  const archiveData = archive || window._planArchive || { plans: [] };
  const customData = customDays || window._customDays || { entries: {} };
  window._planArchive = archiveData;
  window._customDays = customData;
  window._lastPlan = plan;
  window._lastShop = planShopView(shop);
  // Aktiva inköpslistans id (för "på listan"-chipsen). API-payloads och
  // Supabase-summeringen bär listId; äldre/återanvända payloads utan fältet
  // behåller senast kända id i stället för att blanka chipsen.
  if (shop && shop.listId) setActiveShopListId(shop.listId);
  else if (!shop) setActiveShopListId(null);

  if (!hasActivePlan && !(archiveData.plans && archiveData.plans.length) && !Object.keys(customData.entries || {}).length) {
    document.getElementById('weekLoading').style.display = 'none';
    document.getElementById('weekContent').style.display = 'none';
    document.getElementById('weekNoData').style.display = '';
    const confirmWrap = document.getElementById('confirmPlanWrap');
    if (confirmWrap) confirmWrap.style.display = 'none';
    return;
  }

  document.getElementById('weekLoading').style.display = 'none';
  document.getElementById('weekNoData').style.display  = 'none';
  document.getElementById('weekContent').style.display = '';

  const metaEl = document.getElementById('weekMeta');
  if (metaEl) {
    metaEl.textContent = hasActivePlan ? '' : 'Ingen aktiv matsedel — generera en ny';
  }

  const confirmed = !!plan?.confirmedAt;
  window.planConfirmed = confirmed;

  const timeline = buildTimeline(plan, archiveData, customData);
  // Premiumvyn (plan-viewer-deluxe.js) renderar matsedeln från denna karta.
  // Den klassiska tidslinjen (grid + nav-chips + horisontell scroll) är
  // avvecklad — bara datapreppen lever kvar här.
  window._timelineByDate = Object.fromEntries(timeline.map((d) => [d.date, d]));

  // Färsk generering → hoppa till förslagets startvecka så användaren ser det
  // hen just skapade (veckovyn visar annars alltid innevarande vecka).
  if (freshlyGenerated && plan?.startDate) window.dlxWeekGoto?.(plan.startDate);

  const confirmWrap   = document.getElementById('confirmPlanWrap');
  const confirmStatus = document.getElementById('confirmStatus');
  const confirmBtn    = document.getElementById('confirmPlanBtn');
  if (confirmWrap) {
    confirmWrap.style.display = (hasActivePlan && !confirmed) ? '' : 'none';
  }
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = '✓ Bekräfta matsedeln';
  }
  const discardBtn = document.getElementById('discardPlanBtn');
  if (discardBtn) {
    discardBtn.disabled = false;
    discardBtn.textContent = 'Kassera förslag';
  }
  if (confirmStatus) {
    confirmStatus.textContent = '';
    confirmStatus.className = 'confirm-status';
  }

  const recipeItems = shop?.recipeItems || shop?.categories || null;
  const ingrTitle = document.getElementById('ingredientSectionTitle');
  if (ingrTitle) {
    ingrTitle.textContent = (hasActivePlan && plan?.startDate && plan?.endDate)
      ? `Ingredienser · ${fmtShort(plan.startDate)}–${fmtShort(plan.endDate)}`
      : 'Veckans ingredienser';
  }
  // Fäll bara ut direkt efter nygenerering — annars kollapsad som default.
  window.renderIngredientPreview(recipeItems, shop?.recipeItemsMovedAt || null, freshlyGenerated);
  document.getElementById('triggerSection').classList.add('collapsed');
}

export async function loadWeeklyPlan() {
  try {
    const householdId = await window.getHouseholdId();
    const [plan, shop, archive, customDays] = await Promise.all([
      loadActivePlanFromSupabase(householdId),
      loadShopSummaryFromSupabase(householdId),
      loadArchive(),
      loadCustomDays(),
    ]);
    document.getElementById('weekLoading').style.display = 'none';
    const hasAnything = (plan?.days?.length) || (archive?.plans?.length) || Object.keys(customDays.entries || {}).length;
    if (!hasAnything) { document.getElementById('weekNoData').style.display = ''; return; }
    window.dlxDropShufflePreviews?.();   // omläst plan → förhandsvalen kan vara inaktuella
    renderWeeklyPlanData(plan, shop, false, archive, customDays);
    subscribeMealDays(householdId);
  } catch {
    document.getElementById('weekLoading').style.display = 'none';
    if (window._lastPlan?.days?.length || Object.keys(window._customDays?.entries || {}).length) {
      window.showToast?.('Kunde inte uppdatera matsedeln — prova igen strax.', { type: 'error' });
    } else {
      document.getElementById('weekNoData').style.display = '';
      document.getElementById('weekContent').style.display = 'none';
    }
  }
}

// ── Egen planering (custom days) ──────────────────────────────────────────────

// Bygger editor-HTML:n för en egen-planering-dag. Bryts ut så premiumvyn kan
// rendera SAMMA editor inline i det utfällda kortet. Knapparna kallar globala
// window-funktioner och bryr sig inte om var HTML:n sitter.
export function customDayEditorHtml(dateIso, dayName) {
  const existing = (window._customDays?.entries || {})[dateIso];
  const note = existing?.note || '';
  const hasExisting = !!existing;
  const todayIso = fmtIso(new Date());
  const isPastDay = dateIso < todayIso;

  // F212: gammal escaper missade backslash (lagrad XSS) — jsStringAttr escapar
  // backslash FÖRST, sedan ' och &<>".
  const escDayName = jsStringAttr(dayName || '');
  const dateLabel = fmtShort(dateIso);
  const noteValue = escapeHtml(note);

  // Retro-planering (Session 131): recept går att välja även på passerade dagar
  // inom retro-fönstret (logga vad ni faktiskt åt / planera om i efterhand).
  // Äldre än fönstret är historik. "Starta matsedel" förblir framtid-only.
  const pickRecipeOption = dateIso >= retroWindowStartIso() ? `
    <button type="button" class="dlx-sheet-row" onclick="enterCustomPickMode('${dateIso}', '${escDayName}')">
      <span class="dlx-sheet-ic">${ICON_POT}</span>
      <span class="dlx-sheet-txt"><span class="dlx-sheet-t">${existing?.recipeId ? 'Välj ett annat recept' : 'Välj recept ur receptboken'}</span></span>
    </button>` : '';

  const noteOption = noteRowHtml('customDayNote', noteValue, 'T.ex. pizza, rester, äter ute…',
    `saveCustomDay('${dateIso}')`, !!note);

  const planOption = !isPastDay ? `
    <button type="button" class="dlx-sheet-row" onclick="startPlanFromDate('${dateIso}')">
      <span class="dlx-sheet-ic">${ICON_CALENDAR}</span>
      <span class="dlx-sheet-txt"><span class="dlx-sheet-t">Starta matsedel från denna dag</span><span class="dlx-sheet-d">Genererar nya middagar härifrån</span></span>
    </button>` : '';

  const removeBtn = hasExisting
    ? `<div class="dlx-sheet-dangerzone"><button type="button" class="dlx-sheet-danger" onclick="clearCustomDay('${dateIso}')">${ICON_TRASH}<span>Ta bort markering</span></button></div>`
    : '';

  // Titel: dagens innehåll (recept/notering) — annars "Tom dag".
  const title = existing?.recipeTitle || note || 'Tom dag';
  const meta = hasExisting ? 'Egen planering' : '';

  return `<div class="detail-inner custom-day-editor">
    ${editorHeadHtml(dayName, dateLabel, title, meta)}
    <div class="custom-options">
      ${pickRecipeOption}
      ${noteOption}
      ${planOption}
    </div>
    ${removeBtn}
  </div>`;
}

async function postCustomDays(action, dates, note) {
  const householdId = await window.getHouseholdId();
  const entries = { ...(window._customDays?.entries || {}) };
  const collided = [];   // F043: datum som kolliderade med en plan-dag — signalera till anroparen
  if (action === 'set') {
    await Promise.all(dates.map(async (date) => {
      const { data: row } = await window.db
        .from('meal_days').select('plan_id').eq('household_id', householdId).eq('date', date).maybeSingle();
      if (row && row.plan_id != null) { collided.push(date); return; } // aldrig skriv över plan-dagar
      let dbErr;
      if (row) {
        ({ error: dbErr } = await window.db.from('meal_days')
          .update({ custom_note: note || null }).eq('household_id', householdId).eq('date', date));
      } else {
        ({ error: dbErr } = await window.db.from('meal_days')
          .insert({ household_id: householdId, date, plan_id: null, custom_note: note || null }));
      }
      if (dbErr) throw dbErr;
      entries[date] = { ...(entries[date] || {}), note: note || '' };
    }));
  } else if (action === 'clear') {
    await Promise.all(dates.map(async (date) => {
      const { error } = await window.db
        .from('meal_days').delete().eq('household_id', householdId).eq('date', date).is('plan_id', null);
      if (error) throw error;
      delete entries[date];
    }));
  }
  window._customDays = { entries };
  if (collided.length) {
    // Övriga (icke-kolliderade) datum i batchen är sparade ovan — men
    // anroparen (saveCustomDay/convertBlockedToCustom) måste få veta att
    // minst ett datum tyst hoppades över, så en svensk felruta kan visas
    // i stället för att låtsas att allt sparades (F043).
    throw new Error('Dagen ingår i en matsedel — noteringen sparades inte.');
  }
}

export async function saveCustomDay(dateIso) {
  if (opBlocked()) return;   // delad spärr med premiumvyn (backlog #10)
  const input = document.getElementById('customDayNote');
  const note = (input?.value || '').trim();
  const hasExisting = !!(window._customDays?.entries || {})[dateIso];
  // Tomt fält på en dag som ännu inte är egen-planering → gör inget (speglar
  // convertBlockedToCustom). Annars skapades en innehållslös custom-dag som
  // genereringen sedan permanent hoppar över (F255).
  if (!note && !hasExisting) return;
  if (!(await acquireOpLock())) return;
  const btn = document.querySelector('.custom-note-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Sparar…'; }
  try {
    await postCustomDays('set', [dateIso], note);
    window.dlxCloseSheet?.();   // editorn bor i dag-sheeten
    // Via window.* så BÅDE deluxe- och Idag-vyns re-render-hookar kör (den lokala
    // funktionen uppdaterar bara timeline-kartan + klassisk DOM, inte vyerna).
    // postCustomDays har redan uppdaterat window._customDays → instant, ingen omladdning.
    window.renderWeeklyPlanData(
      window._lastPlan || null,
      window._lastShop || null,
      false,
      window._planArchive,
      window._customDays
    );
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Spara'; }
    const editor = document.querySelector('.custom-day-editor');
    if (editor && !editor.querySelector('.custom-save-err')) {
      const err = document.createElement('p');
      err.className = 'custom-save-err';
      err.style.cssText = 'color:var(--rust);font-size:0.82rem;padding:0.5rem 0';
      err.textContent = 'Kunde inte spara — prova igen.';
      editor.appendChild(err);
    }
  } finally {
    window._opBusy = false;
  }
}

export async function clearCustomDay(dateIso) {
  if (!(await acquireOpLock())) return;   // delad spärr med premiumvyn (backlog #10)
  try {
    // Låg dagens ingredienser på inköpslistan (inköpsrundor)? Plocka bort dem
    // FÖRE raderingen (remove_day kräver att dagen finns i täckningen).
    // Misslyckas städningen tas dagen ändå bort — säg det ärligt i en toast.
    if (window._timelineByDate?.[dateIso]?.onList) {
      try {
        const res = await window.apiFetch('/api/shopping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'remove_day', date: dateIso }),
        });
        if (res.ok) await adoptShopResponse(res);
        else window.showToast?.('Dagen tas bort, men inköpslistan kunde inte uppdateras — ladda om och prova igen.', { type: 'error' });
      } catch {
        window.showToast?.('Dagen tas bort, men inköpslistan kunde inte uppdateras — ladda om och prova igen.', { type: 'error' });
      }
    }
    await postCustomDays('clear', [dateIso]);
    window.dlxCloseSheet?.();   // editorn bor i dag-sheeten
    // Via window.* så både deluxe- och Idag-vyn re-renderas (se saveCustomDay).
    window.renderWeeklyPlanData(
      window._lastPlan || null,
      window._lastShop || null,
      false,
      window._planArchive,
      window._customDays
    );
  } catch {
    window.showToast?.('Kunde inte ta bort markeringen — prova igen.', { type: 'error' });
  } finally {
    window._opBusy = false;
  }
}

// ── Städa övergivna interaktionslägen vid flikbyte (F259) ───────────────────
// enterReplaceMode/enterCustomPickMode och deluxe-vyns flytta-läge
// (_dlxMove) stänger av realtime-plansynken (subscribeMealDays ovan)
// så länge de hänger kvar. Ett flikbyte utan uttryckligt Avbryt lämnade
// tidigare läget beväpnat resten av sessionen. Wrappar window.switchTab
// (samma mönster som today-view.js/plan-viewer-deluxe.js) så städningen sker
// centralt oavsett vilken flik användaren hoppar till.
function installSwitchTabCleanup() {
  const origSwitch = window.switchTab;
  if (typeof origSwitch !== 'function' || origSwitch.__planViewerWrapped) return;
  const wrappedSwitch = function (tab) {
    const r = origSwitch.apply(this, arguments);
    if (tab !== 'recept') {
      if (window.replaceMode) exitReplaceMode();
      if (window.customPickMode) exitCustomPickMode();
    }
    if (tab !== 'vecka') {
      window.dlxCancelMove?.();
    }
    reloadIfStale();   // F231: fånga upp ev. missat event från städningen ovan
    return r;
  };
  wrappedSwitch.__planViewerWrapped = true;
  window.switchTab = wrappedSwitch;
}
installSwitchTabCleanup();

window.enterReplaceMode    = enterReplaceMode;
window.exitReplaceMode     = exitReplaceMode;
window.selectRecipeForDay  = selectRecipeForDay;
window.updateLastPlanDay   = updateLastPlanDay;
window.suppressPlanEcho    = suppressPlanEcho;
window.takeOpLock          = takeOpLock;
window.acquireOpLock       = acquireOpLock;
window.beginOptimisticSave = beginOptimisticSave;
window.opBlocked           = opBlocked;
window.opBgSaving          = opBgSaving;
window.openSavingPopover   = openSavingPopover;
window.closeSavingPopover  = closeSavingPopover;
window.confirmPlan         = confirmPlan;
window.discardPlan         = discardPlan;
window.renderWeeklyPlanData = renderWeeklyPlanData;
window.loadWeeklyPlan      = loadWeeklyPlan;
window.customDayEditorHtml = customDayEditorHtml;
window.saveCustomDay       = saveCustomDay;
window.clearCustomDay      = clearCustomDay;
window.convertBlockedToCustom = convertBlockedToCustom;
window.enterCustomPickMode = enterCustomPickMode;
window.exitCustomPickMode  = exitCustomPickMode;
window.selectRecipeForCustomDay = selectRecipeForCustomDay;
window.startPlanFromDate   = startPlanFromDate;
window.applyShopListToPlan = applyShopListToPlan;
