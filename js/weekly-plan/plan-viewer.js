// Veckovyn: rendering, receptbyte, dagbyte, bekräftelse.
// Läser state: RECIPES, planConfirmed, isSnapping, scrollUpAccum
// Skriver state: planConfirmed, isSnapping, scrollUpAccum

import { fmtIso, fmtShort, PROTEIN_COLOR, getHolidayName, isoWeekNumber, escapeHtml } from '../utils.js';

const ICON_COIN = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 7.5v9 M9.5 9.7c.6-.7 1.5-1 2.5-1s2 .3 2.4 1c.5.8 0 1.7-1 2-.7.2-2.7.3-3.4.7-.9.4-1.4 1.3-.9 2.1.5.7 1.6 1 2.5 1s1.9-.3 2.5-1"/></svg>';
const ICON_POT = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13c0-3.5 3.5-6 8-6s8 2.5 8 6"/><path d="M3 13h18"/><path d="M5.5 13v2c0 1.5 1 2.5 2.5 2.5h8c1.5 0 2.5-1 2.5-2.5v-2"/><path d="M11 4.5c0-.8.5-1.5 1-1.5s1 .7 1 1.5"/></svg>';
const ICON_NOTE = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h11l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 11h8 M8 14h8 M8 17h5"/></svg>';
const ICON_CALENDAR = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>';

// ── Realtime-prenumeration för matsedeln ──────────────────────────────────────
let _planChannel = null;

function unsubscribeMealDays() {
  if (_planChannel) {
    window.db.removeChannel(_planChannel);
    _planChannel = null;
  }
}

// F231: ett meal_days-event som kommer in under en interaktion (byt-läge,
// deluxe-vyns byt/flytta-läge) eller vårt eget 4s-ekofönster fick tidigare
// bara kastas — ingen uppskjuten omhämtning schemalades, så vyn blev stale
// tills en helt orelaterad ändring råkade trigga en ny omladdning. Vi
// markerar nu planen som "stale" i stället och hämtar om så snart läget
// avslutas (se exitReplaceMode/exitCustomPickMode och switchTab-städningen
// nedan) eller ekofönstret löper ut.
function markPlanStale() {
  window._planStale = true;
}

function reloadIfStale() {
  if (!window._planStale) return;
  window._planStale = false;
  window.loadWeeklyPlan();
}

function subscribeMealDays(householdId) {
  if (_planChannel) return; // redan prenumererar
  _planChannel = window.db
    .channel(`meal_days:${householdId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_days', filter: `household_id=eq.${householdId}` }, () => {
      // Ladda inte om direkt om användaren är mitt i en interaktion — men
      // tappa inte eventet: markera planen som stale (F231).
      if (window.replaceMode || window.customPickMode) { markPlanStale(); return; }
      if (window._dlxSwap || window._dlxMove) { markPlanStale(); return; }   // premiumvyns byt/flytta-läge
      // Eko-dämpning: våra egna skrivningar har redan uppdaterat vyn från
      // API-svaret — hoppa över omhämtningen som annars orsakar ett blink.
      // Men fönstret är tidsbaserat och dämpar därför även partnerns
      // samtidiga skrivningar — schemalägg en uppskjuten omhämtning när
      // fönstret löper ut ifall eventet faktiskt var partnerns.
      if (window._planMutateUntil && Date.now() < window._planMutateUntil) {
        markPlanStale();
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
  window.dlxCloseSheet?.();   // lämna dag-sheeten när vi navigerar till receptboken
  window.replaceMode = { date, dayName };
  document.getElementById('replaceBannerDay').textContent = dayName;
  document.getElementById('receptView').classList.add('replace-mode');
  window.switchTab('recept');
}

export function exitReplaceMode() {
  window.replaceMode = null;
  document.getElementById('receptView').classList.remove('replace-mode');
  reloadIfStale();   // F231: hämta om ifall vi missade ett event under läget
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
    const res = await window.apiFetch('/api/replace-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, newRecipeId: recipeId }),
    });
    if (!res.ok) throw new Error();

    const data = await res.json();
    updateLastPlanDay(date, recipeId, title);
    window._planMutateUntil = Date.now() + 4000;   // dämpa realtids-ekot, se suppressEcho() i plan-viewer-deluxe.js
    if (data.shoppingList) {
      window.renderIngredientPreview(
        data.shoppingList.recipeItems || null,
        data.shoppingList.recipeItemsMovedAt || null,
        false
      );
      if (window.renderShoppingData) window.renderShoppingData(data.shoppingList);
    }
    exitReplaceMode();
    renderWeeklyPlanData(window._lastPlan || null, window._lastShop || null, false, window._planArchive, window._customDays);
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
  window.dlxCloseSheet?.();   // lämna dag-sheeten när vi navigerar till receptboken
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
  reloadIfStale();   // F231: hämta om ifall vi missade ett event under läget
}

export async function selectRecipeForCustomDay(event, recipeId, title) {
  event.stopPropagation();
  if (!window.customPickMode) return;
  if (window._opBusy) return;   // delad spärr med premiumvyn (backlog #10)
  window._opBusy = true;
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
    } else {
      // Dagen tillhör nu en aktiv plan (t.ex. genererad från en annan enhet
      // medan sheeten var öppen) — skriv aldrig över plan-dagar (invariant #1).
      // Utan denna gren föll koden tyst igenom till "sparat"-vägen (F042).
      dbErr = new Error('Dagen ingår nu i en matsedel — kunde inte spara.');
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
  } finally {
    window._opBusy = false;
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

// ── Fri dag (gör fri / ångra fri) ────────────────────────────────────────────

async function modifyDay(date, action) {
  if (window._opBusy) return;   // delad spärr med premiumvyn (backlog #10)
  window._opBusy = true;
  try {
    const res = await window.apiFetch('/api/skip-day', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, action }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');

    // Fri dag-editorn bor i dag-sheeten → stäng den vid lyckat resultat.
    window.dlxCloseSheet?.();

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
    const actionMsg = { free: 'göra fri', unfree: 'ångra fri dag på' };
    const fallback = `Kunde inte ${actionMsg[action] || 'ändra'} dagen — prova igen.`;
    window.showToast?.((e.message && e.message !== 'Okänt fel') ? e.message : fallback, { type: 'error' });
  } finally {
    window._opBusy = false;
  }
}

export function freeDay(date) { return modifyDay(date, 'free'); }
export function unfreeDay(date) { return modifyDay(date, 'unfree'); }

// Editor-HTML för en fri dag — renderas inline i premiumvyns utfällda kort
// (samma mönster som customDayEditorHtml). Knapparna kallar globala
// window-funktioner och bryr sig inte om var HTML:n sitter.
export function blockedDayEditorHtml(dateIso, dayName) {
  const dateLabel = fmtShort(dateIso);
  const todayIso = fmtIso(new Date());
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

  return `<div class="detail-inner custom-day-editor">
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
}
window.blockedDayEditorHtml = blockedDayEditorHtml;

export async function convertBlockedToCustom(dateIso) {
  const note = document.getElementById('blockedDayNote')?.value?.trim();
  if (!note) return;
  if (window._opBusy) return;   // delad spärr med premiumvyn (backlog #10)
  window._opBusy = true;
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
    const res = await window.apiFetch('/api/discard-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    let data = {};
    try { data = await res.json(); } catch { /* ingen JSON */ }
    if (!res.ok) throw new Error(data.error || `Serverfel ${res.status}`);

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
    const res  = await window.apiFetch('/api/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');

    window.planConfirmed = true;
    document.getElementById('confirmPlanWrap').style.display = 'none';
    // Bekräftad plan → ta bort snabbåtgärderna (slumpa/byt dag) från korten
    document.querySelectorAll('.day-card-actions').forEach(b => b.remove());

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
  if (window._opBusy) return;   // delad spärr med premiumvyn (backlog #10)
  const input = document.getElementById('customDayNote');
  const note = (input?.value || '').trim();
  const hasExisting = !!(window._customDays?.entries || {})[dateIso];
  // Tomt fält på en dag som ännu inte är egen-planering → gör inget (speglar
  // convertBlockedToCustom). Annars skapades en innehållslös custom-dag som
  // genereringen sedan permanent hoppar över (F255).
  if (!note && !hasExisting) return;
  window._opBusy = true;
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
    if (btn) { btn.disabled = false; btn.textContent = 'Spara notering'; }
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
  if (window._opBusy) return;   // delad spärr med premiumvyn (backlog #10)
  window._opBusy = true;
  try {
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
// enterReplaceMode/enterCustomPickMode och deluxe-vyns byt/flytta-läge
// (_dlxSwap/_dlxMove) stänger av realtime-plansynken (subscribeMealDays ovan)
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
      window.dlxCancelSwap?.();
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
window.freeDay             = freeDay;
window.openSavingPopover   = openSavingPopover;
window.closeSavingPopover  = closeSavingPopover;
window.confirmPlan         = confirmPlan;
window.discardPlan         = discardPlan;
window.renderWeeklyPlanData = renderWeeklyPlanData;
window.loadWeeklyPlan      = loadWeeklyPlan;
window.customDayEditorHtml = customDayEditorHtml;
window.saveCustomDay       = saveCustomDay;
window.clearCustomDay      = clearCustomDay;
window.unfreeDay           = unfreeDay;
window.convertBlockedToCustom = convertBlockedToCustom;
window.enterCustomPickMode = enterCustomPickMode;
window.exitCustomPickMode  = exitCustomPickMode;
window.selectRecipeForCustomDay = selectRecipeForCustomDay;
window.startPlanFromDate   = startPlanFromDate;
