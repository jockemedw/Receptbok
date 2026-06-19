// Premiumvy för matsedeln — en helt alternativ presentation av samma data.
//
// Läser: window._timelineByDate, window._lastPlan, window._lastShop,
//        window.RECIPES, window.planConfirmed, window._planArchive, window._customDays
// Muterar inget eget tillstånd — all backend-logik återanvänds via befintliga
// endpoints och window.*-funktioner. Klassiska vyn lämnas orörd; en segmenterad
// växel styr bara vilken som visas (CSS via body.week-deluxe).
//
// Re-render: vi wrappar window.renderWeeklyPlanData så båda vyerna alltid hålls
// i synk efter generering/byte/bekräftelse.

import { fmtIso, fmtShort, PROTEIN_COLOR, isoWeekNumber } from '../utils.js';

const STORAGE_KEY = 'weekViewMode'; // 'deluxe' | 'classic' — ren presentationspreferens
const DAY_NAMES_LONG = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
const MONTH_NAMES_SHORT = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];
const PROTEIN_LABEL = { fisk: 'Fisk', kyckling: 'Kyckling', kött: 'Kött', fläsk: 'Fläsk', vegetarisk: 'Vegetariskt' };

const I = {
  coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"/><path d="M12 7.5v9 M9.5 9.7c.6-.7 1.5-1 2.5-1s2 .3 2.4 1c.5.8 0 1.7-1 2-.7.2-2.7.3-3.4.7-.9.4-1.4 1.3-.9 2.1.5.7 1.6 1 2.5 1s1.9-.3 2.5-1"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h3.5c1.2 0 2.3.6 3 1.6l5 7c.7 1 1.8 1.6 3 1.6H21"/><path d="M18 4l3 3-3 3"/><path d="M3 17h3.5c1.2 0 2.3-.6 3-1.6l.7-1M14.8 9.6l.7-1c.7-1 1.8-1.6 3-1.6H21"/><path d="M18 14l3 3-3 3"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10a2 2 0 0 0-2.8-2.8L5 17v3z"/><path d="M13.5 6.5l4 4"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h13M14 4l3 3-3 3"/><path d="M20 17H7M10 14l-3 3 3 3"/></svg>',
  move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16"/><path d="M4 20h16"/><path d="M12 8v8"/><path d="m8.5 12.5 3.5 3.5 3.5-3.5"/></svg>',
  free: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4 M8 2v4 M3 10h18"/><path d="M9 15l6 0"/></svg>',
  pot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13c0-3.5 3.5-6 8-6s8 2.5 8 6"/><path d="M3 13h18"/><path d="M5.5 13v2c0 1.5 1 2.5 2.5 2.5h8c1.5 0 2.5-1 2.5-2.5v-2"/><path d="M11 4.5c0-.8.5-1.5 1-1.5s1 .7 1 1.5"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5h11l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 11h8 M8 14h8 M8 17h5"/></svg>',
  chef: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5"/><path d="M7 14a4 4 0 0 1-1-7.9A4 4 0 0 1 13 4a4 4 0 0 1 5 8"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg>',
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function attr(s) { return String(s == null ? '' : s).replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

function fmtKr(value) {
  if (value == null) return '–';
  const r = Math.round(value);
  return `${r} kr`;
}

// ── Växel mellan Premium / Klassisk ──────────────────────────────────────────
function currentMode() {
  try { return localStorage.getItem(STORAGE_KEY) || 'deluxe'; }
  catch { return 'deluxe'; }
}
function applyMode(mode) {
  document.body.classList.toggle('week-deluxe', mode === 'deluxe');
  document.querySelectorAll('.dlx-switch-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
}
function setMode(mode) {
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* strunt */ }
  applyMode(mode);
  if (mode === 'classic' && window.centerTodayCard) {
    requestAnimationFrame(() => window.centerTodayCard({ smooth: false }));
  }
  if (mode === 'deluxe') {
    requestAnimationFrame(() => snapToHero());
  }
}
window.setWeekViewMode = setMode;

// ── Injektion av DOM-skal (körs en gång) ─────────────────────────────────────
let _injected = false;
function ensureScaffold() {
  if (_injected) return true;
  const content = document.getElementById('weekContent');
  const timelineOuter = document.getElementById('timelineOuter');
  if (!content || !timelineOuter) return false;

  // Segmenterad växel — synlig i båda lägena, högst upp i weekContent.
  const sw = document.createElement('div');
  sw.className = 'dlx-switch';
  sw.innerHTML = `
    <button type="button" class="dlx-switch-btn" data-mode="deluxe" onclick="setWeekViewMode('deluxe')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.4 5.3L20 9l-4 4 1 6-5-2.8L7 19l1-6-4-4 5.6-.7z"/></svg>
      <span>Premium</span>
    </button>
    <button type="button" class="dlx-switch-btn" data-mode="classic" onclick="setWeekViewMode('classic')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18 M9 4v16"/></svg>
      <span>Klassisk</span>
    </button>`;
  content.insertBefore(sw, content.firstChild);

  // Premiumvyns container — direkt efter den klassiska tidslinjen.
  const host = document.createElement('div');
  host.id = 'weekDeluxe';
  timelineOuter.after(host);

  _injected = true;
  applyMode(currentMode());
  return true;
}

// ── Datahämtning ut ur timeline ──────────────────────────────────────────────
function sortedTimeline() {
  const map = window._timelineByDate || {};
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

function recipeById(id) {
  return id ? (window.RECIPES || []).find(r => r.id === id) : null;
}

// ── "Ikväll"-kort — svarar på familjens vanligaste fråga direkt i heron ──────
// ERSÄTTER dagens kort i listan (ingen dubblering): visar datum, expanderar
// till full receptdetalj vid tryck och deltar i byt dag-flödet som vanliga kort.
function buildTonight(timeline) {
  const todayIso = fmtIso(new Date());
  const d = timeline.find(t => t.date === todayIso);
  if (!d) return '';

  const expanded = window._dlxExpanded === d.date;

  let label, sub = '', click = `dlxToggleDay('${d.date}')`, kind = '', mkind = 'custom', detail = '';
  if (d.recipeId && !d.isCustom) {
    const r = recipeById(d.recipeId);
    label = d.recipe || '';
    sub = [r?.time ? `${r.time} min` : null, r ? PROTEIN_LABEL[r.protein] : null].filter(Boolean).join(' · ');
    kind = 'recipe';
    mkind = 'recipe';
    if (expanded) detail = recipeDetail(d, r, { active: d.planId === 'active' });
  } else if (d.isCustom && d.customRecipeId) {
    const r = recipeById(d.customRecipeId);
    label = d.customRecipeTitle || '';
    sub = 'Egen planering';
    if (expanded) detail = recipeDetail({ ...d, recipeId: d.customRecipeId }, r, { active: false });
  } else if (d.isCustom && (d.customRecipeTitle || d.customNote)) {
    label = d.customRecipeTitle || d.customNote;
    sub = 'Egen planering';
    click = `dlxCustomClick('${d.date}', '${attr(d.day)}')`;
    // Fäll ut samma egen-planering-editor inline som i dagslistan — annars
    // togglar tryck bara expand-state utan att visa något (död interaktion).
    if (expanded && window.customDayEditorHtml) {
      detail = `<div class="dlx-detail dlx-detail-custom" onclick="event.stopPropagation()">${window.customDayEditorHtml(d.date, d.day)}</div>`;
    }
  } else if (d.blocked) {
    label = 'Fri dag';
    sub = 'Ingen middag planerad';
    mkind = 'free';
    click = `dlxFreeClick('${d.date}', '${attr(d.day)}')`;
  } else {
    return '';
  }

  return `
    <article class="dlx-tonight${expanded ? ' expanded' : ''}${modeCls(d, mkind)}" data-date="${d.date}"${kind ? ` data-kind="${kind}"` : ''}
             role="button" tabindex="0" onclick="${click}">
      <span class="dlx-tonight-eyebrow">${I.pot} Ikväll</span>
      <div class="dlx-tonight-head">
        <div class="dlx-day-when">
          <span class="dlx-day-dow">${esc(d.day)}</span>
          <span class="dlx-day-date"><span class="dlx-day-num">${d.dayNum}</span><span class="dlx-day-mon">${MONTH_NAMES_SHORT[d.month]}</span></span>
        </div>
        <div class="dlx-tonight-main">
          <span class="dlx-tonight-title">${esc(label)}</span>
          ${sub ? `<span class="dlx-tonight-sub">${esc(sub)}</span>` : ''}
        </div>
      </div>
      <span class="dlx-tonight-chev" aria-hidden="true">›</span>
      ${detail}
    </article>`;
}

// ── Hero-statistik ────────────────────────────────────────────────────────────
function buildHero(plan, pending) {
  const days = plan?.days || [];
  const planned = days.filter(d => d.recipeId).length;
  const totalSaving = days.reduce((s, d) => s + (d.saving || 0), 0);

  // Proteinfördelning
  const counts = {};
  for (const d of days) {
    const r = recipeById(d.recipeId);
    if (!r) continue;
    counts[r.protein] = (counts[r.protein] || 0) + 1;
  }
  const order = ['fisk', 'kyckling', 'kött', 'fläsk', 'vegetarisk'];
  const segs = order.filter(p => counts[p]).map(p => {
    const pct = planned ? (counts[p] / planned * 100) : 0;
    return `<span class="dlx-bar-seg" style="flex:${counts[p]};background:${PROTEIN_COLOR[p] || 'var(--birch)'}"
              title="${PROTEIN_LABEL[p]}: ${counts[p]}"></span>`;
  }).join('');
  const legend = order.filter(p => counts[p]).map(p =>
    `<span class="dlx-legend-item"><span class="dlx-legend-dot" style="background:${PROTEIN_COLOR[p] || 'var(--birch)'}"></span>${PROTEIN_LABEL[p]} ${counts[p]}</span>`
  ).join('');

  const vegCount = counts['vegetarisk'] || 0;

  let title, eyebrow;
  if (plan?.startDate && plan?.endDate) {
    const wk = isoWeekNumber(plan.startDate);
    const wk2 = isoWeekNumber(plan.endDate);
    eyebrow = wk === wk2 ? `Vecka ${wk}` : `Vecka ${wk}–${wk2}`;
    title = `${fmtShort(plan.startDate)} – ${fmtShort(plan.endDate)}`;
  } else {
    eyebrow = 'Matsedel';
    title = 'Veckans måltider';
  }

  const hasDeals = !!(window._weeklyDeals?.candidates?.length);
  const savingStat = totalSaving >= 1 ? (
    hasDeals
      ? `<button type="button" class="dlx-stat dlx-stat-saving has-deals" onclick="openDealsPopup()" title="Se veckans fynd">
          <div class="dlx-stat-num">${I.coin}${fmtKr(totalSaving)}</div>
          <div class="dlx-stat-lbl">sparat · se fynd ›</div>
        </button>`
      : `<div class="dlx-stat dlx-stat-saving">
          <div class="dlx-stat-num">${I.coin}${fmtKr(totalSaving)}</div>
          <div class="dlx-stat-lbl">sparat mot normalpris</div>
        </div>`
  ) : (hasDeals
      ? `<button type="button" class="dlx-stat dlx-stat-saving has-deals" onclick="openDealsPopup()" title="Se veckans fynd">
          <div class="dlx-stat-num">${I.coin}</div>
          <div class="dlx-stat-lbl">se veckans fynd ›</div>
        </button>`
      : '');

  const pendingTag = pending
    ? `<span class="dlx-hero-badge">Förslag — ej bekräftat</span>`
    : (plan?.confirmedAt ? `<span class="dlx-hero-badge confirmed">Bekräftad</span>` : '');

  const barBlock = planned ? `
      <div class="dlx-bar">${segs}</div>
      <div class="dlx-legend">${legend}</div>` : '';

  return `
    <div class="dlx-hero">
      <div class="dlx-hero-glow"></div>
      <div class="dlx-hero-top">
        <span class="dlx-hero-eyebrow">${esc(eyebrow)}</span>
        ${pendingTag}
      </div>
      <h2 class="dlx-hero-title">${esc(title)}</h2>
      <div class="dlx-stats">
        <div class="dlx-stat">
          <div class="dlx-stat-num">${I.chef}${planned}</div>
          <div class="dlx-stat-lbl">${planned === 1 ? 'måltid' : 'måltider'} planerade</div>
        </div>
        <div class="dlx-stat">
          <div class="dlx-stat-num">${I.leaf}${vegCount}</div>
          <div class="dlx-stat-lbl">${vegCount === 1 ? 'vegetarisk dag' : 'vegetariska dagar'}</div>
        </div>
        ${savingStat}
      </div>
      ${barBlock}
    </div>`;
}

// ── Dagskort ──────────────────────────────────────────────────────────────────

// Tilläggsklasser under pågående byt/flytta-läge: källa, giltigt mål eller
// nedtonad. Beräknas i renderingen (state-driven) så markeringarna alltid
// stämmer — även efter en re-render mitt i flödet.
function modeCls(d, kind) {
  const mode = window._dlxSwap || window._dlxMove;
  if (!mode) return '';
  if (d.date === mode.from) return ' dlx-swap-source' + (mode.pending ? ' dlx-busy' : '');
  if (window._dlxMove) return ' dlx-dim';   // i flytta-läge är bara släppzonerna mål
  const eligible =
    kind === 'recipe' ? (d.planId === 'active' && !d.isArchive) :
    kind === 'gap'    ? !d.isPast :
    false;                                  // egen planering/fri dag kan aldrig bytas
  if (!eligible) return ' dlx-dim';
  return ' dlx-swap-target' + (window._dlxSwap.pending === d.date ? ' dlx-busy' : '');
}

function dayBadges(d) {
  const out = [];
  if (d.isToday) out.push('<span class="dlx-day-flag today">Idag</span>');
  // Helg markeras med en dovare kort-bakgrund (.dlx-day.is-weekend) — inte med en pill.
  // Helgdag (midsommar m.fl.) renderas som en högerställd chip vid chevronen
  // (injiceras i renderDayCard), så den aldrig trängs in i den smala datumkolumnen
  // och knuffar dagens innehåll. Båda hålls utanför flödet → jämn korthöjd.
  return out.join('');
}

function recipeDayCard(d, opts) {
  const r = recipeById(d.recipeId);
  const color = r ? (PROTEIN_COLOR[r.protein] || 'var(--lichen)') : 'var(--lichen)';
  const time = r?.time ? `${r.time} min` : '';
  const protLabel = r ? (PROTEIN_LABEL[r.protein] || r.protein) : '';
  const expanded = window._dlxExpanded === d.date;

  const savingPill = (d.saving && d.saving >= 10) ? (
    d.savingMatches?.length
      ? `<button type="button" class="dlx-saving has-details" onclick="event.stopPropagation();openSavingPopover('${d.date}')">${I.coin}${d.saving} kr</button>`
      : `<span class="dlx-saving">${I.coin}${d.saving} kr</span>`
  ) : '';

  const metaParts = [];
  if (protLabel) metaParts.push(`<span class="dlx-chip" style="--chip:${color}">${esc(protLabel)}</span>`);
  if (time) metaParts.push(`<span class="dlx-meta-time">${I.clock}${time}</span>`);

  return `
    <article class="dlx-day${opts.cls}${expanded ? ' expanded' : ''}${modeCls(d, 'recipe')}" data-date="${d.date}"
             style="--rail:${color}" onclick="dlxToggleDay('${d.date}')">
      <span class="dlx-rail"></span>
      <div class="dlx-day-head">
        <div class="dlx-day-when">
          <span class="dlx-day-dow">${esc(d.day)}</span>
          <span class="dlx-day-date"><span class="dlx-day-num">${d.dayNum}</span><span class="dlx-day-mon">${MONTH_NAMES_SHORT[d.month]}</span></span>
          <span class="dlx-day-flags">${dayBadges(d)}</span>
        </div>
        <div class="dlx-day-main">
          <h3 class="dlx-day-recipe">${esc(d.recipe || '')}</h3>
          <div class="dlx-day-meta">${metaParts.join('')}${savingPill}</div>
        </div>
        <span class="dlx-day-chev" aria-hidden="true">›</span>
      </div>
      ${expanded ? recipeDetail(d, r, opts) : ''}
    </article>`;
}

function recipeDetail(d, r, opts) {
  if (!r) {
    return `<div class="dlx-detail"><p class="dlx-detail-empty">Receptet finns inte längre i receptboken.
      <button class="dlx-mini-btn" onclick="event.stopPropagation();jumpToRecipe('${attr(d.recipe)}')">Sök i receptboken</button></p></div>`;
  }
  const ings = (r.ingredients || []).map(i => `<li>${esc(i)}</li>`).join('');
  const steps = (r.instructions || []).map((s, i) =>
    `<li><span class="dlx-step-num">${i + 1}</span><span>${esc(s)}</span></li>`).join('');
  const notes = r.notes ? `<div class="dlx-notes">💡 ${esc(r.notes)}</div>` : '';
  const statusPill = `<span class="dlx-status ${r.tested ? 'tested' : 'untested'}">${r.tested ? '✓ Provat' : 'Ej provat'}</span>`;

  // Åtgärder — samma regler som klassiska vyn:
  //  - Byta RECEPT (slumpa/välj själv) bara på ej-bekräftad plan (inköpslistan
  //    är redan byggd efter bekräftelse).
  //  - Flytta DAGAR (byt dag / fri dag = "skjut planen →") även på bekräftad
  //    plan — receptmängden är oförändrad, så inköpslistan påverkas inte.
  const canReplace = opts.active && !window.planConfirmed && !d.isArchive;
  const canMove    = opts.active && !d.isArchive;
  let actions = '';
  if (canReplace || canMove) {
    actions = `
      <div class="dlx-actions">
        ${canReplace ? `
        <button class="dlx-act primary" onclick="event.stopPropagation();dlxShuffle('${d.date}', this)">${I.shuffle}<span>Slumpa nytt</span></button>
        <button class="dlx-act" onclick="event.stopPropagation();enterReplaceMode('${d.date}', '${attr(d.day)}')">${I.pencil}<span>Välj själv</span></button>` : ''}
        ${canMove ? `
        <button class="dlx-act" onclick="event.stopPropagation();dlxStartSwap('${d.date}')">${I.swap}<span>Byt dag</span></button>` : ''}
        ${canMove && !d.isPast ? `
        <button class="dlx-act" onclick="event.stopPropagation();dlxStartMove('${d.date}')">${I.move}<span>Flytta dag</span></button>
        <button class="dlx-act" onclick="event.stopPropagation();dlxFreeDay('${d.date}', this)">${I.free}<span>Fri dag — skjut planen</span></button>` : ''}
      </div>`;
  } else if (d.isArchive) {
    actions = `<p class="dlx-readonly">📜 Historisk plan — bara för referens.</p>`;
  } else if (d.isCustom) {
    actions = `<button class="dlx-mini-btn" onclick="event.stopPropagation();openCustomDay('${d.date}', '${attr(d.day)}')">Redigera egen planering</button>`;
  }

  return `
    <div class="dlx-detail" onclick="event.stopPropagation()">
      <div class="dlx-detail-head">${statusPill}<span class="dlx-detail-portions">${r.servings} portioner</span>
        <button type="button" class="dlx-cook-btn" onclick="event.stopPropagation();openCookMode(${r.id})">${I.pot}<span>Börja laga</span></button>
      </div>
      <div class="dlx-detail-cols">
        <section class="dlx-detail-block">
          <h4>Ingredienser</h4>
          <ul class="dlx-ings">${ings}</ul>
        </section>
        <section class="dlx-detail-block">
          <h4>Gör så här</h4>
          <ol class="dlx-steps">${steps}</ol>
        </section>
      </div>
      ${notes}
      ${actions}
    </div>`;
}

function emptyDayCard(d) {
  // Gap, fri dag, eller tom custom-dag
  if (d.isCustom) {
    if (d.customRecipeId) {
      const r = recipeById(d.customRecipeId);
      const color = r ? (PROTEIN_COLOR[r.protein] || 'var(--lichen)') : 'var(--lichen)';
      const expanded = window._dlxExpanded === d.date;
      return `
        <article class="dlx-day custom${expanded ? ' expanded' : ''}${modeCls(d, 'custom')}" data-date="${d.date}" style="--rail:${color}"
                 onclick="dlxToggleDay('${d.date}')">
          <span class="dlx-rail"></span>
          <div class="dlx-day-head">
            <div class="dlx-day-when"><span class="dlx-day-dow">${esc(d.day)}</span>
              <span class="dlx-day-date"><span class="dlx-day-num">${d.dayNum}</span><span class="dlx-day-mon">${MONTH_NAMES_SHORT[d.month]}</span></span>
              <span class="dlx-day-flags">${dayBadges(d)}</span></div>
            <div class="dlx-day-main">
              <span class="dlx-day-tag">${I.pot} Egen planering</span>
              <h3 class="dlx-day-recipe">${esc(d.customRecipeTitle || '')}</h3>
            </div>
            <span class="dlx-day-chev" aria-hidden="true">›</span>
          </div>
          ${expanded ? recipeDetail({ ...d, recipeId: d.customRecipeId }, r, { active: false }) : ''}
        </article>`;
    }
    const expanded = window._dlxExpanded === d.date;
    return `
      <article class="dlx-day custom${expanded ? ' expanded' : ' slim'}${modeCls(d, 'custom')}" data-date="${d.date}" onclick="dlxCustomClick('${d.date}', '${attr(d.day)}')">
        <span class="dlx-rail" style="background:var(--birch)"></span>
        <div class="dlx-day-head">
          <div class="dlx-day-when"><span class="dlx-day-dow">${esc(d.day)}</span>
            <span class="dlx-day-date"><span class="dlx-day-num">${d.dayNum}</span><span class="dlx-day-mon">${MONTH_NAMES_SHORT[d.month]}</span></span>
            <span class="dlx-day-flags">${dayBadges(d)}</span></div>
          <div class="dlx-day-main">
            <span class="dlx-day-tag">${I.note} Egen planering</span>
            <p class="dlx-day-note">${d.customNote ? esc(d.customNote) : 'Tryck för att lägga till'}</p>
          </div>
          <span class="dlx-day-chev" aria-hidden="true">›</span>
        </div>
        ${expanded ? `<div class="dlx-detail dlx-detail-custom" onclick="event.stopPropagation()">${window.customDayEditorHtml(d.date, d.day)}</div>` : ''}
      </article>`;
  }

  if (d.blocked) {
    const click = `onclick="dlxFreeClick('${d.date}', '${attr(d.day)}')"`;
    return `
      <article class="dlx-day free slim${modeCls(d, 'free')}" data-date="${d.date}" ${click}>
        <span class="dlx-rail" style="background:var(--birch-soft)"></span>
        <div class="dlx-day-head">
          <div class="dlx-day-when"><span class="dlx-day-dow">${esc(d.day)}</span>
            <span class="dlx-day-date"><span class="dlx-day-num">${d.dayNum}</span><span class="dlx-day-mon">${MONTH_NAMES_SHORT[d.month]}</span></span>
            <span class="dlx-day-flags">${dayBadges(d)}</span></div>
          <div class="dlx-day-main"><p class="dlx-day-note">${I.free} Fri dag</p></div>
          <span class="dlx-day-chev" aria-hidden="true">›</span>
        </div>
      </article>`;
  }

  // Tom dag (gap) — bara framtida är klickbar. dlxGapClick routar: i byt
  // dag-läge väljs dagen som mål (receptet flyttas dit), annars fälls DET
  // klickade kortet ut inline med egen-planering-editorn.
  const clickable = !d.isPast;
  const expanded = clickable && window._dlxExpanded === d.date;
  const click = clickable ? `onclick="dlxGapClick('${d.date}', '${attr(d.day)}')"` : '';
  return `
    <article class="dlx-day gap${expanded ? ' expanded' : ' slim'}${clickable ? '' : ' inert'}${modeCls(d, 'gap')}" data-date="${d.date}" ${click}>
      <span class="dlx-rail" style="background:transparent"></span>
      <div class="dlx-day-head">
        <div class="dlx-day-when"><span class="dlx-day-dow">${esc(d.day)}</span>
          <span class="dlx-day-date"><span class="dlx-day-num">${d.dayNum}</span><span class="dlx-day-mon">${MONTH_NAMES_SHORT[d.month]}</span></span>
          <span class="dlx-day-flags">${dayBadges(d)}</span></div>
        <div class="dlx-day-main"><p class="dlx-day-note muted">${clickable ? '+ Planera dagen' : '—'}</p></div>
        ${clickable ? '<span class="dlx-day-chev" aria-hidden="true">›</span>' : ''}
      </div>
      ${expanded ? `<div class="dlx-detail dlx-detail-custom" onclick="event.stopPropagation()">${window.customDayEditorHtml(d.date, d.day)}</div>` : ''}
    </article>`;
}

function renderDayCard(d) {
  const opts = {
    active: d.planId === 'active',
    cls: (d.isToday ? ' is-today' : '') + (d.isPast ? ' is-past' : '') + (d.isArchive ? ' is-archive' : ''),
  };
  let html = (d.recipeId && !d.isCustom) ? recipeDayCard(d, opts) : emptyDayCard(d);
  // Helg → dovare kort-bakgrund. Klassen injiceras på ett ställe så att alla
  // korttyper täcks utan att röra varje mall. Suppr. på "idag" (rust-ramen räcker).
  if (d.isWeekend && !d.isToday) html = html.replace('class="dlx-day', 'class="dlx-day is-weekend');
  // Helgdag (midsommar m.fl.) → chip-markering med EN placering på alla korttyper:
  // strax före chevronen (höger). Bara icke-klickbara kort (förfluten gap utan
  // chevron) faller tillbaka på main. Aldrig i den smala datumkolumnen (radbryts).
  if (d.holiday) {
    const chip = `<span class="dlx-day-holiday">${esc(d.holiday)}</span>`;
    if (html.includes('dlx-day-chev')) {
      html = html.replace('<span class="dlx-day-chev"', `${chip}<span class="dlx-day-chev"`);
    } else {
      html = html.replace('<div class="dlx-day-main">', `<div class="dlx-day-main">${chip}`);
    }
  }
  return html;
}

// Renderar en lista dagskort med en tunn "Vecka N"-avdelare där ISO-veckan byter.
// Ingen avdelare före första kortet — hero-rutan visar redan startveckan.
function renderDayList(days) {
  const zones = moveZoneCtx();   // släppzoner i flytta dag-läge (annars null)
  let html = '';
  let lastWeek = null;
  for (const d of days) {
    const wk = isoWeekNumber(d.date);
    if (lastWeek !== null && wk !== lastWeek) {
      html += `<div class="dlx-week-sep"><span>Vecka ${wk}</span></div>`;
    }
    lastWeek = wk;
    if (zones?.set.has(d.date)) html += dropZone(d.date);
    html += renderDayCard(d);
    if (zones?.endAfter === d.date) html += dropZone(null);
  }
  return html;
}

// ── Huvudrendering ────────────────────────────────────────────────────────────
// Sektionsvis diff-rendering: varje del (historik/hero/banner/ikväll/dagar)
// bor i en egen wrapper (display: contents → påverkar inte layouten) och får
// sin innerHTML utbytt BARA när innehållet faktiskt ändrats. Det gör att t.ex.
// heron aldrig byggs om när man expanderar ett kort eller när realtime-ekot
// från ens egen skrivning kommer — inget blink, ingen fladder.
function setSec(host, name, html) {
  let el = host.querySelector(`:scope > .dlx-sec[data-sec="${name}"]`);
  if (!el) {
    el = document.createElement('div');
    el.className = 'dlx-sec';
    el.dataset.sec = name;
    host.appendChild(el);
  }
  if (el._dlxHtml !== html) { el.innerHTML = html; el._dlxHtml = html; }
}

// Banner för pågående byt/flytta-läge — state-driven så den överlever re-renders.
function modeBannerHtml() {
  if (window._dlxSwap) {
    const busy = !!window._dlxSwap.pending;
    return `<div class="dlx-swap-banner${busy ? ' busy' : ''}">
      <span>${busy ? `${I.swap} Byter dag…` : `${I.swap} Välj dagen att byta med — recept eller tom dag`}</span>
      ${busy ? '' : '<button onclick="dlxCancelSwap()">Avbryt</button>'}</div>`;
  }
  if (window._dlxMove) {
    const busy = !!window._dlxMove.pending;
    return `<div class="dlx-swap-banner${busy ? ' busy' : ''}">
      <span>${busy ? `${I.move} Flyttar dag…` : `${I.move} Tryck på platsen dit dagen ska flyttas`}</span>
      ${busy ? '' : '<button onclick="dlxCancelMove()">Avbryt</button>'}</div>`;
  }
  return '';
}

export function renderDeluxe() {
  if (!ensureScaffold()) return;
  const host = document.getElementById('weekDeluxe');
  if (!host) return;

  const timeline = sortedTimeline();
  if (!timeline.length) { host.innerHTML = ''; return; }

  const plan = window._lastPlan || null;
  const pending = !!(plan?.days?.length) && !plan?.confirmedAt && !window.planConfirmed;
  const todayIso = fmtIso(new Date());

  // Dela upp: historik (förflutet, ej idag) vs aktuellt/framtid.
  // Ikväll-kortet ersätter dagens kort i listan — ingen dubblering. Bara om
  // dagen är helt oplanerad (gap) ligger den kvar i listan ("+ Planera dagen").
  const hero = buildHero(plan, pending);
  const tonight = buildTonight(timeline);
  const history = timeline.filter(d => d.date < todayIso);
  const upcoming = timeline.filter(d => (tonight ? d.date > todayIso : d.date >= todayIso));

  const upcomingHtml = upcoming.length
    ? renderDayList(upcoming)
    : `<div class="dlx-empty-future">Inga kommande dagar planerade ännu.</div>`;

  // Historiken ligger i flödet OVANFÖR heron (ingen knapp). Vyn positioneras
  // vid heron när fliken öppnas; html-scroll-snap (proximity) gör att lätta
  // uppåtscrollar fjädrar tillbaka till heron — en bestämd scroll tar fram
  // historiken. Snap-ankaret är .dlx-hero (gate:as via .has-history).
  const historyHtml = history.length
    ? `<div class="dlx-history-flow">${renderDayList(history)}</div>`
    : '';
  host.classList.toggle('has-history', !!history.length);
  // När ett kort är utfällt: stäng av hero-snappen (CSS) så att proximity-snappen
  // inte drar tillbaka skärmen till heron och hindrar centrering på kortet.
  host.classList.toggle('has-expanded', !!window._dlxExpanded);

  // Släppzon för "kläm in före ikväll" — Ikväll-kortet ligger utanför dagslistan
  const tonightZone = (tonight && moveZoneCtx()?.set.has(todayIso)) ? dropZone(todayIso) : '';

  setSec(host, 'history', historyHtml);
  setSec(host, 'hero', hero);
  setSec(host, 'banner', modeBannerHtml());
  setSec(host, 'today', `${tonightZone}${tonight}`);
  setSec(host, 'days', `<div class="dlx-days">${upcomingHtml}</div>`);

  // Engångspositionering vid första datarendering (täcker deep-link ?tab=vecka
  // vid boot). Senare omrenderingar (expandera/byta recept/realtime) får ALDRIG
  // rycka i scrollpositionen — flik- och lägesbyten hanteras i sina hooks.
  if (!window._dlxDidSnap && history.length && document.body.dataset.activeTab === 'vecka') {
    window._dlxDidSnap = true;
    requestAnimationFrame(() => snapToHero());
  }

  // Entré-reveal: korten fade:as in EN gång när matsedeln först visas. Klassen
  // sitter på det persistenta värdelementet (inte korten, som återskapas vid
  // varje omrendering) → ingen re-fade-flimmer när man fäller ut/byter dag.
  if (!window._dlxEntered && document.body.dataset.activeTab === 'vecka') {
    window._dlxEntered = true;
    host.classList.add('dlx-enter');
    // Längre än sista kortets delay (0.25s) + faden (0.4s) så kaskaden hinner klart.
    setTimeout(() => host.classList.remove('dlx-enter'), 900);
  }
}

// Positionerar vyn så att heron ligger precis under headern → historiken
// hamnar utanför skärmen ovanför och nås genom att scrolla uppåt.
function snapToHero() {
  if (!document.body.classList.contains('week-deluxe')) return;
  const host = document.getElementById('weekDeluxe');
  if (!host || !host.classList.contains('has-history')) return;
  const hero = host.querySelector('.dlx-hero');
  if (!hero) return;
  const hh = document.querySelector('header')?.offsetHeight || 0;
  const top = hero.getBoundingClientRect().top + window.scrollY - hh - 10;
  window.scrollTo({ top: Math.max(0, top) });
}

// ── Interaktion ───────────────────────────────────────────────────────────────
function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

// Mjuk höjd-animering vid ut-/infällning. Diff-renderingen (setSec) äger DOM:en
// och bygger om hela 'days'-sektionen vid varje toggle, så detaljen poppar
// annars in/ut tvärt. Vi animerar height på det enskilda kortets .dlx-detail —
// helt lokalt, kan inte återintroducera listflimret (som rörde ALLA kort).
function expandDetailHeight(detail) {
  // Sätt 0 SYNKRONT (före paint) så detaljen inte blinkar fram i full höjd
  // först. scrollHeight rapporterar ändå innehållets höjd trots height:0.
  detail.style.overflow = 'hidden';
  detail.style.height = '0px';
  requestAnimationFrame(() => {
    detail.style.transition = 'height 0.28s ease';
    detail.style.height = detail.scrollHeight + 'px';
  });
  const cleanup = () => {
    detail.style.height = '';
    detail.style.overflow = '';
    detail.style.transition = '';
  };
  detail.addEventListener('transitionend', cleanup, { once: true });
}

function collapseDetailHeight(detail, done) {
  detail.style.overflow = 'hidden';
  detail.style.height = detail.scrollHeight + 'px';
  detail.getBoundingClientRect();
  detail.style.transition = 'height 0.22s ease';
  detail.style.height = '0px';
  let finished = false;
  const finish = () => { if (finished) return; finished = true; done(); };
  detail.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, 300);                  // fallback om transitionend uteblir
}

window.dlxToggleDay = function (date) {
  if (window._dlxSwap) { dlxPickSwapTarget(date); return; }
  if (window._dlxMove) return;   // i flytta-läge är bara släppzonerna klickbara

  const opening = window._dlxExpanded !== date;

  // Stänga: animera ihop det öppna kortet FÖRE omrenderingen (som tar bort det).
  if (!opening) {
    const open = document.querySelector(`#weekDeluxe [data-date="${date}"].expanded .dlx-detail`);
    // Skydda mot kapplöpning: om man hinner öppna ett annat kort medan detta
    // animeras ihop ska den fördröjda callbacken inte stänga det nya kortet.
    const reRender = () => { if (window._dlxExpanded === date) { window._dlxExpanded = null; renderDeluxe(); } };
    if (open && !prefersReducedMotion()) collapseDetailHeight(open, reRender);
    else reRender();
    return;
  }

  // Öppna: rendera in detaljen, sätt höjd 0 synkront + animera upp, scrolla in.
  window._dlxExpanded = date;
  renderDeluxe();
  const el = document.querySelector(`#weekDeluxe [data-date="${date}"]`);
  const detail = el?.querySelector('.dlx-detail');
  if (detail && !prefersReducedMotion()) expandDetailHeight(detail);
  requestAnimationFrame(() => {
    if (!el) return;
    const hh = document.querySelector('header')?.offsetHeight || 0;
    const top = el.getBoundingClientRect().top + window.scrollY - hh - 12;
    if (window.smoothScrollTo) window.smoothScrollTo(top, 360);
    else window.scrollTo({ top, behavior: 'smooth' });
  });
};


// Lokalt minne av aktiv plan-dag (spegel av plan-viewer.updateLastPlanDay)
function patchPlanDay(date, recipeId, recipe) {
  const day = window._lastPlan?.days?.find(d => d.date === date);
  if (day) { day.recipe = recipe; day.recipeId = recipeId; day.saving = 0; day.savingMatches = []; }
}

function weekRecipeIds() {
  return (window._lastPlan?.days || []).map(d => d.recipeId).filter(id => id != null);
}

function rerender(plan, shop) {
  window.renderWeeklyPlanData(plan, shop, false, window._planArchive, window._customDays);
  if (shop && window.renderShoppingData) window.renderShoppingData(shop);
}

window.dlxShuffle = async function (date, btn) {
  if (_opBusy) return;
  _opBusy = true;
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  const day = window._lastPlan?.days?.find(d => d.date === date);
  suppressEcho();
  try {
    const res = await fetch('/api/replace-recipe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        currentRecipeId: day?.recipeId || undefined,
        weekRecipeIds: weekRecipeIds(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'fel');
    patchPlanDay(date, data.recipeId, data.recipe);
    window._dlxExpanded = date;
    suppressEcho();
    rerender(window._lastPlan, data.shoppingList || window._lastShop);
    dlxFlashDates([date]);
  } catch {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    dlxFlashError(date, 'Kunde inte byta recept — prova igen.');
  } finally {
    _opBusy = false;
  }
};

window.dlxFreeDay = async function (date, btn) {
  if (_opBusy) return;
  _opBusy = true;
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  suppressEcho();
  try {
    const res = await fetch('/api/skip-day', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, action: 'free' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'fel');
    window._dlxExpanded = null;
    suppressEcho();
    rerender(data.weeklyPlan, data.shoppingList || window._lastShop);
    dlxFlashDates([date]);
  } catch {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    dlxFlashError(date, 'Kunde inte göra dagen fri — prova igen.');
  } finally {
    _opBusy = false;
  }
};

function dlxFlashError(date, msg) {
  const detail = document.querySelector(`#weekDeluxe .dlx-day[data-date="${date}"] .dlx-detail`);
  if (!detail) return;
  let el = detail.querySelector('.dlx-err');
  if (!el) { el = document.createElement('p'); el.className = 'dlx-err'; detail.appendChild(el); }
  el.textContent = msg;
}

// ── Byt dag (swap) ────────────────────────────────────────────────────────────
// State-driven: _dlxSwap = { from, pending } styr banner, mål-markeringar och
// nedtonade kort via renderDeluxe/modeCls — inga imperativa DOM-patchar som
// kan tappas vid re-render. _opBusy spärrar parallella åtgärder (dubbel-tryck
// eller två ändringar samtidigt = klassisk källa till trasiga planer).
let _opBusy = false;

// Eko-dämpning: våra egna skrivningar triggar realtime-events som annars
// orsakar en onödig full omhämtning sekunden efter (blinket). Svaret från
// API:t är redan sanningen — be realtime-lyssnaren ignorera ekot en stund.
function suppressEcho() {
  window._planMutateUntil = Date.now() + 4000;
}

// Kort glöd-markering på berörda dagar efter en lyckad åtgärd — kvitto för ögat.
function dlxFlashDates(dates) {
  requestAnimationFrame(() => {
    for (const date of dates) {
      document.querySelectorAll(`#weekDeluxe [data-date="${date}"]`).forEach(el => {
        el.classList.add('dlx-flash');
        setTimeout(() => el.classList.remove('dlx-flash'), 1400);
      });
    }
  });
}

window.dlxStartSwap = function (fromDate) {
  if (_opBusy) return;
  window._dlxMove = null;
  window._dlxSwap = { from: fromDate, pending: null };
  window._dlxExpanded = null;
  renderDeluxe();
};

window.dlxCancelSwap = function () {
  if (window._dlxSwap?.pending) return;   // mitt i en skrivning — låt den landa
  window._dlxSwap = null;
  renderDeluxe();
};

// Tomma dagar: i byt dag-läge = välj som mål; i flytta dag-läge = ignorera
// (bara släppzonerna gäller); annars = öppna egen planering.
window.dlxGapClick = function (date, dayName) {
  if (window._dlxSwap) { dlxPickSwapTarget(date); return; }
  if (window._dlxMove) return;
  window.dlxToggleDay(date);   // fäll ut DET klickade kortet inline (egen-planering-editorn)
};

// Egen planering / fri dag: förklara varför de inte går att byta (istället för
// att tyst öppna sina vanliga flöden mitt i ett byte).
window.dlxCustomClick = function (date, dayName) {
  if (window._dlxSwap) { window.showToast?.('Egen planering kan inte bytas — redigera dagen istället.', { type: 'info' }); return; }
  if (window._dlxMove) return;
  window.dlxToggleDay(date);   // fäll ut inline i stället för delade bottenpanelen
};
window.dlxFreeClick = function (date, dayName) {
  if (window._dlxSwap) { window.showToast?.('Fria dagar kan inte bytas — ångra fri dag först.', { type: 'info' }); return; }
  if (window._dlxMove) return;
  window.openBlockedDay(date, dayName);
};

// Avbryt pågående läge med Escape (mobil har Avbryt-knappen i bannern)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (window._dlxSwap && !window._dlxSwap.pending) window.dlxCancelSwap();
  if (window._dlxMove && !window._dlxMove.pending) window.dlxCancelMove();
});

// ── Flytta dag (kläm in mellan två dagar) ─────────────────────────────────────
// Källdagen lyfts ur och kläms in på vald position; mellanliggande recept
// roteras (datumen ligger fast). Släppzoner renderas mellan korten av
// renderDeluxe/renderDayList när _dlxMove är satt.

// Zon-kontext för pågående flytt: vilka "före"-datum som får en släppzon,
// och efter vilket kort slutzonen ("sist i planen") ligger.
function moveZoneCtx() {
  const from = window._dlxMove?.from;
  if (!from) return null;
  const todayIso = fmtIso(new Date());
  const movable = (window._lastPlan?.days || []).filter(d => !d.blocked && d.recipeId);
  const srcIdx = movable.findIndex(d => d.date === from);
  if (srcIdx === -1) return null;
  const successor = movable[srcIdx + 1]?.date || null;

  const set = new Set();
  for (const d of movable) {
    if (d.date < todayIso) continue;       // inga flytt till passerade positioner
    if (d.date === from) continue;         // zonen före källan = no-op
    if (d.date === successor) continue;    // zonen direkt efter källan = no-op
    set.add(d.date);
  }
  // Slutzon efter sista flyttbara dagen — utom när källan redan ligger sist
  const last = movable[movable.length - 1]?.date || null;
  const endAfter = (last && last !== from) ? last : null;
  return { set, endAfter };
}

function dropZone(before) {
  return `<button type="button" class="dlx-drop-zone" onclick="dlxPickMoveTarget('${before || ''}')">
    <span>${I.move} Flytta hit</span>
  </button>`;
}

window.dlxStartMove = function (fromDate) {
  if (_opBusy) return;
  window._dlxSwap = null;
  window._dlxMove = { from: fromDate, pending: null };
  window._dlxExpanded = null;
  renderDeluxe();
};

window.dlxCancelMove = function () {
  if (window._dlxMove?.pending) return;   // mitt i en skrivning — låt den landa
  window._dlxMove = null;
  renderDeluxe();
};

window.dlxPickMoveTarget = async function (before) {
  const move = window._dlxMove;
  if (!move || move.pending || _opBusy) return;
  const from = move.from;

  // Omedelbar feedback: banner växlar till "Flyttar dag…", källan får spinner
  _opBusy = true;
  move.pending = before || '__end__';
  renderDeluxe();
  suppressEcho();

  // Receptet som flyttas — för glöd-kvittot på landningsdagen efteråt
  const movedId = (window._lastPlan?.days || []).find(x => x.date === from)?.recipeId ?? null;

  try {
    const res = await fetch('/api/move-day', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: from, before: before || null }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'fel');
    window._dlxMove = null;
    suppressEcho();
    rerender(data.weeklyPlan, window._lastShop);
    const landed = movedId != null
      ? (data.weeklyPlan?.days || []).find(x => x.recipeId === movedId && x.date !== from)?.date
      : null;
    dlxFlashDates(landed ? [landed] : [from]);
  } catch (e) {
    move.pending = null;
    renderDeluxe();   // läget kvar — användaren kan välja en annan plats eller avbryta
    window.showToast?.(e.message?.length > 4 ? e.message : 'Kunde inte flytta dagen — prova igen.', { type: 'error' });
  } finally {
    _opBusy = false;
  }
};

async function dlxPickSwapTarget(toDate) {
  const swap = window._dlxSwap;
  if (!swap || swap.pending || _opBusy) return;
  if (toDate === swap.from) return;

  // Förvalidera mot tidslinjen — begripligt besked direkt, ingen server-tur
  const t = (window._timelineByDate || {})[toDate];
  if (t) {
    if (t.isArchive) { window.showToast?.('Arkiverade veckor är historik och kan inte ändras — bara dagar i aktuella matsedeln går att byta.', { type: 'info' }); return; }
    if (t.isCustom)  { window.showToast?.('Egen planering kan inte bytas — redigera dagen istället.', { type: 'info' }); return; }
    if (t.blocked)   { window.showToast?.('Fria dagar kan inte bytas — ångra fri dag först.', { type: 'info' }); return; }
    if (!t.recipeId && t.isPast) { window.showToast?.('Passerade tomma dagar kan inte väljas.', { type: 'info' }); return; }
  }

  // Omedelbar feedback: banner växlar till "Byter dag…", båda korten markeras
  _opBusy = true;
  swap.pending = toDate;
  renderDeluxe();
  suppressEcho();

  try {
    const res = await fetch('/api/swap-days', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date1: swap.from, date2: toDate }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'fel');
    window._dlxSwap = null;
    suppressEcho();
    rerender(data.weeklyPlan, data.shoppingList || window._lastShop);
    dlxFlashDates([swap.from, toDate]);
  } catch (e) {
    swap.pending = null;
    renderDeluxe();   // läget kvar — användaren kan välja ett annat mål eller avbryta
    window.showToast?.(e.message?.length > 4 ? e.message : 'Kunde inte byta dagarna — prova igen.', { type: 'error' });
  } finally {
    _opBusy = false;
  }
}

// ── Håll båda vyerna i synk ───────────────────────────────────────────────────
// Vi wrappar flera ingångar eftersom plan-viewer.js internt anropar sin LOKALA
// renderWeeklyPlanData (inte window.*), så det räcker inte att bara wrappa den.
// - renderWeeklyPlanData: genereringsväg + våra egna deluxe-åtgärder (window.*)
// - loadWeeklyPlan: första laddning (boot) + realtime-omladdning
// - switchTab: säkerhetsnät när man öppnar fliken Matsedeln
function wrapSync(name, { async = false } = {}) {
  const orig = window[name];
  if (typeof orig !== 'function' || orig.__dlxWrapped) return;
  let wrapped;
  if (async) {
    wrapped = async function (...args) {
      const r = await orig.apply(this, args);
      try { renderDeluxe(); } catch (e) { console.error('renderDeluxe', e); }
      return r;
    };
  } else {
    wrapped = function (...args) {
      const r = orig.apply(this, args);
      try { renderDeluxe(); } catch (e) { console.error('renderDeluxe', e); }
      return r;
    };
  }
  wrapped.__dlxWrapped = true;
  window[name] = wrapped;
}

function installHooks() {
  wrapSync('renderWeeklyPlanData');
  wrapSync('loadWeeklyPlan', { async: true });
  // switchTab: rendera bara när vi faktiskt landar på veckofliken.
  const origSwitch = window.switchTab;
  if (typeof origSwitch === 'function' && !origSwitch.__dlxWrapped) {
    const wrappedSwitch = function (tab) {
      const r = origSwitch.apply(this, arguments);
      if (tab === 'vecka') {
        try { renderDeluxe(); } catch (e) { console.error('renderDeluxe', e); }
        // switchTab scrollar till toppen — flytta ner till heron så att
        // historiken börjar ovanför skärmen (rAF: efter att layouten satt sig).
        requestAnimationFrame(() => snapToHero());
      }
      return r;
    };
    wrappedSwitch.__dlxWrapped = true;
    window.switchTab = wrappedSwitch;
  }
}

// Modulerna ovan importeras före denna → window.*-funktionerna finns redan.
installHooks();
// Säkerställ skal + läge så snart DOM finns.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { ensureScaffold(); });
} else {
  ensureScaffold();
}

window.renderDeluxe = renderDeluxe;
