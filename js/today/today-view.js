// Idag-fliken — appens startflik och svaret på "vad blir det ikväll?".
// Ny design 2026-10 (docs/design/mockups B-Idag + B-Idag-mobil): kvällens kort
// med konkreta handlingar (Börja laga / Välj ett recept i stället / Byt dag),
// i morgon-rad, veckoöversikt (dagnamn + rätt på desktop, prickar på mobil),
// inköpsstatus med snabbinmatning och en kort "Att göra"-lista på desktop.
//
// Läser: window._timelineByDate (byggs av renderWeeklyPlanData i plan-viewer.js),
//        window.RECIPES, window._dbResting, inköpslistans minne
//        (_shopRecipeItems/_shopManualItems/_checkedItems/_shopCoverage).
//        Muterar ingen plandata — bara egna vy-cacher, window._todayReady,
//        rendering + anrop av befintliga window.*-funktioner (VSA).
//
// Re-render: vi wrappar renderWeeklyPlanData + loadWeeklyPlan + switchTab (samma
// synk-mönster som deluxe). Importeras EFTER deluxe → wrappningen ligger ytterst.

import { fmtIso, PROTEIN_COLOR, isoWeekNumber, escapeHtml, weekStartOf, addDaysIso, jsStringAttr, recipeImage } from '../utils.js';
import { DB_RESTING_MESSAGE } from '../supabase-client.js';

const MONTH_NAMES_LONG = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const MONTH_NAMES_SHORT = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];
const PROTEIN_LABEL = { fisk: 'Fisk', kyckling: 'Kyckling', kött: 'Kött', fläsk: 'Fläsk', vegetarisk: 'Vegetariskt' };
const RESTER_RE = /rester|kylskåpstömning|kylskåpsstädning|använd upp|tömma kylen/i;

const esc = escapeHtml;
// F212: lokal escaper missade backslash (lagrad XSS via recepttitel) — använd
// utils.jsStringAttr (escapar backslash FÖRST, sedan ' och &<>").
const attr = jsStringAttr;
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

const I = {
  pot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13c0-3.5 3.5-6 8-6s8 2.5 8 6"/><path d="M3 13h18"/><path d="M5.5 13v2c0 1.5 1 2.5 2.5 2.5h8c1.5 0 2.5-1 2.5-2.5v-2"/></svg>',
  leftovers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11h16M5 11a7 7 0 0 1 14 0M3 15h18l-1 4H4z"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16z M13 7l4 4"/></svg>',
  free: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4 M8 2v4 M3 10h18"/><path d="M9 15l6 0"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2l2.4 12.4a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 8H6"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 13.2 10.8 19 12 13.2 13.2 12 20 10.8 13.2 5 12 10.8 10.8z"/></svg>',
};

function recipeById(id) {
  return id ? (window.RECIPES || []).find(r => r.id === id) : null;
}

// Enhetlig beskrivning av en dags middag (recept, egen planering, fri dag, tom).
function dayInfo(d) {
  if (!d) return null;
  if (d.recipeId && !d.isCustom) {
    const r = recipeById(d.recipeId);
    return mk('recipe', d.recipe || '', d.recipeId, r, (d.saving && d.saving >= 1) ? d.saving : null, true);
  }
  if (d.isCustom && d.customRecipeId) {
    const r = recipeById(d.customRecipeId);
    return mk('recipe', d.customRecipeTitle || '', d.customRecipeId, r, null, false);
  }
  if (d.isCustom && (d.customRecipeTitle || d.customNote)) {
    const title = d.customRecipeTitle || d.customNote;
    return { kind: 'note', title, cookId: null, color: 'var(--moss-muted)', protein: null, time: null, servings: null, saving: null, r: null, planDay: false, leftovers: RESTER_RE.test(title) };
  }
  if (d.blocked) {
    return { kind: 'free', title: 'Fri dag', cookId: null, color: 'var(--birch)', protein: null, time: null, servings: null, saving: null, r: null, planDay: false };
  }
  return null;
}

function mk(kind, title, cookId, r, saving, planDay) {
  return {
    kind, title, cookId, r, planDay,
    color: r ? (PROTEIN_COLOR[r.protein] || 'var(--lichen)') : 'var(--lichen)',
    protein: r ? r.protein : null,
    time: r?.time || null,
    servings: r?.servings || null,
    saving,
  };
}

function thumbHtml(info, size = 72) {
  const img = info?.r ? recipeImage(info.r) : '';
  if (img) return `<span class="td-thumb"><img src="${img}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" onerror="this.remove()"></span>`;
  const icon = !info ? I.plus : info.kind === 'free' ? I.free : info.kind === 'note' ? (info.leftovers ? I.leftovers : I.pencil) : I.pot;
  return `<span class="td-thumb" aria-hidden="true">${icon}</span>`;
}

// "Välj ett recept i stället": plandag → byt recept (Välj själv), annars egen dag med recept.
window.todayPickRecipe = function (date, dayName, planDay) {
  if (planDay) window.enterReplaceMode?.(date, dayName);
  else window.enterCustomPickMode?.(date, dayName);
};

// ── Delrenderingar ────────────────────────────────────────────────────────────

function tonightHtml(entry, info) {
  const click = entry ? `dlxDayClick('${entry.date}', '${attr(entry.day)}')` : `openNewPlan()`;
  const pick = entry ? `todayPickRecipe('${entry.date}', '${attr(entry.day)}', ${info?.planDay ? 'true' : 'false'})` : `openNewPlan()`;

  if (!info) {
    return `
      <article class="td-card td-tonight td-empty">
        <div class="td-tonight-row">
          ${thumbHtml(null)}
          <div class="td-tonight-txt">
            <span class="td-eyebrow">Ikväll</span>
            <h2 class="td-tonight-title">Inget planerat</h2>
            <p class="td-empty-note">Välj en rätt för ikväll eller låt appen föreslå en vecka.</p>
          </div>
        </div>
        <div class="td-actions">
          <button type="button" class="td-btn td-btn-accent" onclick="${pick}">Välj ett recept</button>
          <button type="button" class="td-btn" onclick="${click}">Planera dagen</button>
        </div>
      </article>`;
  }

  const meta = info.kind === 'recipe'
    ? [info.time ? `${info.time} min` : '', info.protein ? `<span class="td-dot" style="--p:${info.color}"></span>${esc(PROTEIN_LABEL[info.protein] || info.protein)}` : '', info.servings ? `${info.servings} portioner` : '', info.saving ? `−${Math.round(info.saving)} kr extrapris` : ''].filter(Boolean).join(' · ')
    : info.kind === 'free' ? 'Ingen middag planerad' : 'Egen dag · inget recept kopplat';

  const primary = info.kind === 'recipe' && info.cookId
    ? `<button type="button" class="td-btn td-btn-accent" onclick="openCookMode(${info.cookId})">${I.play}Börja laga</button>`
    : `<button type="button" class="td-btn td-btn-accent" onclick="${pick}">Välj ett recept i stället</button>`;

  return `
    <article class="td-card td-tonight">
      <div class="td-tonight-row">
        ${thumbHtml(info)}
        <div class="td-tonight-txt">
          <span class="td-eyebrow">Ikväll</span>
          <h2 class="td-tonight-title">${esc(info.title)}</h2>
          <div class="td-meta">${meta}</div>
        </div>
      </div>
      <div class="td-actions">
        ${primary}
        <button type="button" class="td-btn td-btn-quiet" onclick="${click}">Byt dag</button>
      </div>
    </article>`;
}

function tomorrowHtml(entry, info) {
  if (!entry) return '';
  const eyebrow = `I morgon · ${esc(entry.day.toLowerCase())}`;
  const click = `dlxDayClick('${entry.date}', '${attr(entry.day)}')`;
  const sub = !info ? 'Inget planerat — tryck för att planera'
    : info.kind === 'recipe' ? [info.time ? `${info.time} min` : '', info.protein ? PROTEIN_LABEL[info.protein] || info.protein : ''].filter(Boolean).join(' · ')
    : info.kind === 'free' ? 'Fri dag' : 'Egen dag';
  return `
    <button type="button" class="td-tomorrow" onclick="${click}">
      ${thumbHtml(info)}
      <span class="td-tomorrow-txt">
        <span class="td-eyebrow">${eyebrow}</span>
        <span class="td-tomorrow-title">${esc(info ? info.title : 'Inget planerat')}</span>
        ${sub ? `<span class="td-tomorrow-sub">${esc(sub)}</span>` : ''}
      </span>
      <span class="td-chev" aria-hidden="true">${I.chev}</span>
    </button>`;
}

function weekHtml(weekDays, weekNo) {
  if (!weekDays.length) return '';
  const todayIso = fmtIso(new Date());
  const tiles = weekDays.map(d => {
    const info = dayInfo(d);
    const isRecipe = info?.kind === 'recipe';
    const cls = ['tw-day', !info ? 'is-empty' : '', info && !isRecipe ? 'is-own' : '', d.date === todayIso ? 'is-today' : ''].filter(Boolean).join(' ');
    const color = isRecipe ? info.color : 'var(--moss-muted)';
    const txt = info ? info.title : 'Tom';
    const title = `${d.day}${info ? ' · ' + info.title : ' · tom'}${d.shoppedAt ? ' · handlat' : ''}`;
    return `<button type="button" class="${cls}" style="--p:${color}" title="${esc(title)}" onclick="dlxDayClick('${d.date}', '${attr(d.day)}')">
        <span class="tw-lbl"><span class="tw-lbl-short">${esc(d.day.charAt(0))}</span><span class="tw-lbl-long">${esc(d.day.slice(0, 3))}</span></span>
        <span class="tw-txt">${esc(txt)}</span>
        <span class="tw-dot" aria-hidden="true"></span>
      </button>`;
  }).join('');
  const empties = weekDays.filter(d => !dayInfo(d) && d.date >= todayIso);
  const caption = empties.length
    ? `${empties.map(d => d.day).join(', ')} saknar middag. Färgprick = recept från receptboken; övriga är egna dagar.`
    : 'Färgprick = recept från receptboken · grå = egen dag · streckad = tom';
  return `
    <section class="td-card">
      <div class="td-card-head">
        <h2 class="td-h2">Vecka ${weekNo}</h2>
        <span class="today-link" role="button" tabindex="0" onclick="switchTab('vecka')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();switchTab('vecka');}">Hela matsedeln</span>
      </div>
      <div class="td-week">${tiles}</div>
      <div class="td-caption">${esc(caption)}</div>
    </section>`;
}

// Inköpslistans läge ur minnet (laddas tyst första gången Idag visas).
let _shopLoadKicked = false;
function shopState() {
  const rec = window._shopRecipeItems;
  const man = window._shopManualItems;
  if (rec === null && (!man || !man.length) && !_shopLoadKicked && typeof window.loadShoppingTab === 'function') {
    _shopLoadKicked = true;
    Promise.resolve(window.loadShoppingTab()).then(() => renderTodayView()).catch(() => {});
    return null;
  }
  const names = [];
  let total = 0, done = 0;
  for (const [cat, items] of Object.entries(rec || {})) {
    items.forEach((it, idx) => {
      if (window.isPantryName?.(it)) return;
      total++;
      if (window._checkedItems?.[`recipe::${cat}::${idx}`]) done++;
    });
  }
  (man || []).forEach((it) => {
    if (window.isPantryName?.(it)) return;
    total++;
    if (window._checkedItems?.[`manual::${it}`]) done++;
    names.push(it);
  });
  const cov = window._shopCoverage || [];
  const covered = cov.filter(r => !r.shopped_at).map(r => r.recipe_title_snapshot).filter(Boolean);
  return { total, done, manual: names, covered, recipeCount: total - names.length };
}

function shopHtml(st) {
  const total = st ? st.total : 0;
  const done = st ? st.done : 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const srcTxt = st && st.covered.length
    ? `${st.recipeCount} från ${st.covered.length === 1 ? st.covered[0] : st.covered.length + ' recept'}${st.manual.length ? ` + ${st.manual.length} egna` : ''}`
    : (st && st.manual.length ? `${st.manual.length} egna tillägg` : 'tom');
  const rows = st ? [
    ...st.manual.slice(0, 2).map(n => `<li><span>${esc(n)}</span><span>eget tillägg</span></li>`),
    st.recipeCount ? `<li><span>${st.recipeCount} varor från matsedeln</span><span>${esc(st.covered[0] || '')}</span></li>` : '',
  ].filter(Boolean).join('') : '';
  return `
    <section class="td-card">
      <div class="td-card-head">
        <h2 class="td-h2">Inköpslistan</h2>
        <span class="today-link" role="button" tabindex="0" onclick="switchTab('shop')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();switchTab('shop');}">Öppna</span>
      </div>
      <div class="td-shop-row"><span>${total} ${total === 1 ? 'vara' : 'varor'} · ${esc(srcTxt)}</span><span>${done} ${done === 1 ? 'plockad' : 'plockade'}</span></div>
      <div class="td-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
      <label class="td-quick">
        <input type="text" id="todayAddInput" maxlength="80" placeholder="Snabbt till listan, t.ex. blöjor, kaffe…"
               aria-label="Lägg till vara"
               onkeydown="if(event.key==='Enter'){event.preventDefault();todayAddItem()}">
        <button type="button" id="todayAddBtn" onclick="todayAddItem()">Lägg till</button>
      </label>
      ${rows ? `<ul class="td-shoplist">${rows}</ul>` : ''}
      <button type="button" class="td-btn td-shop-open" onclick="switchTab('shop')">${I.cart}Öppna listan</button>
    </section>`;
}

function todoHtml(weekDays, st, pending) {
  const todayIso = fmtIso(new Date());
  const items = [];
  const empty = weekDays.find(d => !dayInfo(d) && d.date >= todayIso);
  if (empty) items.push(`<button type="button" class="td-todo-item" onclick="dlxDayClick('${empty.date}', '${attr(empty.day)}')"><span class="td-todo-ic">${I.plus}</span><span>Fyll ${esc(empty.day.toLowerCase())}en i matsedeln</span><span class="td-chev">${I.chev}</span></button>`);
  if (pending) items.push(`<button type="button" class="td-todo-item" onclick="switchTab('vecka')"><span class="td-todo-ic">${I.tick}</span><span>Bekräfta matsedelsförslaget</span><span class="td-chev">${I.chev}</span></button>`);
  if (st && st.total - st.done > 0) items.push(`<button type="button" class="td-todo-item" onclick="switchTab('shop')"><span class="td-todo-ic">${I.cart}</span><span>Skicka veckans lista till butiken</span><span class="td-chev">${I.chev}</span></button>`);
  if (!items.length) return '';
  return `<section class="td-card td-todo"><h2 class="td-h2">Att göra</h2>${items.join('')}</section>`;
}

// ── Willys-larmbanner (backlog #2, reaktiv in-app-variant) ───────────────────
// Läser pricing_status en gång per sidladdning. Saknas tabellen (migration 004
// ej körd), raden, eller är läget inte degraderat → ingen banner (tyst).
let _pricingBannerHtml = '';
let _pricingChecked = false;

async function checkPricingStatus() {
  if (_pricingChecked) return;
  _pricingChecked = true;
  try {
    const householdId = await window.getHouseholdId();
    const { data, error } = await window.db
      .from('pricing_status')
      .select('degraded, last_success_at')
      .eq('household_id', householdId)
      .maybeSingle();
    if (error || !data?.degraded) return;

    const days = data.last_success_at
      ? Math.floor((Date.now() - new Date(data.last_success_at).getTime()) / 86400000)
      : null;
    if (days !== null && days < 1) return; // en enstaka miss samma dag — vänta och se, inte larma direkt

    _pricingBannerHtml = `<div class="today-alert-banner">${days == null
      ? 'Reaprisernas hämtning verkar vara trasig — kolla igen om ett tag.'
      : `Reapriserna har inte kunnat hämtas på ${days} ${days === 1 ? 'dag' : 'dagar'}.`}</div>`;
    renderTodayView();
  } catch { /* tabellen saknas → ingen banner */ }
}

// ── Pinnade lappar (P2 anteckningar) ─────────────────────────────────────────
// Diskreta kort för anteckningar som fästs i Listor-fliken. Hämtas via
// lists-slicen (loadPinnedNotes) så Idag inte beror på att fliken öppnats.
let _pinnedNotes = [];

async function checkPinnedNotes() {
  try {
    if (typeof window.loadPinnedNotes !== 'function') return;
    _pinnedNotes = await window.loadPinnedNotes();
    renderTodayView();
  } catch { _pinnedNotes = []; }
}

function pinnedNotesHtml() {
  if (!_pinnedNotes.length) return '';
  const cards = _pinnedNotes.slice(0, 3).map(n => {
    const body = (n.body || '').replace(/\s+/g, ' ').trim();
    return `<button type="button" class="today-note-card" onclick="openPinnedNote('${attr(n.id)}')">
      <span class="today-note-title"><span class="today-note-pin">📌</span>${esc(n.title)}</span>
      ${body ? `<span class="today-note-body">${esc(body)}</span>` : ''}
    </button>`;
  }).join('');
  return `
    <section class="td-card">
      <div class="td-card-head">
        <h2 class="td-h2">Fästa lappar</h2>
        <span class="today-link" role="button" tabindex="0" onclick="switchTab('listor')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();switchTab('listor');}">Alla anteckningar</span>
      </div>
      <div class="today-notes">${cards}</div>
    </section>`;
}

window.openPinnedNote = function (id) {
  window.switchTab('listor');
  if (typeof window.flOpenNote === 'function') window.flOpenNote(id);
};

function loadingHtml() {
  return `<div class="today-loading"><span class="today-loading-spin">⟳</span><p>Laddar…</p></div>`;
}

// F162: pausad free-tier-databas (Session 106) gav bara besked inne i den
// dolda Recept-fliken — Idag (startfliken) visade i stället vilseledande
// "Ingen matsedel ännu". window._dbResting sätts av app.js:init() vid boot.
function dbRestingHtml() {
  return `
    <article class="td-card td-tonight td-empty">
      <div class="td-tonight-txt">
        <h2 class="td-tonight-title">Appen har vilat</h2>
        <p class="td-empty-note">${esc(DB_RESTING_MESSAGE)}</p>
      </div>
      <div class="td-actions">
        <button type="button" class="td-btn td-btn-accent" onclick="location.reload()">Prova igen</button>
      </div>
    </article>`;
}

function noPlanHtml() {
  return `
    <article class="td-card td-tonight td-empty">
      <div class="td-tonight-txt">
        <h2 class="td-tonight-title">Ingen matsedel ännu</h2>
        <p class="td-empty-note">Låt appen föreslå familjens första vecka, så syns kvällens middag här.</p>
      </div>
      <div class="td-actions">
        <button type="button" class="td-btn td-btn-accent" onclick="openNewPlan()">${I.sparkle}Föreslå matsedel</button>
      </div>
    </article>`;
}

// ── Huvudrendering ────────────────────────────────────────────────────────────

// Perf-wrapper (mätning bakom ?perf=1) — renderingen själv ligger i
// renderTodayViewInner. Interna anrop går via den här, så varje render räknas.
// Dold Idag-flik ritas inte om: varje planuppdatering (byte, realtime-eko)
// skulle annars bygga om hela #todayView i bakgrunden medan man står på
// Matsedeln. switchTab('idag')-kroken nedan ritar alltid om vid besök, så
// vyn är aktuell när den syns igen.
function todayVisible() {
  return !!document.getElementById('todayView')?.classList.contains('visible');
}

let _renderedIso = null;

export function renderTodayView() {
  if (!todayVisible()) return;
  const end = window.perfSpan?.('render:Idag');
  try {
    return renderTodayViewInner();
  } finally {
    end?.();
    // Milstolpe: första gången Idag renderats med riktig data.
    if (window._todayReady) window.perfMarkOnce?.('idag');
  }
}

function renderTodayViewInner() {
  const host = document.getElementById('todayView');
  if (!host) return;

  // Bevara pågående inmatning i snabbfältet över re-renders (realtime-eko m.m.).
  const prevInput = document.getElementById('todayAddInput');
  const prevVal = prevInput ? prevInput.value : null;
  const hadFocus = prevInput && document.activeElement === prevInput;

  if (!window._todayReady) { host.innerHTML = loadingHtml(); return; }
  if (window._dbResting) { host.innerHTML = `<div class="td">${dbRestingHtml()}</div>`; return; }

  const timeline = window._timelineByDate || {};
  const hasPlan = Object.values(timeline).some(d => d.recipeId || d.isCustom || d.blocked);

  const now = new Date();
  const todayIso = fmtIso(now);
  _renderedIso = todayIso;
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = fmtIso(tomorrow);

  const todayEntry = timeline[todayIso] || null;
  const todayInfo = dayInfo(todayEntry);
  const tomorrowEntry = timeline[tomorrowIso] || null;
  const tomorrowInfo = dayInfo(tomorrowEntry);

  const wk = isoWeekNumber(todayIso);
  const h1 = todayEntry
    ? `${todayEntry.day} ${todayEntry.dayNum} ${MONTH_NAMES_LONG[todayEntry.month]}`
    : `${capitalize(now.toLocaleDateString('sv-SE', { weekday: 'long' }))} ${now.getDate()} ${MONTH_NAMES_LONG[now.getMonth()]}`;
  const h1Short = todayEntry
    ? `${todayEntry.day} ${todayEntry.dayNum} ${MONTH_NAMES_SHORT[todayEntry.month]}`
    : h1;
  void h1Short;

  // Veckan: innevarande kalendervecka (mån–sön) — samma veckotänk som Matsedeln.
  const ws = weekStartOf(todayIso);
  const weekDays = Array.from({ length: 7 }, (_, i) => timeline[addDaysIso(ws, i)]).filter(Boolean);
  const empties = weekDays.filter(d => !dayInfo(d) && d.date >= todayIso).length;
  const st = shopState();
  const plan = window._lastPlan || null;
  const pending = !!(plan?.days?.length) && !plan?.confirmedAt && !window.planConfirmed;

  const subParts = [`Vecka ${wk}`];
  if (hasPlan && empties) subParts.push(`${empties} ${empties === 1 ? 'dag' : 'dagar'} kvar att fylla i matsedeln`);
  if (st) subParts.push(`${st.total} ${st.total === 1 ? 'vara' : 'varor'} på inköpslistan`);

  const left = hasPlan
    ? tonightHtml(todayEntry, todayInfo) + tomorrowHtml(tomorrowEntry, tomorrowInfo) + weekHtml(weekDays, wk)
    : noPlanHtml();
  const right = shopHtml(st) + (hasPlan ? todoHtml(weekDays, st, pending) : '') + pinnedNotesHtml();

  host.innerHTML = `
    <div class="td">
      <div class="td-head">
        <h1 class="td-h1">${esc(h1)}</h1>
        <div class="td-sub">${esc(subParts.join(' · '))}</div>
      </div>
      ${_pricingBannerHtml}
      <div class="td-cols">
        <div class="td-col">${left}</div>
        <div class="td-col">${right}</div>
      </div>
    </div>`;

  if (prevVal != null) {
    const input = document.getElementById('todayAddInput');
    if (input) { input.value = prevVal; if (hadFocus) input.focus(); }
  }
}

// Snabbt till listan — återanvänder addManualItem exakt som dag-sheeten.
// F057: laddar INTE bara för att window._shopListId redan är satt — ett satt
// värde kan peka på en avaktiverad lista (recept-byte/ny matsedel genererad
// på en annan enhet utan att Handla-fliken besökts sen dess). Den faktiska
// färskhetskontrollen sitter numera i ensureActiveShoppingList
// (js/shopping/shopping-list.js), som addManualItem alltid går via — det är
// skyddet mot att skriva till fel lista. Laddningen här är bara en
// UI-bekvämlighet för allra första besöket (fyller window._shopManualItems
// innan addManualItems positionsräkning).
window.todayAddItem = async function () {
  const input = document.getElementById('todayAddInput');
  const item = input?.value.trim();
  if (!item) { input?.focus(); return; }
  try {
    if ((!window._shopManualItems || window._shopDirty) && window.loadShoppingTab) await window.loadShoppingTab();
  } catch { /* addManualItem ger begripligt fel nedan */ }
  await window.addManualItem('todayAddInput', 'todayAddBtn');
  if (input && input.value === '') {
    window.showToast?.(`${item} ligger nu på inköpslistan.`, { type: 'success' });
    renderTodayView();
    document.getElementById('todayAddInput')?.focus();
  }
};

// ── Håll Idag-vyn i synk med datat ────────────────────────────────────────────
function wrap(name, { async = false, onAfter } = {}) {
  const orig = window[name];
  if (typeof orig !== 'function' || orig.__todayWrapped) return;
  const after = () => {
    window._todayReady = true;
    try { renderTodayView(); } catch (e) { console.error('renderTodayView', e); }
    onAfter?.();
  };
  const wrapped = async
    ? async function (...args) { const r = await orig.apply(this, args); after(); return r; }
    : function (...args) { const r = orig.apply(this, args); after(); return r; };
  wrapped.__todayWrapped = true;
  window[name] = wrapped;
}

function installHooks() {
  wrap('renderWeeklyPlanData');
  // Inköpslistans ändringar (bockar, nya varor, ombyggd lista) speglas i kortet.
  wrap('renderFullShoppingList');
  // Kollar prisstatus + pinnade lappar först när loadWeeklyPlan (och därmed
  // auth+household) är klar — bådadera är hushållsskopad data som kräver en
  // inloggad session.
  // Pinnade lappar hämtas bara vid första planladdningen med Idag synlig
  // (boot) och sedan vid varje Idag-besök (switchTab-kroken) — inte vid varje
  // realtime-omladdning av planen. Prisstatusen läses en gång per sidladdning.
  let bootNotesChecked = false;
  wrap('loadWeeklyPlan', { async: true, onAfter: () => {
    checkPricingStatus();
    if (bootNotesChecked || !todayVisible()) return;
    bootNotesChecked = true;
    checkPinnedNotes();
  } });
  const origSwitch = window.switchTab;
  if (typeof origSwitch === 'function' && !origSwitch.__todayWrapped) {
    const wrappedSwitch = function (tab) {
      const r = origSwitch.apply(this, arguments);
      if (tab === 'idag') {
        try { renderTodayView(); } catch (e) { console.error('renderTodayView', e); }
        // Uppdatera fästa lappar (kan ha ändrats i Listor-fliken sedan sist).
        checkPinnedNotes();
      }
      return r;
    };
    wrappedSwitch.__todayWrapped = true;
    window.switchTab = wrappedSwitch;
  }
}

installHooks();

// Datumbyte medan appen stått öppen: ladda om planen (bygger om tidslinjen med
// nya isPast/isToday) när appen kommer tillbaka i förgrunden på en ny dag.
function refreshIfNewDay() {
  if (document.visibilityState !== 'visible') return;
  if (!_renderedIso || fmtIso(new Date()) === _renderedIso) return;
  try {
    if (window.loadWeeklyPlan) Promise.resolve(window.loadWeeklyPlan()).catch(() => {});
    else renderTodayView();
  } catch { /* ritas om vid nästa flikbyte */ }
}
document.addEventListener('visibilitychange', refreshIfNewDay);
window.addEventListener('pageshow', refreshIfNewDay);
