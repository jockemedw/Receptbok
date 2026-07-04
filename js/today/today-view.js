// Idag-fliken — appens startflik och svaret på "vad blir det ikväll?".
// Byggd enligt designprototypen (facit: artifact ddad7251), med appens tokens
// (titelfonten via --font-display + mörkt tema följer med). Proteinfärgen sätts per element via inline
// --p (samma trick som prototypens .t-<protein>).
//
// Läser: window._timelineByDate (byggs av renderWeeklyPlanData i plan-viewer.js),
//        window.RECIPES, window._lastPlan. Muterar inget eget tillstånd — bara
//        rendering + anrop av befintliga window.*-funktioner (VSA).
//
// Re-render: vi wrappar renderWeeklyPlanData + loadWeeklyPlan + switchTab (samma
// synk-mönster som deluxe). Importeras EFTER deluxe → wrappningen ligger ytterst.

import { fmtIso, PROTEIN_COLOR, isoWeekNumber, escapeHtml } from '../utils.js';

const MONTH_NAMES_LONG = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const PROTEIN_LABEL = { fisk: 'Fisk', kyckling: 'Kyckling', kött: 'Kött', fläsk: 'Fläsk', vegetarisk: 'Vegetariskt' };
const TYPE_TAGS = { soppa: 'Soppa', pasta: 'Pasta', wok: 'Wok', ugn: 'Ugn', sallad: 'Sallad', gryta: 'Gryta', ramen: 'Ramen' };

const esc = escapeHtml;
function attr(s) { return String(s == null ? '' : s).replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

const I = {
  pot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13c0-3.5 3.5-6 8-6s8 2.5 8 6"/><path d="M3 13h18"/><path d="M5.5 13v2c0 1.5 1 2.5 2.5 2.5h8c1.5 0 2.5-1 2.5-2.5v-2"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"/><path d="M12 7.5v9M9.5 9.7c.6-.7 1.5-1 2.5-1s2 .3 2.4 1c.5.8 0 1.7-1 2-.7.2-2.7.3-3.4.7-.9.4-1.4 1.3-.9 2.1.5.7 1.6 1 2.5 1s1.9-.3 2.5-1"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14 M5 12h14"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 13.2 10.8 19 12 13.2 13.2 12 20 10.8 13.2 5 12 10.8 10.8z"/></svg>',
};

function recipeById(id) {
  return id ? (window.RECIPES || []).find(r => r.id === id) : null;
}

// Enhetlig beskrivning av en dags middag (recept, egen planering, fri dag, tom).
function dayInfo(d) {
  if (!d) return null;
  if (d.recipeId && !d.isCustom) {
    const r = recipeById(d.recipeId);
    return mk('recipe', d.recipe || '', d.recipeId, r, (d.saving && d.saving >= 1) ? d.saving : null);
  }
  if (d.isCustom && d.customRecipeId) {
    const r = recipeById(d.customRecipeId);
    return mk('recipe', d.customRecipeTitle || '', d.customRecipeId, r, null);
  }
  if (d.isCustom && (d.customRecipeTitle || d.customNote)) {
    return { kind: 'note', title: d.customRecipeTitle || d.customNote, cookId: null, color: 'var(--birch)', protein: null, time: null, servings: null, saving: null, typeLabel: null };
  }
  if (d.blocked) {
    return { kind: 'free', title: 'Fri dag', cookId: null, color: 'var(--birch)', protein: null, time: null, servings: null, saving: null, typeLabel: null };
  }
  return null;
}

function mk(kind, title, cookId, r, saving) {
  return {
    kind, title, cookId,
    color: r ? (PROTEIN_COLOR[r.protein] || 'var(--lichen)') : 'var(--lichen)',
    protein: r ? r.protein : null,
    time: r?.time || null,
    servings: r?.servings || null,
    saving,
    typeLabel: typeLabelFor(r),
  };
}

function typeLabelFor(r) {
  if (!r) return null;
  const tags = (r.tags || []).map(t => t.toLowerCase());
  for (const t of tags) if (TYPE_TAGS[t]) return TYPE_TAGS[t];
  if (tags.includes('helg60')) return 'Helgrecept';
  if (tags.includes('vardag30')) return 'Vardagsrecept';
  return null;
}

// ── Delrenderingar ────────────────────────────────────────────────────────────

function heroHtml(todayEntry, info) {
  // Tomt/välkomst-läge: ingen middag ikväll (tom/fri dag).
  if (!info || info.kind === 'free') {
    const isFree = info?.kind === 'free';
    return `
      <article class="today-tonight today-tonight-empty">
        <div class="today-tonight-body">
          <span class="today-hero-icon">${I.pot}</span>
          <h1 class="today-tonight-title">${isFree ? 'Fri dag ikväll' : 'Inget planerat ikväll'}</h1>
          <p class="today-hero-note">${isFree ? 'Ingen middag inplanerad — ta det lugnt ikväll.' : 'Välj en rätt för ikväll eller skapa en ny matsedel.'}</p>
          <div class="today-tonight-actions">
            ${todayEntry ? `<button type="button" class="today-btn today-btn-primary" onclick="dlxDayClick('${todayEntry.date}', '${attr(todayEntry.day)}')">${I.plus}Planera dagen</button>` : ''}
            <button type="button" class="today-btn today-btn-quiet" onclick="openNewPlan()">Ny matsedel</button>
          </div>
        </div>
      </article>`;
  }

  const deal = info.saving
    ? `<span class="today-deal-chip">${I.coin}−${Math.round(info.saving)} kr extrapris</span>`
    : '';
  const meta = [
    info.time ? `<span>${I.clock}${info.time} min</span>` : '',
    info.protein ? `<span><span class="today-dot" style="--p:${info.color}"></span>${esc(PROTEIN_LABEL[info.protein] || info.protein)}</span>` : '',
    info.servings ? `<span>${info.servings} portioner</span>` : '',
  ].filter(Boolean).join('');
  const cookBtn = info.cookId
    ? `<button type="button" class="today-btn today-btn-primary" onclick="openCookMode(${info.cookId})">${I.pot}Börja laga</button>`
    : '';

  return `
    <article class="today-tonight" style="--p:${info.color}">
      <div class="today-tonight-body">
        <div class="today-tonight-eyebrow">
          <span class="today-eyebrow">Ikväll</span>
          ${deal}
        </div>
        <h1 class="today-tonight-title">${esc(info.title)}</h1>
        <div class="today-tonight-meta">${meta}</div>
        <div class="today-tonight-actions">
          ${cookBtn}
          <button type="button" class="today-btn today-btn-quiet" onclick="dlxDayClick('${todayEntry.date}', '${attr(todayEntry.day)}')">Mer</button>
        </div>
      </div>
    </article>`;
}

function tomorrowHtml(entry, info) {
  if (!entry) return '';
  const eyebrow = `I morgon · ${esc(entry.day.toLowerCase())}`;
  const click = `onclick="dlxDayClick('${entry.date}', '${attr(entry.day)}')"`;

  // Tom lucka (ingen planerad middag) → "Inget planerat", tryck för att planera.
  if (!info) {
    if (entry.isPast) return '';   // säkerhetsnät — morgondagen är aldrig förfluten
    return `
      <button type="button" class="today-tomorrow today-tomorrow-empty" style="--p:var(--birch)" ${click}>
        <span class="today-tomorrow-thread"></span>
        <span class="today-tomorrow-txt">
          <span class="today-eyebrow">${eyebrow}</span>
          <span class="today-tomorrow-title today-tomorrow-empty-title">Inget planerat</span>
        </span>
        <span class="today-tomorrow-chev" aria-hidden="true">${I.chev}</span>
      </button>`;
  }

  const meta = [
    info.time ? `${info.time} min` : null,
    info.protein ? PROTEIN_LABEL[info.protein] || info.protein : null,
    info.typeLabel,
  ].filter(Boolean).join(' · ');
  return `
    <button type="button" class="today-tomorrow" style="--p:${info.color}" ${click}>
      <span class="today-tomorrow-thread"></span>
      <span class="today-tomorrow-txt">
        <span class="today-eyebrow">${eyebrow}</span>
        <span class="today-tomorrow-title">${esc(info.title)}</span>
        ${meta ? `<span class="today-tomorrow-meta">${esc(meta)}</span>` : ''}
      </span>
      <span class="today-tomorrow-chev" aria-hidden="true">${I.chev}</span>
    </button>`;
}

function weekHtml(weekDays, sumLeft, sumRight) {
  if (!weekDays.length) return '';
  const todayIso = fmtIso(new Date());
  const threads = weekDays.map(d => {
    const info = dayInfo(d);
    const hasMeal = info && info.kind === 'recipe';
    const cls = [
      'today-thread',
      d.date < todayIso ? 'past' : '',
      d.date === todayIso ? 'today' : '',
      hasMeal ? '' : 'free',
    ].filter(Boolean).join(' ');
    const color = hasMeal ? info.color : 'var(--birch)';
    return `<span class="${cls}" style="--p:${color}" title="${esc(d.day)}${info ? ' · ' + esc(info.title) : ''}">
        <span class="today-thread-bar"></span><span class="today-thread-day">${esc(d.day.charAt(0))}</span>
      </span>`;
  }).join('');
  return `
    <div class="today-section-head">
      <h2 class="today-h2">Kommande veckan</h2>
      <span class="today-link" onclick="switchTab('vecka')">Hela matsedeln</span>
    </div>
    <button type="button" class="today-weave-card" onclick="switchTab('vecka')" aria-label="Öppna matsedeln">
      <div class="today-weave-row">${threads}</div>
      <div class="today-weave-sum">
        <span>${esc(sumLeft)}</span>
        ${sumRight ? `<strong>${esc(sumRight)}</strong>` : ''}
      </div>
    </button>`;
}

function quickAddHtml() {
  return `
    <div class="today-section-head"><h2 class="today-h2">Snabbt till listan</h2></div>
    <div class="today-quick-add">
      <input type="text" id="todayAddInput" maxlength="80" placeholder="T.ex. blöjor, kaffe …"
             aria-label="Lägg till vara"
             onkeydown="if(event.key==='Enter'){event.preventDefault();todayAddItem()}">
      <button type="button" id="todayAddBtn" class="today-btn today-btn-quiet" onclick="todayAddItem()">Lägg till</button>
    </div>`;
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
    <div class="today-section-head">
      <h2 class="today-h2">Fästa lappar</h2>
      <span class="today-link" onclick="switchTab('listor')">Alla anteckningar</span>
    </div>
    <div class="today-notes">${cards}</div>`;
}

window.openPinnedNote = function (id) {
  window.switchTab('listor');
  if (typeof window.flOpenNote === 'function') window.flOpenNote(id);
};

function loadingHtml() {
  return `<div class="today-loading"><span class="today-loading-spin">⟳</span><p>Laddar…</p></div>`;
}

function noPlanHtml() {
  return `
    <article class="today-tonight today-tonight-empty">
      <div class="today-tonight-body">
        <span class="today-hero-icon">${I.sparkle}</span>
        <h1 class="today-tonight-title">Ingen matsedel ännu</h1>
        <p class="today-hero-note">Skapa familjens första matsedel så syns kvällens middag här.</p>
        <div class="today-tonight-actions">
          <button type="button" class="today-btn today-btn-primary" onclick="openNewPlan()">${I.sparkle}Skapa matsedel</button>
        </div>
      </div>
    </article>`;
}

// ── Huvudrendering ────────────────────────────────────────────────────────────

export function renderTodayView() {
  const host = document.getElementById('todayView');
  if (!host) return;

  // Bevara pågående inmatning i snabbfältet över re-renders (realtime-eko m.m.).
  const prevInput = document.getElementById('todayAddInput');
  const prevVal = prevInput ? prevInput.value : null;
  const hadFocus = prevInput && document.activeElement === prevInput;

  if (!window._todayReady) { host.innerHTML = loadingHtml(); return; }

  const timeline = window._timelineByDate || {};
  const hasPlan = Object.values(timeline).some(d => d.recipeId || d.isCustom || d.blocked);
  if (!hasPlan) { host.innerHTML = noPlanHtml(); return; }

  const now = new Date();
  const todayIso = fmtIso(now);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = fmtIso(tomorrow);

  const all = Object.values(timeline).filter(d => !d.isArchive).sort((a, b) => a.date.localeCompare(b.date));

  const todayEntry = timeline[todayIso] || null;
  const todayInfo = dayInfo(todayEntry);

  // I morgon: morgondagens middag. Saknas den (tom lucka) visar kortet
  // "Inget planerat" och går att trycka på för att planera dagen.
  const tomorrowEntry = timeline[tomorrowIso] || null;
  const tomorrowInfo = dayInfo(tomorrowEntry);

  const wk = isoWeekNumber(todayIso);
  const dateLine = todayEntry
    ? `${todayEntry.day} ${todayEntry.dayNum} ${MONTH_NAMES_LONG[todayEntry.month]} · vecka ${wk}`
    : `${capitalize(now.toLocaleDateString('sv-SE', { weekday: 'long' }))} ${now.getDate()} ${MONTH_NAMES_LONG[now.getMonth()]} · vecka ${wk}`;

  // Veckans trådband: planens dagar i datumordning (annars nästa 7 dagar).
  const plan = window._lastPlan || null;
  let weekDays = (plan?.startDate && plan?.endDate)
    ? all.filter(d => d.date >= plan.startDate && d.date <= plan.endDate)
    : all.filter(d => d.date >= todayIso).slice(0, 7);
  if (!weekDays.length) weekDays = all.filter(d => d.date >= todayIso).slice(0, 7);

  // Sammanfattning: middagar kvar · veg + veckans besparing.
  const meals = (plan?.days || []).filter(d => d.recipeId);
  const kvar = meals.filter(d => d.date >= todayIso).length
    || weekDays.filter(d => dayInfo(d)?.kind === 'recipe' && d.date >= todayIso).length;
  const veg = meals.filter(d => recipeById(d.recipeId)?.protein === 'vegetarisk').length
    || weekDays.filter(d => dayInfo(d)?.protein === 'vegetarisk').length;
  const saving = (plan?.days || []).reduce((s, d) => s + (d.saving || 0), 0);
  const sumLeft = `${kvar} ${kvar === 1 ? 'middag' : 'middagar'} kvar · ${veg} veg`;
  const sumRight = saving >= 1 ? `−${Math.round(saving)} kr denna vecka` : '';

  host.innerHTML =
    `<div class="today-date"><span class="today-eyebrow">${esc(dateLine)}</span></div>` +
    _pricingBannerHtml +
    heroHtml(todayEntry, todayInfo) +
    tomorrowHtml(tomorrowEntry, tomorrowInfo) +
    weekHtml(weekDays, sumLeft, sumRight) +
    pinnedNotesHtml() +
    quickAddHtml();

  if (prevVal != null) {
    const input = document.getElementById('todayAddInput');
    if (input) { input.value = prevVal; if (hadFocus) input.focus(); }
  }
}

// Snabbt till listan — återanvänder addManualItem exakt som dag-sheeten
// (fungerar innan inköpsfliken öppnats: ladda listan först vid behov).
window.todayAddItem = async function () {
  const input = document.getElementById('todayAddInput');
  const item = input?.value.trim();
  if (!item) { input?.focus(); return; }
  try {
    if (!window._shopListId && window.loadShoppingTab) await window.loadShoppingTab();
  } catch { /* addManualItem ger begripligt fel nedan */ }
  await window.addManualItem('todayAddInput', 'todayAddBtn');
  if (input && input.value === '') {
    window.showToast?.(`${item} ligger nu på inköpslistan.`, { type: 'success' });
    document.getElementById('todayAddInput')?.focus();
  }
};

// ── Håll Idag-vyn i synk med datat ────────────────────────────────────────────
function wrap(name, { async = false, onAfter } = {}) {
  const orig = window[name];
  if (typeof orig !== 'function' || orig.__todayWrapped) return;
  const wrapped = async
    ? async function (...args) {
        const r = await orig.apply(this, args);
        window._todayReady = true;
        try { renderTodayView(); } catch (e) { console.error('renderTodayView', e); }
        onAfter?.();
        return r;
      }
    : function (...args) {
        const r = orig.apply(this, args);
        window._todayReady = true;
        try { renderTodayView(); } catch (e) { console.error('renderTodayView', e); }
        onAfter?.();
        return r;
      };
  wrapped.__todayWrapped = true;
  window[name] = wrapped;
}

function installHooks() {
  wrap('renderWeeklyPlanData');
  // Kollar prisstatus + pinnade lappar först när loadWeeklyPlan (och därmed
  // auth+household) är klar — bådadera är hushållsskopad data som kräver en
  // inloggad session.
  wrap('loadWeeklyPlan', { async: true, onAfter: () => { checkPricingStatus(); checkPinnedNotes(); } });
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

window.renderTodayView = renderTodayView;
