// Idag-fliken — appens startflik och svaret på "vad blir det ikväll?".
//
// Läser: window._timelineByDate (byggs av renderWeeklyPlanData i plan-viewer.js),
//        window.RECIPES, window._lastPlan. Muterar inget eget tillstånd — bara
//        rendering + anrop av befintliga window.*-funktioner (VSA, samma mönster
//        som plan-viewer-deluxe.js).
//
// Re-render: vi wrappar window.renderWeeklyPlanData + loadWeeklyPlan (samma
// mönster som deluxe) så Idag-vyn hålls i synk efter generering/byte/laddning.
// Importeras EFTER plan-viewer-deluxe → wrappningen lägger sig ytterst.

import { fmtIso, PROTEIN_COLOR, isoWeekNumber, escapeHtml } from '../utils.js';

const MONTH_NAMES_LONG = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const PROTEIN_LABEL = { fisk: 'Fisk', kyckling: 'Kyckling', kött: 'Kött', fläsk: 'Fläsk', vegetarisk: 'Vegetariskt' };

const esc = escapeHtml;
function attr(s) { return String(s == null ? '' : s).replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

const I = {
  pot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13c0-3.5 3.5-6 8-6s8 2.5 8 6"/><path d="M3 13h18"/><path d="M5.5 13v2c0 1.5 1 2.5 2.5 2.5h8c1.5 0 2.5-1 2.5-2.5v-2"/><path d="M11 4.5c0-.8.5-1.5 1-1.5s1 .7 1 1.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"/><path d="M12 7.5v9 M9.5 9.7c.6-.7 1.5-1 2.5-1s2 .3 2.4 1c.5.8 0 1.7-1 2-.7.2-2.7.3-3.4.7-.9.4-1.4 1.3-.9 2.1.5.7 1.6 1 2.5 1s1.9-.3 2.5-1"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14 M5 12h14"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 13.2 10.8 19 12 13.2 13.2 12 20 10.8 13.2 5 12 10.8 10.8z"/></svg>',
};

function recipeById(id) {
  return id ? (window.RECIPES || []).find(r => r.id === id) : null;
}

// Beskriv en dags middag enhetligt (recept, egen planering, fri dag eller tom).
// Returnerar null för en tom/oplanerad dag.
function dayInfo(d) {
  if (!d) return null;
  if (d.recipeId && !d.isCustom) {
    const r = recipeById(d.recipeId);
    return {
      kind: 'recipe', title: d.recipe || '', cookId: d.recipeId,
      color: r ? (PROTEIN_COLOR[r.protein] || 'var(--lichen)') : 'var(--lichen)',
      time: r?.time || null, protein: r ? r.protein : null,
      saving: (d.saving && d.saving >= 10) ? d.saving : null,
    };
  }
  if (d.isCustom && d.customRecipeId) {
    const r = recipeById(d.customRecipeId);
    return {
      kind: 'recipe', title: d.customRecipeTitle || '', cookId: d.customRecipeId,
      color: r ? (PROTEIN_COLOR[r.protein] || 'var(--lichen)') : 'var(--lichen)',
      time: r?.time || null, protein: r ? r.protein : null, saving: null,
    };
  }
  if (d.isCustom && (d.customRecipeTitle || d.customNote)) {
    return { kind: 'note', title: d.customRecipeTitle || d.customNote, cookId: null, color: 'var(--birch)', time: null, protein: null, saving: null };
  }
  if (d.blocked) {
    return { kind: 'free', title: 'Fri dag', cookId: null, color: 'var(--birch-soft)', time: null, protein: null, saving: null };
  }
  return null;
}

function metaHtml(info) {
  const parts = [];
  if (info.protein) parts.push(`<span class="today-chip" style="--chip:${info.color}">${esc(PROTEIN_LABEL[info.protein] || info.protein)}</span>`);
  if (info.time) parts.push(`<span class="today-meta-time">${I.clock}${info.time} min</span>`);
  if (info.saving) parts.push(`<span class="today-meta-saving">${I.coin}${info.saving} kr</span>`);
  return parts.length ? `<div class="today-meta">${parts.join('')}</div>` : '';
}

// ── Delrenderingar ────────────────────────────────────────────────────────────

function heroHtml(todayEntry, todayInfo, eyebrow) {
  const head = `<p class="today-eyebrow">${esc(eyebrow)}</p>`;

  // Ikväll saknar middag (tom dag / fri dag) → planera-läge.
  if (!todayInfo || todayInfo.kind === 'free') {
    const isFree = todayInfo?.kind === 'free';
    return `${head}
      <div class="today-hero today-hero-empty">
        <span class="today-hero-icon">${I.pot}</span>
        <h2 class="today-hero-title">${isFree ? 'Fri dag ikväll' : 'Inget planerat ikväll'}</h2>
        <p class="today-hero-note">${isFree ? 'Ingen middag inplanerad — passa på att ta det lugnt.' : 'Välj en rätt för ikväll eller skapa en ny matsedel.'}</p>
        <div class="today-actions">
          ${todayEntry ? `<button type="button" class="today-cook-btn" onclick="dlxDayClick('${todayEntry.date}', '${attr(todayEntry.day)}')">${I.plus}<span>Planera dagen</span></button>` : ''}
          <button type="button" class="today-more-btn" onclick="openNewPlan()">Ny matsedel</button>
        </div>
      </div>`;
  }

  const cookBtn = todayInfo.cookId
    ? `<button type="button" class="today-cook-btn" onclick="openCookMode(${todayInfo.cookId})">${I.pot}<span>Börja laga</span></button>`
    : '';
  return `${head}
    <article class="today-hero" style="--rail:${todayInfo.color}"
             role="button" tabindex="0"
             onclick="dlxDayClick('${todayEntry.date}', '${attr(todayEntry.day)}')"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();dlxDayClick('${todayEntry.date}', '${attr(todayEntry.day)}')}">
      <span class="today-hero-rail"></span>
      <span class="today-hero-eyebrow">${I.pot} Ikväll</span>
      <h2 class="today-hero-title">${esc(todayInfo.title)}</h2>
      ${metaHtml(todayInfo)}
      <div class="today-actions" onclick="event.stopPropagation()">
        ${cookBtn}
        <button type="button" class="today-more-btn" onclick="dlxDayClick('${todayEntry.date}', '${attr(todayEntry.day)}')">Mer</button>
      </div>
    </article>`;
}

function tomorrowHtml(entry, info) {
  if (!entry || !info) return '';
  return `
    <article class="today-tomorrow" style="--rail:${info.color}"
             role="button" tabindex="0"
             onclick="dlxDayClick('${entry.date}', '${attr(entry.day)}')"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();dlxDayClick('${entry.date}', '${attr(entry.day)}')}">
      <span class="today-tomorrow-rail"></span>
      <div class="today-tomorrow-main">
        <span class="today-tomorrow-eyebrow">I morgon · ${esc(entry.day)}</span>
        <span class="today-tomorrow-title">${esc(info.title)}</span>
      </div>
      <span class="today-tomorrow-chev" aria-hidden="true">›</span>
    </article>`;
}

// Färgstapelöversikt över planens dagar — en stapel per dag i proteinets färg.
function weekHtml(days) {
  if (!days.length) return '';
  const todayIso = fmtIso(new Date());
  const bars = days.map(d => {
    const info = dayInfo(d);
    const color = info ? info.color : 'var(--birch-soft)';
    const cls = [
      'today-bar',
      d.date < todayIso ? 'is-past' : '',
      d.date === todayIso ? 'is-today' : '',
      info ? '' : 'is-empty',
    ].filter(Boolean).join(' ');
    return `<div class="${cls}" title="${esc(d.day)}${info ? ' · ' + esc(info.title) : ''}">
        <span class="today-bar-fill" style="background:${color}"></span>
        <span class="today-bar-lbl">${esc(d.day.charAt(0))}</span>
      </div>`;
  }).join('');
  return `
    <section class="today-week" role="button" tabindex="0"
             onclick="switchTab('vecka')"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();switchTab('vecka')}">
      <div class="today-week-head">
        <h3 class="today-section-title">Kommande veckan</h3>
        <span class="today-week-link">Hela matsedeln ›</span>
      </div>
      <div class="today-bars">${bars}</div>
    </section>`;
}

function quickAddHtml() {
  return `
    <section class="today-quickadd">
      <h3 class="today-section-title">Snabbt till listan</h3>
      <div class="today-add-row">
        <input type="text" id="todayAddInput" class="today-add-input" maxlength="80"
               placeholder="T.ex. mjölk, bananer…"
               onkeydown="if(event.key==='Enter'){event.preventDefault();todayAddItem()}">
        <button type="button" id="todayAddBtn" class="today-add-btn" onclick="todayAddItem()">Lägg till</button>
      </div>
    </section>`;
}

function loadingHtml() {
  return `<div class="today-loading"><span class="today-loading-spin">⟳</span><p>Laddar…</p></div>`;
}

function noPlanHtml() {
  return `
    <div class="today-hero today-hero-empty today-hero-welcome">
      <span class="today-hero-icon">${I.sparkle}</span>
      <h2 class="today-hero-title">Ingen matsedel ännu</h2>
      <p class="today-hero-note">Skapa familjens första matsedel så syns kvällens middag här.</p>
      <div class="today-actions">
        <button type="button" class="today-cook-btn" onclick="openNewPlan()">${I.sparkle}<span>Skapa matsedel</span></button>
      </div>
    </div>`;
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

  const todayEntry = timeline[todayIso] || null;
  const todayInfo = dayInfo(todayEntry);
  const tomorrowEntry = timeline[tomorrowIso] || null;
  const tomorrowInfo = dayInfo(tomorrowEntry);

  const wk = isoWeekNumber(todayIso);
  const eyebrow = todayEntry
    ? `${todayEntry.day} ${todayEntry.dayNum} ${MONTH_NAMES_LONG[todayEntry.month]} · vecka ${wk}`
    : `${capitalize(now.toLocaleDateString('sv-SE', { weekday: 'long' }))} ${now.getDate()} ${MONTH_NAMES_LONG[now.getMonth()]} · vecka ${wk}`;

  // Kommande veckan: dagens dag + framåt ur tidslinjen, max 7 dagar.
  const upcoming = Object.values(timeline)
    .filter(d => d.date >= todayIso && !d.isArchive)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 7);

  host.innerHTML =
    heroHtml(todayEntry, todayInfo, eyebrow) +
    tomorrowHtml(tomorrowEntry, tomorrowInfo) +
    weekHtml(upcoming) +
    quickAddHtml();

  if (prevVal != null) {
    const input = document.getElementById('todayAddInput');
    if (input) {
      input.value = prevVal;
      if (hadFocus) input.focus();
    }
  }
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Snabbt till listan — återanvänder addManualItem exakt som dag-sheeten gör
// (den fungerar innan inköpsfliken öppnats: ladda listan först vid behov).
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
// Wrappa samma ingångar som deluxe: renderWeeklyPlanData (genererings-/åtgärds-
// vägen) + loadWeeklyPlan (boot + realtime-omladdning) + switchTab (öppna fliken).
function wrap(name, { async = false } = {}) {
  const orig = window[name];
  if (typeof orig !== 'function' || orig.__todayWrapped) return;
  const wrapped = async
    ? async function (...args) {
        const r = await orig.apply(this, args);
        window._todayReady = true;
        try { renderTodayView(); } catch (e) { console.error('renderTodayView', e); }
        return r;
      }
    : function (...args) {
        const r = orig.apply(this, args);
        window._todayReady = true;
        try { renderTodayView(); } catch (e) { console.error('renderTodayView', e); }
        return r;
      };
  wrapped.__todayWrapped = true;
  window[name] = wrapped;
}

function installHooks() {
  wrap('renderWeeklyPlanData');
  wrap('loadWeeklyPlan', { async: true });
  const origSwitch = window.switchTab;
  if (typeof origSwitch === 'function' && !origSwitch.__todayWrapped) {
    const wrappedSwitch = function (tab) {
      const r = origSwitch.apply(this, arguments);
      if (tab === 'idag') {
        try { renderTodayView(); } catch (e) { console.error('renderTodayView', e); }
      }
      return r;
    };
    wrappedSwitch.__todayWrapped = true;
    window.switchTab = wrappedSwitch;
  }
}

installHooks();

window.renderTodayView = renderTodayView;
