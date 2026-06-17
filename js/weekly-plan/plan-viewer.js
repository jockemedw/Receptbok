// Veckovyn: rendering, receptbyte, dagbyte, bekräftelse.
// Läser state: RECIPES, planConfirmed, isSnapping, scrollUpAccum
// Skriver state: planConfirmed, isSnapping, scrollUpAccum

import { fmtIso, fmtShort, PROTEIN_COLOR, getHolidayName, isoWeekNumber } from '../utils.js';

const ICON_COIN = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 7.5v9 M9.5 9.7c.6-.7 1.5-1 2.5-1s2 .3 2.4 1c.5.8 0 1.7-1 2-.7.2-2.7.3-3.4.7-.9.4-1.4 1.3-.9 2.1.5.7 1.6 1 2.5 1s1.9-.3 2.5-1"/></svg>';
const ICON_POT = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13c0-3.5 3.5-6 8-6s8 2.5 8 6"/><path d="M3 13h18"/><path d="M5.5 13v2c0 1.5 1 2.5 2.5 2.5h8c1.5 0 2.5-1 2.5-2.5v-2"/><path d="M11 4.5c0-.8.5-1.5 1-1.5s1 .7 1 1.5"/></svg>';
const ICON_NOTE = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h11l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 11h8 M8 14h8 M8 17h5"/></svg>';
const ICON_CALENDAR = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>';
const ICON_SHUFFLE = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h3.5c1.2 0 2.3.6 3 1.6l5 7c.7 1 1.8 1.6 3 1.6H21"/><path d="M18 4l3 3-3 3"/><path d="M3 17h3.5c1.2 0 2.3-.6 3-1.6l.7-1M14.8 9.6l.7-1c.7-1 1.8-1.6 3-1.6H21"/><path d="M18 14l3 3-3 3"/></svg>';
const ICON_PENCIL = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10-10a2 2 0 0 0-2.8-2.8L5 17v3z"/><path d="M13.5 6.5l4 4"/></svg>';

// ── Realtime-prenumeration för matsedeln ──────────────────────────────────────
let _planChannel = null;

function unsubscribeMealDays() {
  if (_planChannel) {
    window.db.removeChannel(_planChannel);
    _planChannel = null;
  }
}

function subscribeMealDays(householdId) {
  if (_planChannel) return; // redan prenumererar
  _planChannel = window.db
    .channel(`meal_days:${householdId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_days', filter: `household_id=eq.${householdId}` }, () => {
      // Ladda inte om om användaren är mitt i en interaktion
      if (window.replaceMode || window.customPickMode) return;
      if (document.querySelector('.week-day-card.swap-source')) return;
      if (window._dlxSwap || window._dlxMove) return;   // premiumvyns byt/flytta-läge
      // Eko-dämpning: våra egna skrivningar har redan uppdaterat vyn från
      // API-svaret — hoppa över omhämtningen som annars orsakar ett blink.
      if (window._planMutateUntil && Date.now() < window._planMutateUntil) return;
      window.loadWeeklyPlan();
    })
    .subscribe();
}

const TIMELINE_DAYS_BACK_MIN = 14;
const TIMELINE_DAYS_FORWARD_MIN = 14;
const TIMELINE_DAYS_CAP = 45;
const DAY_NAMES_SHORT = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
const DAY_NAMES_LONG  = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
const MONTH_NAMES_LONG = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'];

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

  const sortedArchive = (archive?.plans || []).slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
  sortedArchive.forEach((p, idx) => {
    const planId = `arch-${p.startDate}`;
    const planLabel = `${fmtShort(p.startDate)} – ${fmtShort(p.endDate)}`;
    const colorIndex = idx % 4;
    for (const d of p.days) {
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
    const isCustom = !!custom && !entry.recipeId && !entry.isArchive;
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
      blocked: !!(entry.blocked && !entry.recipeId),
      planId: entry.planId || null,
      planLabel: entry.planLabel || null,
      planColorIndex: entry.planColorIndex ?? null,
      isArchive: !!entry.isArchive,
      isCustom,
      customNote: isCustom ? (custom.note || '') : '',
      customRecipeId: isCustom ? (custom.recipeId || null) : null,
      customRecipeTitle: isCustom ? (custom.recipeTitle || '') : '',
    });
  }
  return days;
}

// Centrerar en given dag (eller dagens kort som fallback) horisontellt i timeline-wrap.
// scrollIntoView funkar dåligt när fliken är dold (display:none) — därför explicit scrollLeft.
export function centerOnDate(dateIso, { smooth = true } = {}) {
  const wrap = document.querySelector('.timeline-wrap');
  if (!wrap) return;
  let target = null;
  if (dateIso) target = document.querySelector(`.week-day-card[data-date="${dateIso}"]`);
  if (!target) target = document.querySelector('.week-day-card.today')
                     || document.querySelector('.week-day-card:not(.past):not(.gap)');
  if (!target) return;
  const container = target.closest('.timeline-day') || target;
  const wantScroll = container.offsetLeft
                   - (wrap.clientWidth / 2)
                   + (container.offsetWidth / 2);
  wrap.scrollTo({ left: Math.max(0, wantScroll), behavior: smooth ? 'smooth' : 'auto' });
}

export function centerTodayCard(opts = {}) {
  return centerOnDate(null, opts);
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
      };
    }
    return { entries };
  } catch { return { entries: {} }; }
}

async function loadActivePlanFromSupabase(householdId) {
  const { data: plans } = await window.db
    .from('weekly_plans')
    .select('*')
    .eq('household_id', householdId)
    .eq('is_active', true)
    .limit(1);
  const wp = plans?.[0];
  if (!wp) return null;
  const { data: mealDays } = await window.db
    .from('meal_days')
    .select('*')
    .eq('plan_id', wp.id)
    .order('date');
  return {
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
    recipeItems:        Object.keys(recipeItems).length ? recipeItems : null,
    recipeItemsMovedAt: list.recipe_items_moved_at || null,
  };
}

// ── Replace-läge ─────────────────────────────────────────────────────────────

export function enterReplaceMode(date, dayName) {
  window.replaceMode = { date, dayName };
  document.getElementById('replaceBannerDay').textContent = dayName;
  document.getElementById('receptView').classList.add('replace-mode');
  window.switchTab('recept');
}

export function exitReplaceMode() {
  window.replaceMode = null;
  document.getElementById('receptView').classList.remove('replace-mode');
}

export async function selectRecipeForDay(event, recipeId, title) {
  event.stopPropagation();
  if (window.customPickMode) {
    return selectRecipeForCustomDay(event, recipeId, title);
  }
  if (!window.replaceMode) return;
  const { date } = window.replaceMode;

  const btn = event.currentTarget;
  btn.disabled    = true;
  btn.textContent = 'Sparar…';

  try {
    const res = await fetch('/api/replace-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, newRecipeId: recipeId }),
    });
    if (!res.ok) throw new Error();

    const data = await res.json();
    const card = document.querySelector(`.week-day-card[data-date="${date}"]`);
    if (card) {
      card.dataset.recipeid = recipeId;
      card.querySelector('.week-day-recipe').textContent = title;
    }
    updateLastPlanDay(date, recipeId, title);
    if (data.shoppingList) {
      window.renderIngredientPreview(
        data.shoppingList.recipeItems || null,
        data.shoppingList.recipeItemsMovedAt || null,
        false
      );
      if (window.renderShoppingData) window.renderShoppingData(data.shoppingList);
    }
    exitReplaceMode();
    window.switchTab('vecka');
  } catch {
    btn.disabled    = false;
    btn.textContent = 'Välj';
    const banner = document.getElementById('replaceBanner');
    if (!banner.querySelector('.replace-err')) {
      const e = document.createElement('span');
      e.className  = 'replace-err';
      e.style.cssText = 'color:var(--rust);font-size:0.8rem';
      e.textContent   = 'Kunde inte spara — prova igen.';
      banner.insertBefore(e, banner.querySelector('.replace-banner-cancel'));
    }
  }
}

// ── Custom-pick-läge (välj enstaka recept till egen-planering-dag) ──────────

export function enterCustomPickMode(dateIso, dayName) {
  window.customPickMode = { date: dateIso, dayName };
  window.replaceMode = null;
  const label = document.getElementById('customPickBannerDay');
  if (label) label.textContent = `${dayName} ${fmtShort(dateIso)}`;
  document.getElementById('receptView').classList.remove('replace-mode');
  document.getElementById('receptView').classList.add('custom-pick-mode');
  window.switchTab('recept');
}

export function exitCustomPickMode() {
  window.customPickMode = null;
  document.getElementById('receptView').classList.remove('custom-pick-mode');
}

export async function selectRecipeForCustomDay(event, recipeId, title) {
  event.stopPropagation();
  if (!window.customPickMode) return;
  const { date } = window.customPickMode;

  const btn = event.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Sparar…';

  try {
    const householdId = await window.getHouseholdId();
    const existing = (window._customDays?.entries || {})[date] || {};
    const { data: row } = await window.db
      .from('meal_days').select('plan_id').eq('household_id', householdId).eq('date', date).maybeSingle();
    let dbErr;
    if (row && row.plan_id == null) {
      ({ error: dbErr } = await window.db.from('meal_days')
        .update({ recipe_id: recipeId, recipe_title_snapshot: title, custom_note: existing.note || null })
        .eq('household_id', householdId).eq('date', date));
    } else if (!row) {
      ({ error: dbErr } = await window.db.from('meal_days')
        .insert({ household_id: householdId, date, plan_id: null, recipe_id: recipeId, recipe_title_snapshot: title, custom_note: existing.note || null }));
    }
    if (dbErr) throw dbErr;
    const updatedEntries = { ...(window._customDays?.entries || {}), [date]: { note: existing.note || '', recipeId, recipeTitle: title } };
    window._customDays = { entries: updatedEntries };
    exitCustomPickMode();
    renderWeeklyPlanData(
      window._lastPlan || null,
      window._lastShop || null,
      false,
      window._planArchive,
      window._customDays
    );
    window.switchTab('vecka');
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Välj';
    const banner = document.getElementById('customPickBanner');
    if (banner && !banner.querySelector('.replace-err')) {
      const err = document.createElement('span');
      err.className = 'replace-err';
      err.style.cssText = 'color:var(--rust);font-size:0.8rem';
      err.textContent = 'Kunde inte spara — prova igen.';
      banner.insertBefore(err, banner.querySelector('.replace-banner-cancel'));
    }
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

  const panel = document.getElementById('weekRecipeDetail');
  panel.classList.remove('open');
  panel.innerHTML = '';
  document.querySelectorAll('.week-day-card').forEach(c => c.classList.remove('selected'));

  const trigger = document.getElementById('triggerSection');
  if (trigger) {
    const hh = document.querySelector('header').offsetHeight || 0;
    const top = trigger.getBoundingClientRect().top + window.scrollY - hh - 8;
    window.smoothScrollTo(top, 380);
  }
}

// ── Dagbyte ───────────────────────────────────────────────────────────────────

// Capture-phase-lyssnare: när en swap-target klickas i swap-mode, hoppa över
// kortets vanliga onclick (öppna recept / öppna fri dag / öppna custom-day)
// och kör swapDays istället. Installeras en gång vid första enterSwapMode.
let _swapClickHandlerInstalled = false;
function installSwapClickHandler() {
  if (_swapClickHandlerInstalled) return;
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.week-day-card.swap-target');
    if (!card) return;
    const src = document.querySelector('.week-day-card.swap-source');
    if (!src) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    swapDays(src.dataset.date, card.dataset.date);
  }, true);
  _swapClickHandlerInstalled = true;
}

export function enterSwapMode(fromDate) {
  cancelSwapMode();
  const fromCard = document.querySelector(`.week-day-card[data-date="${fromDate}"]`);
  if (!fromCard) return;

  const panel = document.getElementById('weekRecipeDetail');
  panel.classList.remove('open');
  panel.innerHTML = '';

  installSwapClickHandler();

  fromCard.classList.remove('selected');
  fromCard.classList.add('swap-source');

  const todayIso = new Date().toISOString().slice(0, 10);
  document.querySelectorAll('.week-day-card').forEach(c => {
    if (c === fromCard) return;
    if (c.classList.contains('archive')) return;       // gamla planer = oföränderliga
    if (c.classList.contains('custom')) return;        // egen planering hanteras separat
    if (c.dataset.readonly === '1') return;
    // Gap-dagar (utanför plan): bara framtida — historisk gap-dag är inget vettigt swap-mål
    if (c.classList.contains('gap')) {
      const d = c.dataset.date;
      if (!d || d < todayIso) return;
    }
    c.classList.add('swap-target');
  });
}

export function cancelSwapMode() {
  document.querySelectorAll('.week-day-card.swap-source').forEach(c => c.classList.remove('swap-source'));
  document.querySelectorAll('.week-day-card.swap-target').forEach(c => c.classList.remove('swap-target'));
}

export async function swapDays(date1, date2) {
  cancelSwapMode();
  document.querySelectorAll('.week-day-card').forEach(c => c.classList.remove('selected'));
  const panel = document.getElementById('weekRecipeDetail');
  panel.classList.remove('open');
  panel.innerHTML = '';

  try {
    const res = await fetch('/api/swap-days', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date1, date2 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');

    const shop = data.shoppingList || null;
    renderWeeklyPlanData(data.weeklyPlan, shop);
    if (shop && window.renderShoppingData) {
      window.renderShoppingData(shop);
    }
  } catch (e) {
    const errEl = document.createElement('p');
    errEl.style.cssText = 'color:var(--rust);font-size:0.82rem;padding:0.5rem 1rem';
    errEl.textContent = e.message || 'Kunde inte byta dag — prova igen.';
    panel.innerHTML = '';
    panel.appendChild(errEl);
    panel.classList.add('open');
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

// Snabb-slumpa direkt från ett dagkort i tidslinjen (ej-bekräftad plan).
// Läser nuvarande recept-id live från kortet (undviker inbakat förlegat id),
// och gör en full re-render efteråt — precis som dagbyte — så att inget blir stale.
export async function shuffleDay(date, btnEl) {
  const card = document.querySelector(`.week-day-card[data-date="${date}"]`);
  const currentId = card ? parseInt(card.dataset.recipeid, 10) : NaN;

  btnEl.disabled = true;
  btnEl.classList.add('is-loading');

  const weekRecipeIds = Array.from(document.querySelectorAll('.week-day-card[data-recipeid]'))
    .map(c => parseInt(c.dataset.recipeid, 10))
    .filter(id => !isNaN(id));

  try {
    const res = await fetch('/api/replace-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        currentRecipeId: isNaN(currentId) ? undefined : currentId,
        weekRecipeIds,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');

    // Uppdatera plan-data i minnet → full re-render (konsekvent med dagbyte)
    updateLastPlanDay(date, data.recipeId, data.recipe);
    renderWeeklyPlanData(window._lastPlan, window._lastShop, false, window._planArchive, window._customDays);

    // Re-öppna detaljpanelen för dagen med det nya receptet
    const newCard = document.querySelector(`.week-day-card[data-date="${date}"]`);
    if (newCard) openWeekRecipe(data.recipeId, data.recipe, newCard);
  } catch (e) {
    btnEl.disabled = false;
    btnEl.classList.remove('is-loading');
    const panel = document.getElementById('weekRecipeDetail');
    if (panel) {
      const errEl = document.createElement('p');
      errEl.style.cssText = 'color:var(--rust);font-size:0.82rem;padding:0.5rem 1rem';
      errEl.textContent = 'Kunde inte byta recept — prova igen.';
      panel.innerHTML = '';
      panel.appendChild(errEl);
      panel.classList.add('open');
    }
  }
}

export async function replaceRecipe(currentId, date, btnEl) {
  btnEl.disabled    = true;
  btnEl.textContent = 'Letar recept…';

  const weekRecipeIds = Array.from(document.querySelectorAll('.week-day-card[data-recipeid]'))
    .map(c => parseInt(c.dataset.recipeid, 10))
    .filter(id => !isNaN(id));

  try {
    const res = await fetch('/api/replace-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, currentRecipeId: currentId, weekRecipeIds }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');

    const selectedCard = document.querySelector('.week-day-card.selected');
    if (selectedCard) {
      selectedCard.dataset.recipeid = data.recipeId;
      selectedCard.querySelector('.week-day-recipe').textContent = data.recipe;
      updateLastPlanDay(selectedCard.dataset.date || date, data.recipeId, data.recipe);
      selectedCard.classList.remove('selected');
      openWeekRecipe(data.recipeId, data.recipe, selectedCard);
    }
    if (data.shoppingList) {
      window.renderIngredientPreview(
        data.shoppingList.recipeItems || null,
        data.shoppingList.recipeItemsMovedAt || null,
        false
      );
      if (window.renderShoppingData) window.renderShoppingData(data.shoppingList);
    }
  } catch (e) {
    btnEl.disabled    = false;
    btnEl.textContent = 'Slumpa nytt recept';
    const panel  = document.getElementById('weekRecipeDetail');
    const errEl  = panel.querySelector('.replace-error');
    if (!errEl) {
      const p = document.createElement('p');
      p.className    = 'replace-error';
      p.style.cssText = 'color:var(--rust);font-size:0.82rem;margin-top:0.5rem';
      p.textContent   = 'Kunde inte byta recept — prova igen.';
      btnEl.after(p);
    }
  }
}

// ── Detaljpanel ───────────────────────────────────────────────────────────────

export function openWeekRecipe(recipeId, title, cardEl) {
  if (cardEl.classList.contains('swap-target')) {
    const fromDate = document.querySelector('.week-day-card.swap-source')?.dataset.date;
    if (fromDate) swapDays(fromDate, cardEl.dataset.date);
    return;
  }

  const panel          = document.getElementById('weekRecipeDetail');
  const alreadySelected = cardEl.classList.contains('selected');
  cancelSwapMode();
  document.querySelectorAll('.week-day-card').forEach(c => c.classList.remove('selected'));

  if (alreadySelected) {
    panel.classList.remove('open');
    panel.innerHTML = '';
    return;
  }

  const r = recipeId ? window.RECIPES.find(x => x.id === recipeId) : null;
  if (!r) { window.jumpToRecipe(title); return; }

  cardEl.classList.add('selected');

  const t        = r.time ? (r.timeNote ? `${r.time} min · ${r.timeNote}` : `${r.time} min`) : '';
  const ingHtml  = (r.ingredients || []).map(i => `<li>${esc(i)}</li>`).join('');
  const stepsHtml = (r.instructions || []).map(s =>
    `<li onclick="toggleStep(this)"><span>${esc(s)}</span></li>`
  ).join('');
  const notesHtml = r.notes
    ? `<div class="detail-section"><p class="recipe-notes">${esc(r.notes)}</p></div>` : '';
  const date    = cardEl.dataset.date || '';
  const dayName = cardEl.dataset.day  || '';

  const PROTEIN_LABEL = { fisk: 'Fisk', kyckling: 'Kyckling', kött: 'Kött', fläsk: 'Fläsk', vegetarisk: 'Vegetarisk' };

  const readOnly = cardEl.dataset.readonly === '1';
  const isPast = cardEl.dataset.past === '1';
  const isCustom = cardEl.dataset.custom === '1';

  // Primära byt-recept-knappar — lyfts fram direkt (ej gömda under disclosure)
  // så att man enkelt kan slumpa om eller välja manuellt i en ej-bekräftad matsedel.
  const canReplace = !readOnly && !window.planConfirmed && !isCustom;
  const replaceActions = canReplace ? `
    <div class="day-replace-actions">
      <p class="day-replace-hint">Vill du ha något annat den här dagen?</p>
      <div class="day-replace-btns">
        <button class="day-replace-btn day-replace-btn-primary" onclick="replaceRecipe(${r.id}, '${date}', this)">${ICON_SHUFFLE} Slumpa nytt recept</button>
        <button class="day-replace-btn" onclick="enterReplaceMode('${date}', '${dayName}')">${ICON_PENCIL} Välj manuellt</button>
      </div>
    </div>` : '';

  // Sekundära åtgärder (byt dag, fri dag, redigera egen planering) — under disclosure
  const swapBtn = !readOnly
    ? `<button class="day-action-btn" onclick="enterSwapMode('${date}')">Byt dag</button>` : '';
  const freeBtn = (!readOnly && !isPast)
    ? `<button class="day-action-btn" onclick="freeDay('${date}')">Gör fri dag — skjut planen →</button>` : '';
  const dayActionBtns = (swapBtn || freeBtn)
    ? `<div class="day-action-btns">${swapBtn}${freeBtn}</div>` : '';
  const customEditBtn = isCustom
    ? `<button class="replace-recipe-btn" onclick="openCustomDay('${date}', '${dayName}')">Redigera egen planering</button>`
    : '';
  const readOnlyNote = readOnly && !isCustom
    ? `<p class="readonly-note">📜 Historisk plan — bara för referens.</p>`
    : '';
  const customNote = isCustom
    ? `<p class="readonly-note">✏️ Egen planering — inget recept från matsedeln.</p>`
    : '';
  const secondaryActions = `${dayActionBtns}${customEditBtn}`;
  const actionsDetails = secondaryActions.trim() ? `
    <details class="day-actions-details">
      <summary>Fler val</summary>
      <div class="day-actions-inner">${secondaryActions}</div>
    </details>` : '';
  const actionBtns = replaceActions + actionsDetails + readOnlyNote + customNote;

  panel.innerHTML = `<div class="detail-inner">
    <div class="week-recipe-header">
      <div class="week-recipe-title">${esc(r.title)}</div>
      <span class="pill pill-protein">${PROTEIN_LABEL[r.protein] || r.protein}</span>
      ${t ? `<span class="pill pill-time">⏱ ${t}</span>` : ''}
      <span class="pill ${r.tested ? 'pill-tested' : 'pill-untested'} pill-toggle"
            onclick="toggleTested(event, ${r.id})">${r.tested ? '✓ Provat' : 'Ej provat'}</span>
    </div>
    <div class="detail-section">
      <h3>Ingredienser · ${r.servings} portioner</h3>
      <ul class="ingredients-list">${ingHtml}</ul>
    </div>
    <div class="detail-section">
      <h3>Tillagning</h3>
      <ol class="steps-list">${stepsHtml}</ol>
    </div>
    ${notesHtml}
    ${actionBtns}
  </div>`;

  panel.classList.add('open');
  window.isSnapping    = true;
  window.scrollUpAccum = 0;
  document.querySelector('header').classList.remove('header-hidden');
  const hh  = document.querySelector('header').offsetHeight;
  const top = panel.getBoundingClientRect().top + window.scrollY - hh - 8;
  window.smoothScrollTo(top, 380);
}

// ── Fri dag (gör fri / ångra fri) ────────────────────────────────────────────

async function modifyDay(date, action) {
  const cards = document.querySelectorAll('.week-day-card');
  cards.forEach(c => c.style.pointerEvents = 'none');

  try {
    const res = await fetch('/api/skip-day', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, action }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');

    // Stäng detaljpanelen
    const panel = document.getElementById('weekRecipeDetail');
    panel.classList.remove('open');
    panel.innerHTML = '';
    document.querySelectorAll('.week-day-card').forEach(c => c.classList.remove('selected'));

    // Re-rendera planen. Fri dag/ångra ändrar inte receptmängden → ingen ny
    // inköpslista skickas; återanvänd senaste shop-summering så ingrediens-
    // förhandsvisningen på veckovyn inte blankas.
    const shop = data.shoppingList || window._lastShop || null;
    renderWeeklyPlanData(data.weeklyPlan, shop);

    // Uppdatera inköpslistan bara om servern skickade en ny
    if (data.shoppingList && window.renderShoppingData) {
      window.renderShoppingData(data.shoppingList);
    }
  } catch (e) {
    const panel = document.getElementById('weekRecipeDetail');
    const errEl = document.createElement('p');
    errEl.style.cssText = 'color:var(--rust);font-size:0.82rem;padding:0.5rem 1rem';
    const actionMsg = { free: 'göra fri', unfree: 'ångra fri dag på' };
    const fallback = `Kunde inte ${actionMsg[action] || 'ändra'} dagen — prova igen.`;
    errEl.textContent = (e.message && e.message !== 'Okänt fel') ? e.message : fallback;
    panel.innerHTML = '';
    panel.appendChild(errEl);
    panel.classList.add('open');
  } finally {
    cards.forEach(c => c.style.pointerEvents = '');
  }
}

export function freeDay(date) { return modifyDay(date, 'free'); }
export function unfreeDay(date) { return modifyDay(date, 'unfree'); }

export function openBlockedDay(dateIso, dayName) {
  const panel = document.getElementById('weekRecipeDetail');
  document.querySelectorAll('.week-day-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`.week-day-card[data-date="${dateIso}"]`);
  if (card) card.classList.add('selected');

  const dateLabel = fmtShort(dateIso);
  const todayIso = new Date().toISOString().slice(0, 10);
  const isPast = dateIso < todayIso;

  // På passerade fri-dagar är "Ångra fri dag" meningslöst (kan inte skjuta
  // planen från en redan förbrukad dag). Bara notering-fältet visas.
  const unfreeBtn = isPast ? '' : `
      <button type="button" class="custom-option" onclick="unfreeDay('${dateIso}')">
        <span class="custom-option-icon" aria-hidden="true">${ICON_CALENDAR}</span>
        <span class="custom-option-label">Ångra fri dag — skjut ihop matsedeln</span>
        <span class="custom-option-chev" aria-hidden="true">›</span>
      </button>`;
  const notePlaceholder = isPast
    ? 'T.ex. rester, åt ute, beställde hem…'
    : 'T.ex. pizza, rester, äter ute…';

  panel.innerHTML = `<div class="detail-inner custom-day-editor">
    <div class="custom-day-header">
      <div class="custom-day-title">${dayName}</div>
      <div class="custom-day-sub">${dateLabel} · Fri dag</div>
    </div>
    <div class="custom-options">${unfreeBtn}
      <div class="custom-option custom-option-note">
        <div class="custom-option-head">
          <span class="custom-option-icon" aria-hidden="true">${ICON_NOTE}</span>
          <span class="custom-option-label">Skriv egen notering</span>
        </div>
        <input type="text" id="blockedDayNote" class="custom-note-input" maxlength="140"
               placeholder="${notePlaceholder}">
        <button type="button" class="custom-note-save" onclick="convertBlockedToCustom('${dateIso}')">Spara notering</button>
      </div>
    </div>
  </div>`;
  panel.classList.add('open');
  window.isSnapping = true;
  window.scrollUpAccum = 0;
  document.querySelector('header').classList.remove('header-hidden');
  const hh = document.querySelector('header').offsetHeight;
  const top = panel.getBoundingClientRect().top + window.scrollY - hh - 8;
  window.smoothScrollTo(top, 380);
}

export async function convertBlockedToCustom(dateIso) {
  const note = document.getElementById('blockedDayNote')?.value?.trim();
  if (!note) return;
  try {
    await postCustomDays('set', [dateIso], note);
    window.loadWeeklyPlan();
  } catch { /* tyst */ }
}

// ── Besparings-popover ───────────────────────────────────────────────────────

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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
    message: 'Den föreslagna matsedeln tas bort. Dina tidigare matsedlar och inköpslistan påverkas inte.',
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
    const res = await fetch('/api/discard-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    let data = {};
    try { data = await res.json(); } catch { /* ingen JSON */ }
    if (!res.ok) throw new Error(data.error || `Serverfel ${res.status}`);

    window.planConfirmed = false;
    const panel = document.getElementById('weekRecipeDetail');
    panel.classList.remove('open');
    panel.innerHTML = '';

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
  } catch (e) {
    btn.disabled = false;
    if (confirmBtn) confirmBtn.disabled = false;
    btn.textContent = 'Kassera förslag';
    statusEl.textContent = `Kunde inte kassera: ${e.message || 'okänt fel'} — prova igen.`;
    statusEl.className = 'confirm-status';
    console.error('discardPlan error:', e);
  }
}

export async function confirmPlan() {
  const btn      = document.getElementById('confirmPlanBtn');
  const statusEl = document.getElementById('confirmStatus');
  btn.disabled    = true;
  btn.textContent = 'Bygger inköpslista…';
  statusEl.textContent = '';

  try {
    const res  = await fetch('/api/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');

    window.planConfirmed = true;
    document.getElementById('confirmPlanWrap').style.display = 'none';
    // Bekräftad plan → ta bort snabbåtgärderna (slumpa/byt dag) från korten
    document.querySelectorAll('.day-card-actions').forEach(b => b.remove());

    const panel = document.getElementById('weekRecipeDetail');
    panel.classList.remove('open');
    panel.innerHTML = '';
    document.querySelectorAll('.week-day-card').forEach(c => c.classList.remove('selected'));

    window.renderIngredientPreview(
      data.shoppingList?.recipeItems || null,
      data.shoppingList?.recipeItemsMovedAt || null,
      true
    );
    window.showToast?.('Matsedeln bekräftad — veckans ingredienser är klara.', { type: 'success' });
  } catch (e) {
    btn.disabled    = false;
    btn.textContent = '✓ Bekräfta och bygg inköpslista';
    statusEl.textContent = 'Kunde inte bekräfta — prova igen.';
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
  window._lastShop = shop;

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
  const pendingPlan = hasActivePlan && !confirmed;

  const navWrap = document.getElementById('timelineNav');
  const timeline = buildTimeline(plan, archiveData, customData);

  // ── Nav-chips (Historik · Idag · Matsedel →) ───────────────────────────────
  if (navWrap) {
    if (window._archiveExpanded === undefined) window._archiveExpanded = false;
    const archiveDayCount = timeline.filter(d => d.isArchive).length;
    const chips = [];
    if (archiveDayCount > 0) {
      const archiveLbl = window._archiveExpanded ? 'Dölj historik' : `Historik (${archiveDayCount})`;
      chips.push(`<button class="timeline-chip timeline-chip-archive" onclick="toggleArchive()">${archiveLbl}</button>`);
    }
    chips.push('<button class="timeline-chip" onclick="centerOnDate(null, { smooth: true })">Idag</button>');
    if (hasActivePlan && plan.startDate) {
      const planLabel = pendingPlan ? 'Ny matsedel →' : 'Matsedel →';
      chips.push(`<button class="timeline-chip timeline-chip-plan${pendingPlan ? ' pending' : ''}" onclick="centerOnDate('${plan.startDate}', { smooth: true })">${planLabel}</button>`);
    }
    navWrap.innerHTML = chips.join('');
    navWrap.style.display = '';
  }
  window._timelineByDate = Object.fromEntries(timeline.map((d) => [d.date, d]));
  let prevPlanId = null;
  let prevMonth = null;
  let prevWeek = null;

  document.getElementById('weekGrid').innerHTML = timeline.map((d, idx) => {
    const planChanged = d.planId && d.planId !== prevPlanId;
    const monthChanged = d.month !== prevMonth;
    const weekChanged = idx > 0 && d.weekNumber !== prevWeek;
    prevPlanId = d.planId;
    prevMonth = d.month;
    prevWeek = d.weekNumber;

    const monthLabel = monthChanged
      ? `<span class="timeline-month-tag">${MONTH_NAMES_LONG[d.month]}</span>`
      : '';
    const weekLabel = weekChanged
      ? `<span class="timeline-week-tag">v. ${d.weekNumber}</span>`
      : '';
    const planLabel = planChanged
      ? `<span class="timeline-plan-tag">Matsedel ${d.planLabel}</span>`
      : '';
    const topRow = `<div class="timeline-day-top">${monthLabel}${weekLabel}${planLabel}</div>`;

    const isPendingActive = d.planId === 'active' && pendingPlan;
    const timelineDayClsParts = ['timeline-day'];
    if (weekChanged) timelineDayClsParts.push('week-start');
    // Slim om dagen saknar innehåll: fri-dag utan anteckning, gap-dag, eller
    // tom custom-day. Med recept eller anteckning → normal bredd.
    const hasContent = !!d.recipeId || (d.isCustom && (d.customNote || d.customRecipeId));
    if (!hasContent) timelineDayClsParts.push('slim');
    if (d.isToday) timelineDayClsParts.push('is-today');
    if (d.isPast) timelineDayClsParts.push('is-past');
    if (d.isWeekend) timelineDayClsParts.push('is-weekend');
    if (d.isArchive) timelineDayClsParts.push('archive-day');
    const timelineDayCls = timelineDayClsParts.join(' ');

    const clsParts = ['week-day-card'];
    if (d.isToday) clsParts.push('today');
    else if (d.isPast) clsParts.push('past');
    if (d.isWeekend) clsParts.push('weekend');
    if (d.holiday) clsParts.push('holiday');
    if (d.blocked) clsParts.push('blocked');
    if (d.isArchive) clsParts.push('archive');
    if (d.isCustom) clsParts.push('custom');
    if (!d.planId && !d.isCustom) clsParts.push('gap');
    if (d.planColorIndex !== null && d.planColorIndex >= 0) {
      clsParts.push(`plan-color-${d.planColorIndex}`);
    } else if (d.planId === 'active') {
      clsParts.push('plan-active');
    }
    if (isPendingActive) clsParts.push('plan-pending');
    const cls = clsParts.join(' ');

    const holidayDot = d.holiday
      ? `<span class="holiday-dot" title="${d.holiday}" aria-label="${d.holiday}"></span>`
      : '';
    const dateRow = `<div class="timeline-day-date">${d.dayShort} ${d.dayNum}${holidayDot}</div>`;
    const pendingBadge = isPendingActive
      ? '<span class="pending-badge" title="Ingår i matsedeln du ska godkänna">NY</span>'
      : '';

    // Custom-dag (egen planering)
    if (d.isCustom) {
      // Med valt recept: öppna receptet i read-only-läge (knapparna döljs via data-readonly="1")
      if (d.customRecipeId) {
        const title = d.customRecipeTitle || '';
        const safeTitle = title.replace(/'/g, "\\'");
        return `<div class="${timelineDayCls}">
          ${topRow}
          ${dateRow}
          <div class="${cls} custom-has-recipe" data-date="${d.date}" data-day="${d.day}"
            data-recipeid="${d.customRecipeId}" data-readonly="1" data-custom="1"
            onclick="openWeekRecipe(${d.customRecipeId}, '${safeTitle}', this)">
            <div class="week-day-recipe">${ICON_POT} ${title}</div>
          </div>
        </div>`;
      }
      // Bara notering
      const noteEsc = (d.customNote || '').replace(/"/g, '&quot;');
      return `<div class="${timelineDayCls}">
        ${topRow}
        ${dateRow}
        <div class="${cls}" data-date="${d.date}" data-day="${d.day}"
          onclick="openCustomDay('${d.date}', '${d.day}')">
          <div class="week-day-recipe custom-note" title="${noteEsc}">${d.customNote ? esc(d.customNote) : '✏️ Egen'}</div>
        </div>
      </div>`;
    }

    // Gap (ingen plan, inget custom) eller blockerad dag utan recept
    if (!d.recipeId) {
      const label = d.blocked ? 'Fri dag' : '—';
      // Fri dag är alltid klickbar — även passerad, så man kan skriva en
      // post-hoc notering ("Vi åt rester"). Gap-dagar bara framåt.
      let onclick = '';
      if (d.blocked) {
        onclick = ` onclick="openBlockedDay('${d.date}', '${d.day}')"`;
      } else if (!d.isPast && !d.planId) {
        onclick = ` onclick="openCustomDay('${d.date}', '${d.day}')"`;
      }
      return `<div class="${timelineDayCls}">
        ${topRow}
        ${dateRow}
        <div class="${cls}" data-date="${d.date}" data-day="${d.day}"${onclick}>
          <div class="week-day-recipe blocked-recipe-text">${label}</div>
        </div>
      </div>`;
    }

    const safeTitle = (d.recipe || '').replace(/'/g, "\\'");
    const rid = d.recipeId;
    const recipe = rid ? window.RECIPES.find(r => r.id === rid) : null;
    const proteinColor = recipe ? (PROTEIN_COLOR[recipe.protein] || '') : '';
    const borderStyle = proteinColor ? ` style="border-left: 3px solid ${proteinColor}"` : '';

    // Snabbåtgärder på aktiv, icke-bekräftad plandag: slumpa nytt recept + byt dag.
    // Visas när kortet är markerat (se CSS .week-day-card.selected .day-card-actions).
    const showDayActions = d.planId === 'active' && !d.blocked && !window.planConfirmed && !!rid;
    const swapBtn = showDayActions
      ? `<div class="day-card-actions">
           <button class="card-icon-btn" title="Slumpa nytt recept"
             onclick="event.stopPropagation();shuffleDay('${d.date}', this)"
           >${ICON_SHUFFLE}</button>
           <button class="card-icon-btn" title="Flytta till annan dag"
             onclick="event.stopPropagation();enterSwapMode('${d.date}')"
           ><svg xmlns="http://www.w3.org/2000/svg" width="13" height="10" viewBox="0 0 13 10"
             fill="none" stroke="currentColor" stroke-width="1.6"
             stroke-linecap="round" stroke-linejoin="round">
             <path d="M1 2.5h11M9 0.5l2.5 2L9 4.5"/>
             <path d="M12 7.5H1M4 5.5L1.5 7.5 4 9.5"/>
           </svg></button>
         </div>`
      : '';
    let savingBadge = '';
    if (d.saving && d.saving >= 10) {
      if (d.savingMatches?.length) {
        savingBadge = `<button type="button" class="week-day-saving has-details"
           title="Tryck för att se var besparingen sker"
           onclick="event.stopPropagation();openSavingPopover('${d.date}')">${ICON_COIN} ${d.saving} kr</button>`;
      } else {
        savingBadge = `<div class="week-day-saving" title="Uppskattad besparing jämfört med normalpris">${ICON_COIN} ${d.saving} kr</div>`;
      }
    }
    const readOnly = d.isArchive;
    return `<div class="${timelineDayCls}">
      ${topRow}
      ${dateRow}
      <div class="${cls}"${borderStyle}
        data-recipeid="${rid}" data-date="${d.date}" data-day="${d.day}"
        data-readonly="${readOnly ? '1' : ''}" data-past="${d.isPast ? '1' : ''}"
        onclick="openWeekRecipe(${rid || 'null'}, '${safeTitle}', this)">
        <div class="week-day-recipe">${d.recipe}</div>
        ${recipe?.time ? `<div class="week-day-time">${recipe.time} min</div>` : ''}
        ${savingBadge}
        ${pendingBadge}
        ${swapBtn}
      </div>
    </div>`;
  }).join('');

  // ── Bulk "markera som egen planering" för tomma dagar före planstart ─────
  renderCustomBulkBanner(timeline, plan);

  // ── Scroll: till planstart om ny/opåbörjad plan, annars till idag ──────
  requestAnimationFrame(() => {
    if (pendingPlan && plan.startDate) {
      centerOnDate(plan.startDate, { smooth: false });
    } else {
      centerOnDate(null, { smooth: false });
    }
    updateTimelineFades();
    document.getElementById('weekGrid')?.classList.toggle('archive-collapsed', !window._archiveExpanded);
    wrapPlanGroup(hasActivePlan ? plan : null);
  });

  initTimelineFadeListener();

  const confirmWrap   = document.getElementById('confirmPlanWrap');
  const confirmStatus = document.getElementById('confirmStatus');
  const confirmBtn    = document.getElementById('confirmPlanBtn');
  if (confirmWrap) {
    confirmWrap.style.display = (hasActivePlan && !confirmed) ? '' : 'none';
  }
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = '✓ Bekräfta och bygg inköpslista';
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
    renderWeeklyPlanData(plan, shop, false, archive, customDays);
    subscribeMealDays(householdId);
  } catch {
    document.getElementById('weekLoading').style.display = 'none';
    document.getElementById('weekNoData').style.display  = '';
  }
}

// ── Matsedel-gruppruta ────────────────────────────────────────────────────────

function wrapPlanGroup(plan) {
  const grid = document.getElementById('weekGrid');
  if (!grid) return;

  // Tear down any existing group (restore days to grid flow first)
  const existing = grid.querySelector('.plan-group');
  if (existing) {
    const daysRow = existing.querySelector('.plan-group-days');
    Array.from(daysRow?.children ?? []).forEach(d => existing.before(d));
    existing.remove();
  }
  if (!plan) return;

  const cards = grid.querySelectorAll('.week-day-card.plan-active, .week-day-card.plan-pending');
  if (!cards.length) return;

  const planDays = Array.from(
    new Set(Array.from(cards).map(c => c.closest('.timeline-day')).filter(Boolean))
  );
  if (!planDays.length) return;

  const group = document.createElement('div');
  group.className = 'plan-group';

  if (plan.startDate && plan.endDate) {
    const label = document.createElement('div');
    label.className = 'plan-backdrop-label';
    label.textContent = `Matsedel  ${fmtShort(plan.startDate)} – ${fmtShort(plan.endDate)}`;
    group.appendChild(label);
  }

  const daysRow = document.createElement('div');
  daysRow.className = 'plan-group-days';
  group.appendChild(daysRow);

  planDays[0].before(group);
  planDays.forEach(d => daysRow.appendChild(d));
}

// ── Egen planering (custom days) ──────────────────────────────────────────────

function renderCustomBulkBanner(timeline, plan) {
  const banner = document.getElementById('customBulkBanner');
  if (!banner) return;

  // Bara visa banner när det finns en aktiv plan i framtiden — annars är
  // "alla tomma dagar" en oändlig hink som är meningslös att markera.
  const cutoff = plan?.startDate;
  if (!cutoff) {
    banner.style.display = 'none';
    banner.innerHTML = '';
    return;
  }

  const emptyDates = timeline
    .filter(d => !d.isPast && !d.isToday && !d.recipeId && !d.isCustom && !d.planId && !d.blocked)
    .filter(d => d.date < cutoff)
    .map(d => d.date);

  if (emptyDates.length < 1) {
    banner.style.display = 'none';
    banner.innerHTML = '';
    return;
  }

  banner.style.display = '';
  banner.innerHTML = `
    <span class="custom-bulk-text">
      ${emptyDates.length} tom${emptyDates.length === 1 ? ' dag' : 'ma dagar'} innan matsedeln (${fmtShort(cutoff)})
    </span>
    <button class="custom-bulk-btn" onclick='openCustomBulk(${JSON.stringify(emptyDates)})'>
      ✏️ Markera ${emptyDates.length === 1 ? 'dagen' : 'alla'} som egen planering
    </button>
  `;
}

// Bygger editor-HTML:n för en egen-planering-dag. Bryts ut så premiumvyn kan
// rendera SAMMA editor inline i det utfällda kortet (annars hamnade den i den
// delade #weekRecipeDetail-panelen längst ner — såg ut som att fel kort fälldes
// ut). Knapparna kallar globala window-funktioner och bryr sig inte om var
// HTML:n sitter.
export function customDayEditorHtml(dateIso, dayName) {
  const existing = (window._customDays?.entries || {})[dateIso];
  const note = existing?.note || '';
  const hasExisting = !!existing;
  const todayIso = fmtIso(new Date());
  const isPastDay = dateIso < todayIso;

  const escDayName = (dayName || '').replace(/'/g, "\\'");
  const dateLabel = fmtShort(dateIso);
  const noteValue = note.replace(/"/g, '&quot;');

  const pickRecipeOption = !isPastDay ? `
    <button type="button" class="custom-option" onclick="enterCustomPickMode('${dateIso}', '${escDayName}')">
      <span class="custom-option-icon" aria-hidden="true">${ICON_POT}</span>
      <span class="custom-option-label">Välj recept ur receptboken</span>
      <span class="custom-option-chev" aria-hidden="true">›</span>
    </button>` : '';

  const noteOption = `
    <div class="custom-option custom-option-note">
      <div class="custom-option-head">
        <span class="custom-option-icon" aria-hidden="true">${ICON_NOTE}</span>
        <span class="custom-option-label">Egen notering</span>
      </div>
      <input type="text" id="customDayNote" class="custom-note-input" maxlength="140"
             placeholder="T.ex. pizza, rester, äter ute…"
             value="${noteValue}">
      <button type="button" class="custom-note-save" onclick="saveCustomDay('${dateIso}')">Spara notering</button>
    </div>`;

  const planOption = !isPastDay ? `
    <button type="button" class="custom-option" onclick="startPlanFromDate('${dateIso}')">
      <span class="custom-option-icon" aria-hidden="true">${ICON_CALENDAR}</span>
      <span class="custom-option-label">Starta matsedel från denna dag</span>
      <span class="custom-option-chev" aria-hidden="true">›</span>
    </button>` : '';

  const removeBtn = hasExisting
    ? `<button type="button" class="custom-day-remove" onclick="clearCustomDay('${dateIso}')">Ta bort markering</button>`
    : '';

  return `<div class="detail-inner custom-day-editor">
    <div class="custom-day-header">
      <div class="custom-day-title">${dayName}</div>
      <div class="custom-day-sub">${dateLabel}${hasExisting ? ' · egen planering' : ''}</div>
    </div>
    <div class="custom-options">
      ${pickRecipeOption}
      ${noteOption}
      ${planOption}
    </div>
    ${removeBtn}
  </div>`;
}

export function openCustomDay(dateIso, dayName) {
  const panel = document.getElementById('weekRecipeDetail');

  document.querySelectorAll('.week-day-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`.week-day-card[data-date="${dateIso}"]`);
  if (card) card.classList.add('selected');

  panel.innerHTML = customDayEditorHtml(dateIso, dayName);
  panel.classList.add('open');
  window.isSnapping = true;
  window.scrollUpAccum = 0;
  document.querySelector('header').classList.remove('header-hidden');
  const hh = document.querySelector('header').offsetHeight;
  const top = panel.getBoundingClientRect().top + window.scrollY - hh - 8;
  window.smoothScrollTo(top, 380);
}

export function openCustomBulk(dates) {
  const panel = document.getElementById('weekRecipeDetail');
  const count = Array.isArray(dates) ? dates.length : 0;
  if (!count) return;

  panel.innerHTML = `<div class="detail-inner custom-day-editor">
    <div class="week-recipe-header">
      <div class="week-recipe-title">✏️ Egen planering — ${count} dagar</div>
    </div>
    <label class="custom-day-label">
      Notering (valfritt, samma för alla ${count} dagarna)
      <input type="text" id="customDayNote" maxlength="140"
             placeholder="T.ex. Rester / improvisera / äter ute">
    </label>
    <div class="custom-day-actions">
      <button class="replace-recipe-btn" onclick='saveCustomDaysBulk(${JSON.stringify(dates)})'>Markera ${count} dagar</button>
    </div>
  </div>`;
  panel.classList.add('open');
  window.isSnapping = true;
  document.querySelector('header').classList.remove('header-hidden');
  const hh = document.querySelector('header').offsetHeight;
  const top = panel.getBoundingClientRect().top + window.scrollY - hh - 8;
  window.smoothScrollTo(top, 380);
}

async function postCustomDays(action, dates, note) {
  const householdId = await window.getHouseholdId();
  const entries = { ...(window._customDays?.entries || {}) };
  if (action === 'set') {
    await Promise.all(dates.map(async (date) => {
      const { data: row } = await window.db
        .from('meal_days').select('plan_id').eq('household_id', householdId).eq('date', date).maybeSingle();
      if (row && row.plan_id != null) return; // aldrig skriv över plan-dagar
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
}

export async function saveCustomDay(dateIso) {
  const input = document.getElementById('customDayNote');
  const note = input ? input.value : '';
  const btn = document.querySelector('.custom-note-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Sparar…'; }
  try {
    await postCustomDays('set', [dateIso], note);
    const panel = document.getElementById('weekRecipeDetail');
    panel.classList.remove('open');
    panel.innerHTML = '';
    renderWeeklyPlanData(
      window._lastPlan || null,
      window._lastShop || null,
      false,
      window._planArchive,
      window._customDays
    );
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Spara notering'; }
    const panel = document.getElementById('weekRecipeDetail');
    const err = document.createElement('p');
    err.style.cssText = 'color:var(--rust);font-size:0.82rem;padding:0.5rem 0';
    err.textContent = 'Kunde inte spara — prova igen.';
    panel.querySelector('.custom-day-editor')?.appendChild(err);
  }
}

export async function saveCustomDaysBulk(dates) {
  const input = document.getElementById('customDayNote');
  const note = input ? input.value : '';
  const btn = document.querySelector('.custom-day-actions .replace-recipe-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sparar…'; }
  try {
    await postCustomDays('set', dates, note);
    const panel = document.getElementById('weekRecipeDetail');
    panel.classList.remove('open');
    panel.innerHTML = '';
    renderWeeklyPlanData(
      window._lastPlan || null,
      window._lastShop || null,
      false,
      window._planArchive,
      window._customDays
    );
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = `Markera ${dates.length} dagar`; }
  }
}

export async function clearCustomDay(dateIso) {
  try {
    await postCustomDays('clear', [dateIso]);
    const panel = document.getElementById('weekRecipeDetail');
    panel.classList.remove('open');
    panel.innerHTML = '';
    renderWeeklyPlanData(
      window._lastPlan || null,
      window._lastShop || null,
      false,
      window._planArchive,
      window._customDays
    );
  } catch (e) { /* tyst — knappen står kvar */ }
}

window.enterReplaceMode    = enterReplaceMode;
window.exitReplaceMode     = exitReplaceMode;
window.selectRecipeForDay  = selectRecipeForDay;
window.enterSwapMode       = enterSwapMode;
window.cancelSwapMode      = cancelSwapMode;
window.swapDays            = swapDays;
window.replaceRecipe       = replaceRecipe;
window.shuffleDay          = shuffleDay;
window.openWeekRecipe      = openWeekRecipe;
window.freeDay             = freeDay;
window.toggleArchive       = toggleArchive;

function toggleArchive() {
  window._archiveExpanded = !window._archiveExpanded;
  document.getElementById('weekGrid')?.classList.toggle('archive-collapsed', !window._archiveExpanded);
  const chip = document.querySelector('.timeline-chip-archive');
  if (chip) {
    const count = document.querySelectorAll('.timeline-day.archive-day').length;
    chip.textContent = window._archiveExpanded ? 'Dölj historik' : `Historik (${count})`;
  }
}
window.openSavingPopover   = openSavingPopover;
function updateTimelineFades() {
  const outer = document.getElementById('timelineOuter');
  const wrap = outer?.querySelector('.timeline-wrap');
  if (!outer || !wrap) return;
  const threshold = 8;
  outer.classList.toggle('fade-left', wrap.scrollLeft > threshold);
  outer.classList.toggle('fade-right',
    wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - threshold);
}

let _fadeWrap = null;
function initTimelineFadeListener() {
  const wrap = document.querySelector('#timelineOuter .timeline-wrap');
  if (!wrap || wrap === _fadeWrap) return;
  wrap.addEventListener('scroll', updateTimelineFades, { passive: true });
  _fadeWrap = wrap;
}

window.closeSavingPopover  = closeSavingPopover;
window.confirmPlan         = confirmPlan;
window.discardPlan         = discardPlan;
window.renderWeeklyPlanData = renderWeeklyPlanData;
window.loadWeeklyPlan      = loadWeeklyPlan;
window.centerTodayCard     = centerTodayCard;
window.centerOnDate        = centerOnDate;
window.openCustomDay       = openCustomDay;
window.customDayEditorHtml = customDayEditorHtml;
window.openCustomBulk      = openCustomBulk;
window.openBlockedDay      = openBlockedDay;
window.saveCustomDay       = saveCustomDay;
window.saveCustomDaysBulk  = saveCustomDaysBulk;
window.clearCustomDay      = clearCustomDay;
window.unfreeDay           = unfreeDay;
window.convertBlockedToCustom = convertBlockedToCustom;
window.enterCustomPickMode = enterCustomPickMode;
window.exitCustomPickMode  = exitCustomPickMode;
window.selectRecipeForCustomDay = selectRecipeForCustomDay;
window.startPlanFromDate   = startPlanFromDate;
