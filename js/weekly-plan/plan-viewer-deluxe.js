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

  const dateLabel = `${d.day} ${d.dayNum} ${MONTH_NAMES_SHORT[d.month]}`;
  const expanded = window._dlxExpanded === d.date;

  let label, sub = '', click = `dlxToggleDay('${d.date}')`, kind = '', detail = '';
  if (d.recipeId && !d.isCustom) {
    const r = recipeById(d.recipeId);
    label = d.recipe || '';
    sub = [r?.time ? `${r.time} min` : null, r ? PROTEIN_LABEL[r.protein] : null].filter(Boolean).join(' · ');
    kind = 'recipe';
    if (expanded) detail = recipeDetail(d, r, { active: d.planId === 'active' });
  } else if (d.isCustom && d.customRecipeId) {
    const r = recipeById(d.customRecipeId);
    label = d.customRecipeTitle || '';
    sub = 'Egen planering';
    if (expanded) detail = recipeDetail({ ...d, recipeId: d.customRecipeId }, r, { active: false });
  } else if (d.isCustom && (d.customRecipeTitle || d.customNote)) {
    label = d.customRecipeTitle || d.customNote;
    sub = 'Egen planering';
    click = `openCustomDay('${d.date}', '${attr(d.day)}')`;
  } else if (d.blocked) {
    label = 'Fri dag';
    sub = 'Ingen middag planerad';
    click = `openBlockedDay('${d.date}', '${attr(d.day)}')`;
  } else {
    return '';
  }

  return `
    <article class="dlx-tonight${expanded ? ' expanded' : ''}" data-date="${d.date}"${kind ? ` data-kind="${kind}"` : ''}
             role="button" tabindex="0" onclick="${click}">
      <span class="dlx-tonight-eyebrow">${I.pot} Ikväll · ${esc(dateLabel)}</span>
      <span class="dlx-tonight-title">${esc(label)}</span>
      ${sub ? `<span class="dlx-tonight-sub">${esc(sub)}</span>` : ''}
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

  const savingStat = totalSaving >= 1 ? `
      <div class="dlx-stat dlx-stat-saving">
        <div class="dlx-stat-num">${I.coin}${fmtKr(totalSaving)}</div>
        <div class="dlx-stat-lbl">sparat mot normalpris</div>
      </div>` : '';

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
    <article class="dlx-day${opts.cls}${expanded ? ' expanded' : ''}" data-date="${d.date}"
             style="--rail:${color}" onclick="dlxToggleDay('${d.date}')">
      <span class="dlx-rail"></span>
      <div class="dlx-day-head">
        <div class="dlx-day-when">
          <span class="dlx-day-dow">${esc(d.day)}</span>
          <span class="dlx-day-date">${d.dayNum} ${MONTH_NAMES_SHORT[d.month]}</span>
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
        ${canMove && !d.isPast ? `<button class="dlx-act" onclick="event.stopPropagation();dlxFreeDay('${d.date}', this)">${I.free}<span>Fri dag — skjut planen</span></button>` : ''}
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
        <article class="dlx-day custom${expanded ? ' expanded' : ''}" data-date="${d.date}" style="--rail:${color}"
                 onclick="dlxToggleDay('${d.date}')">
          <span class="dlx-rail"></span>
          <div class="dlx-day-head">
            <div class="dlx-day-when"><span class="dlx-day-dow">${esc(d.day)}</span>
              <span class="dlx-day-date">${d.dayNum} ${MONTH_NAMES_SHORT[d.month]}</span>
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
    return `
      <article class="dlx-day custom slim" data-date="${d.date}" onclick="openCustomDay('${d.date}', '${attr(d.day)}')">
        <span class="dlx-rail" style="background:var(--birch)"></span>
        <div class="dlx-day-head">
          <div class="dlx-day-when"><span class="dlx-day-dow">${esc(d.day)}</span>
            <span class="dlx-day-date">${d.dayNum} ${MONTH_NAMES_SHORT[d.month]}</span>
            <span class="dlx-day-flags">${dayBadges(d)}</span></div>
          <div class="dlx-day-main">
            <span class="dlx-day-tag">${I.note} Egen planering</span>
            <p class="dlx-day-note">${d.customNote ? esc(d.customNote) : 'Tryck för att lägga till'}</p>
          </div>
          <span class="dlx-day-chev" aria-hidden="true">›</span>
        </div>
      </article>`;
  }

  if (d.blocked) {
    const click = `onclick="openBlockedDay('${d.date}', '${attr(d.day)}')"`;
    return `
      <article class="dlx-day free slim" data-date="${d.date}" ${click}>
        <span class="dlx-rail" style="background:var(--birch-soft)"></span>
        <div class="dlx-day-head">
          <div class="dlx-day-when"><span class="dlx-day-dow">${esc(d.day)}</span>
            <span class="dlx-day-date">${d.dayNum} ${MONTH_NAMES_SHORT[d.month]}</span>
            <span class="dlx-day-flags">${dayBadges(d)}</span></div>
          <div class="dlx-day-main"><p class="dlx-day-note">${I.free} Fri dag</p></div>
          <span class="dlx-day-chev" aria-hidden="true">›</span>
        </div>
      </article>`;
  }

  // Tom dag (gap) — bara framtida är klickbar
  const clickable = !d.isPast;
  const click = clickable ? `onclick="openCustomDay('${d.date}', '${attr(d.day)}')"` : '';
  return `
    <article class="dlx-day gap slim${clickable ? '' : ' inert'}" data-date="${d.date}" ${click}>
      <span class="dlx-rail" style="background:transparent"></span>
      <div class="dlx-day-head">
        <div class="dlx-day-when"><span class="dlx-day-dow">${esc(d.day)}</span>
          <span class="dlx-day-date">${d.dayNum} ${MONTH_NAMES_SHORT[d.month]}</span>
          <span class="dlx-day-flags">${dayBadges(d)}</span></div>
        <div class="dlx-day-main"><p class="dlx-day-note muted">${clickable ? '+ Planera dagen' : '—'}</p></div>
        ${clickable ? '<span class="dlx-day-chev" aria-hidden="true">›</span>' : ''}
      </div>
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
  // Helgdag (midsommar m.fl.) → chip-markering, så den aldrig trängs in i den
  // smala datumkolumnen. På gap-/fri-dag-kort ligger den till vänster i main och
  // åtgärden ("+ Planera dagen"/"Fri dag") högerställs (CSS) — på övriga kort
  // (recept/egen planering) ligger chippen strax före chevronen.
  if (d.holiday) {
    const chip = `<span class="dlx-day-holiday">${esc(d.holiday)}</span>`;
    if (!d.isCustom && !d.recipeId) {
      html = html.replace('<div class="dlx-day-main">', `<div class="dlx-day-main">${chip}`);
    } else if (html.includes('dlx-day-chev')) {
      html = html.replace('<span class="dlx-day-chev"', `${chip}<span class="dlx-day-chev"`);
    }
  }
  return html;
}

// Renderar en lista dagskort med en tunn "Vecka N"-avdelare där ISO-veckan byter.
// Ingen avdelare före första kortet — hero-rutan visar redan startveckan.
function renderDayList(days) {
  let html = '';
  let lastWeek = null;
  for (const d of days) {
    const wk = isoWeekNumber(d.date);
    if (lastWeek !== null && wk !== lastWeek) {
      html += `<div class="dlx-week-sep"><span>Vecka ${wk}</span></div>`;
    }
    lastWeek = wk;
    html += renderDayCard(d);
  }
  return html;
}

// ── Huvudrendering ────────────────────────────────────────────────────────────
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

  host.innerHTML = `${historyHtml}${hero}${tonight}<div class="dlx-days">${upcomingHtml}</div>`;

  // Engångspositionering vid första datarendering (täcker deep-link ?tab=vecka
  // vid boot). Senare omrenderingar (expandera/byta recept/realtime) får ALDRIG
  // rycka i scrollpositionen — flik- och lägesbyten hanteras i sina hooks.
  if (!window._dlxDidSnap && history.length && document.body.dataset.activeTab === 'vecka') {
    window._dlxDidSnap = true;
    requestAnimationFrame(() => snapToHero());
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
window.dlxToggleDay = function (date) {
  if (window._dlxSwap) { dlxPickSwapTarget(date); return; }
  window._dlxExpanded = (window._dlxExpanded === date) ? null : date;
  renderDeluxe();
  if (window._dlxExpanded === date) {
    requestAnimationFrame(() => {
      const el = document.querySelector(`#weekDeluxe [data-date="${date}"]`);
      if (el) {
        const hh = document.querySelector('header')?.offsetHeight || 0;
        const top = el.getBoundingClientRect().top + window.scrollY - hh - 12;
        if (window.smoothScrollTo) window.smoothScrollTo(top, 360);
        else window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  }
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
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  const day = window._lastPlan?.days?.find(d => d.date === date);
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
    rerender(window._lastPlan, data.shoppingList || window._lastShop);
  } catch {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    dlxFlashError(date, 'Kunde inte byta recept — prova igen.');
  }
};

window.dlxFreeDay = async function (date, btn) {
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  try {
    const res = await fetch('/api/skip-day', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, action: 'free' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'fel');
    window._dlxExpanded = null;
    rerender(data.weeklyPlan, data.shoppingList || window._lastShop);
  } catch {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    dlxFlashError(date, 'Kunde inte göra dagen fri — prova igen.');
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
window.dlxStartSwap = function (fromDate) {
  window._dlxSwap = { from: fromDate };
  window._dlxExpanded = null;
  renderDeluxe();
  const host = document.getElementById('weekDeluxe');
  if (host && !host.querySelector('.dlx-swap-banner')) {
    const banner = document.createElement('div');
    banner.className = 'dlx-swap-banner';
    banner.innerHTML = `<span>${I.swap} Välj dagen du vill byta med</span>
      <button onclick="dlxCancelSwap()">Avbryt</button>`;
    host.insertBefore(banner, host.querySelector('.dlx-days') || host.firstChild);
  }
  // Markera giltiga mål
  const todayIso = fmtIso(new Date());
  document.querySelectorAll('#weekDeluxe .dlx-day').forEach(c => {
    const d = c.dataset.date;
    if (!d || d === fromDate) return;
    if (c.classList.contains('is-archive') || c.classList.contains('custom') || c.classList.contains('inert')) return;
    if (c.classList.contains('gap') && d < todayIso) return;
    c.classList.add('dlx-swap-target');
  });
  const src = document.querySelector(`#weekDeluxe .dlx-day[data-date="${fromDate}"]`);
  if (src) src.classList.add('dlx-swap-source');
  // Ikväll-kortet ersätter dagens kort i listan → låt det delta i bytet
  const tn = document.querySelector('#weekDeluxe .dlx-tonight[data-kind="recipe"]');
  if (tn) tn.classList.add(tn.dataset.date === fromDate ? 'dlx-swap-source' : 'dlx-swap-target');
};

window.dlxCancelSwap = function () {
  window._dlxSwap = null;
  renderDeluxe();
};

async function dlxPickSwapTarget(toDate) {
  const from = window._dlxSwap?.from;
  window._dlxSwap = null;
  if (!from || from === toDate) { renderDeluxe(); return; }
  try {
    const res = await fetch('/api/swap-days', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date1: from, date2: toDate }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'fel');
    rerender(data.weeklyPlan, data.shoppingList || window._lastShop);
  } catch {
    renderDeluxe();
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
