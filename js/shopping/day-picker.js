// Dagväljaren — manuellt steg som skickar valda dagars ingredienser till
// inköpslistan (Session 134).
//
// Ersätter det automatiska bygget som tidigare skedde när matsedeln
// bekräftades: familjen handlar sällan för hela planen på en gång, så listan
// ska spegla exakt de dagar man tänker handla för — varken mer eller mindre.
//
// Semantik (samma som serverns action:set_days): rutorna visar vilka dagar
// listan täcker EFTER sparningen. Förbockade = ligger på listan nu. En redan
// inhandlad dag går att bocka i igen — servern nollar spärren, så "oavsett om
// det är gjort tidigare" gäller. Bockar man UR en dag försvinner dess varor.
//
// Läser state: window._timelineByDate (byggs av plan-viewer.js), window._opBusy
// Skriver state: window._shopDayPick (urvalet medan sheeten är öppen)

import { fmtIso, escapeHtml, isoWeekNumber } from '../utils.js';

const DAY_NAMES_LONG = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];

// Hur långt bakåt dagar visas utan att man fällt ut "tidigare dagar".
const PAST_DAYS_VISIBLE = 2;

function dayTitle(d) {
  return d.recipe || d.customRecipeTitle || '';
}

// Dagar som går att handla för: har ett recept och är inte en fri dag.
// Källa är tidslinjen (aktiv plan + egna dagar + arkiv) — samma karta som
// matsedeln renderas från, så väljaren visar exakt det familjen ser i appen.
//
// Genererar man två matsedlar efter varandra behålls den förstas dagar numera
// som egna dagar (detachOldPlanDays, Session 137) — de är alltså vanliga dagar
// i väljaren, utan särbehandling. Kvarvarande arkivdagar från tiden före den
// ändringen ingår också: servern återskapar raden när dagen väljs
// (restoreArchivedDays) och de märks "Äldre planering" tills migration 011 har
// materialiserat dem.
function pickableDays() {
  const byDate = window._timelineByDate || {};
  return Object.values(byDate)
    .filter((d) => !d.blocked && (d.recipeId || d.customRecipeId) && dayTitle(d))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Dagar som ligger på den aktiva listan just nu (o-inhandlade) = förvalet.
function currentlyCovered(days) {
  return days.filter((d) => d.onList && !d.shoppedAt).map((d) => d.date);
}

function state() {
  return window._shopDayPick || null;
}

export async function openShoppingDayPicker() {
  // Väljaren bygger på tidslinjen. Har Matsedeln aldrig renderats denna session
  // (t.ex. användaren gick direkt till Inköp) finns den inte — hämta först.
  if (!window._timelineByDate && window.loadWeeklyPlan) {
    try { await window.loadWeeklyPlan(); } catch { /* felet visas nedan som "inga dagar" */ }
  }

  const days = pickableDays();
  window._shopDayPick = {
    selected: new Set(currentlyCovered(days)),
    initial: new Set(currentlyCovered(days)),
    showPast: false,
    busy: false,
  };

  renderShopDayPicker();
  window.openBottomSheet?.('shopDaysSheet');
  initDragToClose();
}

export function closeShoppingDayPicker() {
  const panel = document.getElementById('shopDaysPanel');
  if (panel) { panel.style.transition = ''; panel.style.transform = ''; }
  window.closeBottomSheet?.('shopDaysSheet');
  window._shopDayPick = null;
}

// Bockning ritar INTE om listan — en innerHTML-ersättning skulle nolla
// scrollpositionen mitt i urvalet (mobilen scrollar tillbaka till toppen vid
// varje kryss). Raden markeras på plats och bara foten ritas om.
export function toggleShopDay(date, checked) {
  const s = state();
  if (!s || !date) return;
  if (checked) s.selected.add(date);
  else s.selected.delete(date);

  const row = document.querySelector(`.daypick-check[data-date="${CSS.escape(date)}"]`)?.closest('.daypick-row');
  if (row) row.classList.toggle('is-selected', checked);
  renderShopDayFoot();
}

export function showEarlierShopDays() {
  const s = state();
  if (!s) return;
  s.showPast = true;
  renderShopDayPicker();
}

// "Hela matsedeln" = alla väljbara dagar från idag och framåt (aktiva planen +
// egna dagar, inte arkivet) — den vanligaste storhandlingen med ett tryck.
export function selectWholePlan() {
  const s = state();
  if (!s) return;
  const todayIso = fmtIso(new Date());
  pickableDays()
    .filter((d) => !d.isArchive && d.date >= todayIso)
    .forEach((d) => s.selected.add(d.date));
  renderShopDayPicker();
}

export function clearShopDaySelection() {
  const s = state();
  if (!s) return;
  s.selected.clear();
  renderShopDayPicker();
}

function dayRowHtml(d, selected) {
  const num = new Date(d.date + 'T12:00:00').getDate();
  const dow = new Date(d.date + 'T12:00:00').getDay();
  const label = `${DAY_NAMES_LONG[dow]} ${num}/${new Date(d.date + 'T12:00:00').getMonth() + 1}`;
  const chips = [];
  if (d.shoppedAt) chips.push('<span class="daypick-chip is-shopped">Inhandlad</span>');
  else if (d.onList) chips.push('<span class="daypick-chip is-onlist">På listan</span>');
  if (d.isToday) chips.push('<span class="daypick-chip is-today">Idag</span>');
  if (d.isArchive) chips.push('<span class="daypick-chip is-archive">Äldre planering</span>');

  return `<label class="daypick-row${selected ? ' is-selected' : ''}">
    <input type="checkbox" class="daypick-check" ${selected ? 'checked' : ''}
           data-date="${escapeHtml(d.date)}"
           aria-label="${escapeHtml(`${label} — ${dayTitle(d)}`)}"
           onchange="toggleShopDay(this.dataset.date, this.checked)">
    <span class="daypick-main">
      <span class="daypick-day">${escapeHtml(label)}</span>
      <span class="daypick-recipe">${escapeHtml(dayTitle(d))}</span>
    </span>
    <span class="daypick-chips">${chips.join('')}</span>
  </label>`;
}

export function renderShopDayPicker() {
  const s = state();
  const body = document.getElementById('shopDaysBody');
  const foot = document.getElementById('shopDaysFoot');
  if (!s || !body || !foot) return;

  const all = pickableDays();
  if (!all.length) {
    body.innerHTML = `<p class="daypick-empty">Inga dagar med recept ännu — skapa en matsedel eller planera en egen dag först.</p>`;
    foot.innerHTML = '';
    return;
  }

  const todayIso = fmtIso(new Date());
  const cutoff = fmtIso(new Date(Date.now() - PAST_DAYS_VISIBLE * 86400000));
  // Bockade tidigare dagar visas alltid — annars skulle ett urval kunna ändras
  // av en dag användaren inte ser.
  const visible = s.showPast
    ? all
    : all.filter((d) => d.date >= cutoff || s.selected.has(d.date));
  const hiddenCount = all.length - visible.length;

  let html = '';
  if (hiddenCount > 0) {
    html += `<button type="button" class="daypick-more" onclick="showEarlierShopDays()">
      Visa ${hiddenCount} tidigare ${hiddenCount === 1 ? 'dag' : 'dagar'}
    </button>`;
  }

  let lastWeek = null;
  for (const d of visible) {
    const week = isoWeekNumber(d.date);
    if (week !== lastWeek) {
      lastWeek = week;
      html += `<div class="daypick-week">Vecka ${week}</div>`;
    }
    html += dayRowHtml(d, s.selected.has(d.date));
  }
  body.innerHTML = html;
  renderShopDayFoot();
}

// Sammanfattning + knappar. Egen funktion så bockning kan uppdatera foten utan
// att röra listan (se toggleShopDay).
export function renderShopDayFoot() {
  const s = state();
  const foot = document.getElementById('shopDaysFoot');
  if (!s || !foot) return;

  const n = s.selected.size;
  const removed = [...s.initial].filter((d) => !s.selected.has(d)).length;
  const summary = n === 0
    ? 'Inga dagar valda — receptvarorna tas bort från listan (egna tillägg står kvar).'
    : `Listan kommer att täcka <strong>${n} ${n === 1 ? 'middag' : 'middagar'}</strong>${removed ? ` · ${removed} ${removed === 1 ? 'dag tas bort' : 'dagar tas bort'}` : ''}.`;

  foot.innerHTML = `
    <p class="daypick-summary">${summary}</p>
    <div class="daypick-quick">
      <button type="button" class="daypick-quick-btn" onclick="selectWholePlan()">Hela matsedeln</button>
      <button type="button" class="daypick-quick-btn" onclick="clearShopDaySelection()">Rensa alla</button>
    </div>
    <button type="button" class="daypick-save" id="shopDaysSaveBtn" onclick="saveShoppingDayPick()"${s.busy ? ' disabled' : ''}>
      ${s.busy ? 'Bygger inköpslistan…' : 'Skicka ingredienser till inköpslistan'}
    </button>
    <button type="button" class="daypick-cancel" onclick="closeShoppingDayPicker()"${s.busy ? ' disabled' : ''}>Avbryt</button>`;
}

export async function saveShoppingDayPick() {
  const s = state();
  if (!s || s.busy || window._opBusy) return;

  const dates = [...s.selected].sort();
  const removed = [...s.initial].filter((d) => !s.selected.has(d));

  // Bara borttagningar bekräftas — att lägga TILL dagar är alltid ofarligt.
  if (removed.length) {
    const ok = await window.confirmDialog({
      title: dates.length ? 'Ta bort dagar från listan?' : 'Töm receptvarorna?',
      message: dates.length
        ? `${removed.length} ${removed.length === 1 ? 'dags' : 'dagars'} varor försvinner från inköpslistan. Egna tillägg och bockade varor du behåller påverkas inte.`
        : 'Alla receptvaror tas bort från inköpslistan. Egna tillägg står kvar.',
      confirmLabel: dates.length ? 'Uppdatera listan' : 'Töm receptvarorna',
      danger: true,
    });
    if (!ok) return;
  }

  s.busy = true;
  renderShopDayPicker();
  try {
    await commitShopDays(dates);
  } finally {
    if (state()) { state().busy = false; renderShopDayPicker(); }
  }
}

// EN skrivväg för "vilka dagar ligger på listan" — används av dagväljarens
// spara-knapp och av dagbrickorna på Inköp-fliken. `dates` = hela det önskade
// urvalet (servern: action set_days). Felet visas som toast (aldrig kastat);
// returnerar true när listan uppdaterades. quiet = brickorna: ingen
// bekräftelsetoast (brickan själv visar resultatet) och ingen flikväxling.
async function commitShopDays(dates, { quiet = false } = {}) {
  window._opBusy = true;
  try {
    const res = await window.apiFetch('/api/shopping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_days', dates }),
    });
    let data = {};
    try { data = await res.json(); } catch { /* ingen JSON */ }
    if (!res.ok) throw Object.assign(new Error(data.error || ''), { serverMsg: data.error });

    if (state()) closeShoppingDayPicker();
    window._planMutateUntil = Date.now() + 4000;   // dämpa realtids-ekot
    // Inköp-fliken: nya listan ritas direkt ur svaret (switchTab nedan
    // uppdaterar den sedan tyst, utan spinner).
    if (data.shoppingList && window.renderShoppingData) {
      // Batch D1: Matsedeln uppdateras ur svaret. Täckningspekarna sätts av
      // renderShoppingData → applyShopListToPlan; återlagda dagar (servern
      // nollade spärren) nollas lokalt här — ingen omhämtning av planen.
      for (const d of (data.restoredDates || [])) {
        const pd = (window._lastPlan?.days || []).find((x) => x.date === d); if (pd) pd.shoppedAt = null;
        const cd = window._customDays?.entries?.[d]; if (cd) cd.shoppedAt = null;
      }
      window.renderShoppingData(data.shoppingList);
      if ((data.restoredDates || []).length) window.rerenderPlan?.();
    } else {
      window._preserveChecked = false;
      await window.loadWeeklyPlan?.(); // reserv: svaret saknade listan
    }

    const n = (data.coveredDates || dates).length;
    const skipped = (data.skipped || []).length;
    const msg = n === 0
      ? 'Receptvarorna är borta från inköpslistan — dina egna tillägg står kvar.'
      : `Ingredienserna för ${n} ${n === 1 ? 'middag' : 'middagar'} ligger nu på inköpslistan.`;
    const skipMsg = skipped ? `${skipped} ${skipped === 1 ? 'dag' : 'dagar'} hoppades över (saknar recept).` : '';
    if (!quiet) window.showToast?.(skipMsg ? `${msg} ${skipMsg}` : msg, { type: 'success' });
    else if (skipMsg) window.showToast?.(skipMsg, { type: 'success' });
    if (!quiet || document.body.dataset.activeTab !== 'shop') window.switchTab?.('shop');
    return true;
  } catch (e) {
    window.showToast?.(e?.serverMsg || 'Kunde inte uppdatera inköpslistan — prova igen.', { type: 'error' });
    return false;
  } finally {
    window._opBusy = false;
  }
}

// ── Dagbrickor överst på Inköp-fliken ────────────────────────────────────────
// "Listan gäller middagarna": en bricka per kommande receptdag (idag t.o.m.
// nästa veckas söndag, plus dagar som redan ligger på listan utanför det
// fönstret). Tre lägen — på listan / inte på listan / redan inhandlad. Tryck
// slår av/på dagen via commitShopDays (samma som dagväljarens spara-knapp).
// "Fler dagar" öppnar dagväljaren (tidigare dagar, hela matsedeln …).
// Läser: window._timelineByDate (samma källa som dagväljaren). Skriver inget
// delat state — bara _chipBusyDate (vilken bricka som väntar).
const DAY_NAMES_SHORT = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
let _chipBusyDate = null;
let _chipsHtml = null;
let _chipsLoading = false;

function chipWindowEnd() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;            // måndag = 0
  d.setDate(d.getDate() + (6 - dow) + 7);      // söndag nästa vecka
  return fmtIso(d);
}

function chipDays() {
  const todayIso = fmtIso(new Date());
  const end = chipWindowEnd();
  return pickableDays().filter((d) => {
    const active = d.onList && !d.shoppedAt;
    if (d.isArchive && !active) return false;
    if (active) return true;                    // på listan syns alltid (annars går den inte att ta bort)
    return d.date >= todayIso && d.date <= end;
  });
}

function chipHtml(d, dupDow) {
  const dow = new Date(d.date + 'T12:00:00').getDay();
  const mode = d.shoppedAt ? 'shopped' : (d.onList ? 'on' : 'off');
  const busy = _chipBusyDate === d.date;
  const title = dayTitle(d);
  const long = `${DAY_NAMES_LONG[dow]} ${new Date(d.date + 'T12:00:00').getDate()}/${new Date(d.date + 'T12:00:00').getMonth() + 1}`;
  const stateTxt = mode === 'on' ? 'ligger på listan — tryck för att ta bort'
    : mode === 'shopped' ? 'redan inhandlad — tryck för att lägga tillbaka på listan'
    : 'ligger inte på listan — tryck för att lägga till';
  const mark = busy
    ? '<span class="shop-chip-spin" aria-hidden="true"></span>'
    : mode === 'shopped' ? '<svg class="shop-chip-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : '';
  return `<button type="button" class="shop-chip is-${mode}${busy ? ' is-busy' : ''}" data-date="${escapeHtml(d.date)}"
      aria-pressed="${mode === 'on'}" ${busy ? 'aria-busy="true"' : ''}${_chipBusyDate ? ' disabled' : ''}
      aria-label="${escapeHtml(`${long} — ${title} — ${stateTxt}`)}"
      onclick="toggleShopDayChip(this.dataset.date)">${mark}<span class="shop-chip-txt">${escapeHtml(DAY_NAMES_SHORT[dow])}${dupDow.has(dow) ? ' ' + new Date(d.date + 'T12:00:00').getDate() : ''} · ${escapeHtml(title)}</span></button>`;
}

export function renderShopDayChips() {
  const el = document.getElementById('shopDayChips');
  if (!el) return;
  // Tidslinjen byggs av Matsedeln — har den aldrig renderats (gick direkt till
  // Inköp) hämtas den en gång och brickorna ritas om när den kommit.
  if (!window._timelineByDate && window.loadWeeklyPlan && !_chipsLoading) {
    _chipsLoading = true;
    Promise.resolve(window.loadWeeklyPlan()).catch(() => {}).finally(() => { _chipsLoading = false; renderShopDayChips(); });
  }
  const days = chipDays();
  // Samma veckodag två gånger (två veckor) → lägg på datum så brickorna går att skilja åt.
  const seen = new Set();
  const dupDow = new Set();
  for (const d of days) { const w = new Date(d.date + 'T12:00:00').getDay(); if (seen.has(w)) dupDow.add(w); seen.add(w); }
  const more = `<button type="button" class="shop-chip is-more" onclick="openShoppingDayPicker()" aria-haspopup="dialog"${_chipBusyDate ? ' disabled' : ''}>Fler dagar</button>`;
  const html = (days.length ? days.map((d) => chipHtml(d, dupDow)).join('') : '<span class="shop-chips-empty">Inga planerade middagar just nu</span>') + more;
  if (html === _chipsHtml) return;
  _chipsHtml = html;
  const focusDate = el.contains(document.activeElement) ? document.activeElement?.dataset?.date : null;
  el.innerHTML = html;
  if (focusDate) el.querySelector(`.shop-chip[data-date="${CSS.escape(focusDate)}"]`)?.focus({ preventScroll: true });
}

export async function toggleShopDayChip(date) {
  if (!date || _chipBusyDate || window._opBusy || state()) return;
  const days = pickableDays();
  const d = days.find((x) => x.date === date);
  if (!d) return;
  const set = new Set(currentlyCovered(days));
  if (d.onList && !d.shoppedAt) set.delete(date); else set.add(date);
  _chipBusyDate = date;
  renderShopDayChips();
  try {
    await commitShopDays([...set].sort(), { quiet: true });
  } finally {
    _chipBusyDate = null;
    renderShopDayChips();   // lyckat: nytt läge ur tidslinjen · misslyckat: tillbaka till förra
  }
}

// ── Dra ned för att stänga ───────────────────────────────────────────────────
// Draghandtaget ser ut som något man ska kunna fälla ned, så det ska också gå.
// Gesten sitter på handtagsytan (inte hela panelen) så listans scroll är orörd.
// Panelen följer fingret nedåt; släpper man förbi tröskeln stängs sheeten,
// annars fjädrar den tillbaka.
const DRAG_CLOSE_PX = 90;

function initDragToClose() {
  const grab = document.getElementById('shopDaysGrab');
  const panel = document.getElementById('shopDaysPanel');
  if (!grab || !panel || grab.dataset.dragBound === '1') return;
  grab.dataset.dragBound = '1';

  let startY = null;

  const move = (e) => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { panel.style.transform = ''; return; }
    e.preventDefault();                       // annars scrollar sidan bakom
    panel.style.transition = 'none';
    panel.style.transform = `translateY(${dy}px)`;
  };

  const end = (e) => {
    if (startY === null) return;
    const dy = (e.changedTouches?.[0]?.clientY ?? startY) - startY;
    startY = null;
    panel.style.transition = '';
    panel.style.transform = '';
    if (dy > DRAG_CLOSE_PX) closeShoppingDayPicker();
  };

  grab.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
  grab.addEventListener('touchmove', move, { passive: false });
  grab.addEventListener('touchend', end);
  grab.addEventListener('touchcancel', end);
}

window.openShoppingDayPicker  = openShoppingDayPicker;
window.closeShoppingDayPicker = closeShoppingDayPicker;
window.toggleShopDay          = toggleShopDay;
window.showEarlierShopDays    = showEarlierShopDays;
window.selectWholePlan        = selectWholePlan;
window.clearShopDaySelection  = clearShopDaySelection;
window.saveShoppingDayPick    = saveShoppingDayPick;
window.renderShopDayPicker    = renderShopDayPicker;
window.renderShopDayFoot      = renderShopDayFoot;
window.renderShopDayChips     = renderShopDayChips;
window.toggleShopDayChip      = toggleShopDayChip;
