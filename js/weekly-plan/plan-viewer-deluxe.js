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

import { fmtIso, fmtShort, PROTEIN_COLOR, isoWeekNumber, escapeHtml } from '../utils.js';

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
  // Markör för egen planering (ersätter texten "EGEN PLANERING") + plus för tom dag.
  own: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10a2 2 0 0 0-2.8-2.8L5 17v3z"/><path d="M13.5 6.5l4 4"/></svg>',
  // Rester/använd upp-dag (backlog #14): skål med ånga.
  leftovers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16a8 8 0 0 1-16 0z"/><path d="M9 8c0-1.4 1-1.6 1-3 M14 8c0-1.4 1-1.6 1-3"/></svg>',
  // Gaffel + kniv — "vi äter ute" i Ikväll-sheeten (backlog #15).
  fork: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v7c0 1 .7 2 2 2s2-1 2-2V3"/><path d="M7 3v18"/><path d="M17 3c-1.5 1-2.5 3.5-2.5 6 0 2 .8 3 2.5 3v9"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14 M5 12h14"/></svg>',
  // Historik (klocka med bakåtpil) + upp-chevron för att fälla ihop.
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 9a9 9 0 1 1-.6 5"/><path d="M3 4.5V9h4.5"/><path d="M12 8v4.5l3 1.8"/></svg>',
  chevUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
};

// esc = utils.escapeHtml (samma semantik) — en enda implementation i utils.
const esc = escapeHtml;

// "Rester/använd upp"-dag (backlog #14, lätta varianten): egna anteckningar vars
// text handlar om rester känns igen och får en egen markör — ren rendering,
// samma custom-day-data som förut. (Datan bevisar mönstret: familjen skriver
// redan "Rester"/"Kylskåpstömning" som noteringar.)
const RESTER_RE = /rester|kylskåpstömning|kylskåpständning|använd upp|tömma kylen/i;
function customNoteMark(note) {
  if (note && RESTER_RE.test(note)) {
    return `<span class="dlx-own dlx-own-leftovers" title="Rester/använd upp" aria-label="Rester/använd upp">${I.leftovers}</span>`;
  }
  return `<span class="dlx-own" title="Egen notering" aria-label="Egen notering">${I.own}</span>`;
}
function attr(s) { return String(s == null ? '' : s).replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

function fmtKr(value) {
  if (value == null) return '–';
  const r = Math.round(value);
  return `${r} kr`;
}

// ── Injektion av DOM-skal (körs en gång) ─────────────────────────────────────
let _injected = false;
function ensureScaffold() {
  if (_injected) return true;
  const content = document.getElementById('weekContent');
  if (!content) return false;

  // Premiumvyns container — placeras före bekräfta-rutan i weekContent.
  const host = document.createElement('div');
  host.id = 'weekDeluxe';
  const confirmWrap = document.getElementById('confirmPlanWrap');
  if (confirmWrap) confirmWrap.before(host);
  else content.appendChild(host);

  _injected = true;
  // Premium är enda vyn — klassiska tidslinjen avvecklad. body.week-deluxe styr
  // CSS:en som döljer den klassiska markupen och visar premiumvyn.
  document.body.classList.add('week-deluxe');
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
// ERSÄTTER dagens kort i listan (ingen dubblering): visar datum, öppnar
// snabbåtgärds-sheeten vid tryck och deltar i byt dag-flödet som vanliga kort.
function buildTonight(timeline) {
  const todayIso = fmtIso(new Date());
  const d = timeline.find(t => t.date === todayIso);
  if (!d) return '';

  // Markör-ikon för egen planering (ersätter undertexten): gryta = recept ur
  // receptboken, penna = egen notering.
  const recipeMark = `<span class="dlx-own dlx-own-recipe" title="Recept ur receptboken" aria-label="Recept ur receptboken">${I.pot}</span>`;
  const noteMark = customNoteMark(d.customNote);
  let label, sub = '', mark = '', kind = '', mkind = 'custom';
  if (d.recipeId && !d.isCustom) {
    const r = recipeById(d.recipeId);
    label = d.recipe || '';
    sub = [r?.time ? `${r.time} min` : null, r ? PROTEIN_LABEL[r.protein] : null].filter(Boolean).join(' · ');
    kind = 'recipe';
    mkind = 'recipe';
  } else if (d.isCustom && d.customRecipeId) {
    const r = recipeById(d.customRecipeId);
    label = d.customRecipeTitle || '';
    // Text-komplement till proteinfärgen (a11y — färg får inte bära ensam)
    sub = [r?.time ? `${r.time} min` : null, r ? PROTEIN_LABEL[r.protein] : null].filter(Boolean).join(' · ');
    mark = recipeMark;
  } else if (d.isCustom && (d.customRecipeTitle || d.customNote)) {
    label = d.customRecipeTitle || d.customNote;
    mark = noteMark;
  } else if (d.blocked) {
    label = 'Fri dag';
    sub = 'Ingen middag planerad';
    mkind = 'free';
  } else {
    return '';
  }

  return `
    <article class="dlx-tonight${modeCls(d, mkind)}" data-date="${d.date}"${kind ? ` data-kind="${kind}"` : ''}
             role="button" tabindex="0" onclick="dlxDayClick('${d.date}', '${attr(d.day)}')"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();dlxDayClick('${d.date}', '${attr(d.day)}')}">
      <span class="dlx-tonight-eyebrow">${I.pot} Ikväll</span>
      <div class="dlx-tonight-head">
        <div class="dlx-day-when">
          <span class="dlx-day-dow">${esc(d.day)}</span>
          <span class="dlx-day-date"><span class="dlx-day-num">${d.dayNum}</span><span class="dlx-day-mon">${MONTH_NAMES_SHORT[d.month]}</span></span>
        </div>
        <div class="dlx-tonight-main">
          <span class="dlx-tonight-title">${mark}${esc(label)}</span>
          ${sub ? `<span class="dlx-tonight-sub">${esc(sub)}</span>` : ''}
        </div>
      </div>
      <span class="dlx-tonight-chev" aria-hidden="true">›</span>
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
    kind === 'custom' ? !d.isArchive :      // egen planering = bytbar (byter datum)
    kind === 'gap'    ? !d.isPast :
    false;                                  // fri dag kan aldrig bytas
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

  const savingPill = (d.saving && d.saving >= 10) ? (
    d.savingMatches?.length
      ? `<button type="button" class="dlx-saving has-details" onclick="event.stopPropagation();openSavingPopover('${d.date}')">${I.coin}${d.saving} kr</button>`
      : `<span class="dlx-saving">${I.coin}${d.saving} kr</span>`
  ) : '';

  const metaParts = [];
  if (protLabel) metaParts.push(`<span class="dlx-chip" style="--chip:${color}">${esc(protLabel)}</span>`);
  if (time) metaParts.push(`<span class="dlx-meta-time">${I.clock}${time}</span>`);

  return `
    <article class="dlx-day${opts.cls}${modeCls(d, 'recipe')}" data-date="${d.date}"
             style="--rail:${color}" onclick="dlxDayClick('${d.date}', '${attr(d.day)}')">
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
    </article>`;
}

function emptyDayCard(d) {
  // Gap, fri dag, eller tom custom-dag — alla öppnar sheeten vid tryck.
  if (d.isCustom) {
    if (d.customRecipeId) {
      const r = recipeById(d.customRecipeId);
      const color = r ? (PROTEIN_COLOR[r.protein] || 'var(--lichen)') : 'var(--lichen)';
      // Text-komplement till proteinfärgen (a11y) — samma chips som recipeDayCard
      const metaParts = [];
      if (r) metaParts.push(`<span class="dlx-chip" style="--chip:${color}">${esc(PROTEIN_LABEL[r.protein] || r.protein)}</span>`);
      if (r?.time) metaParts.push(`<span class="dlx-meta-time">${I.clock}${r.time} min</span>`);
      return `
        <article class="dlx-day custom${modeCls(d, 'custom')}" data-date="${d.date}" style="--rail:${color}"
                 onclick="dlxDayClick('${d.date}', '${attr(d.day)}')">
          <span class="dlx-rail"></span>
          <div class="dlx-day-head">
            <div class="dlx-day-when"><span class="dlx-day-dow">${esc(d.day)}</span>
              <span class="dlx-day-date"><span class="dlx-day-num">${d.dayNum}</span><span class="dlx-day-mon">${MONTH_NAMES_SHORT[d.month]}</span></span>
              <span class="dlx-day-flags">${dayBadges(d)}</span></div>
            <div class="dlx-day-main">
              <h3 class="dlx-day-recipe"><span class="dlx-own dlx-own-recipe" title="Recept ur receptboken" aria-label="Recept ur receptboken">${I.pot}</span>${esc(d.customRecipeTitle || '')}</h3>
              ${metaParts.length ? `<div class="dlx-day-meta">${metaParts.join('')}</div>` : ''}
            </div>
            <span class="dlx-day-chev" aria-hidden="true">›</span>
          </div>
        </article>`;
    }
    return `
      <article class="dlx-day custom slim${modeCls(d, 'custom')}" data-date="${d.date}" onclick="dlxDayClick('${d.date}', '${attr(d.day)}')">
        <span class="dlx-rail" style="background:var(--birch)"></span>
        <div class="dlx-day-head">
          <div class="dlx-day-when"><span class="dlx-day-dow">${esc(d.day)}</span>
            <span class="dlx-day-date"><span class="dlx-day-num">${d.dayNum}</span><span class="dlx-day-mon">${MONTH_NAMES_SHORT[d.month]}</span></span>
            <span class="dlx-day-flags">${dayBadges(d)}</span></div>
          <div class="dlx-day-main">
            <h3 class="dlx-day-recipe">${customNoteMark(d.customNote)}${d.customNote ? esc(d.customNote) : 'Lägg till en notering'}</h3>
          </div>
          <span class="dlx-day-chev" aria-hidden="true">›</span>
        </div>
      </article>`;
  }

  if (d.blocked) {
    return `
      <article class="dlx-day free slim${modeCls(d, 'free')}" data-date="${d.date}" onclick="dlxDayClick('${d.date}', '${attr(d.day)}')">
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

  // Tom dag (gap) — bara framtida är klickbar. dlxDayClick routar: i byt
  // dag-läge väljs dagen som mål (receptet flyttas dit), annars öppnas
  // sheeten med egen-planering-editorn.
  const clickable = !d.isPast;
  const click = clickable ? `onclick="dlxDayClick('${d.date}', '${attr(d.day)}')"` : '';
  return `
    <article class="dlx-day gap slim${clickable ? '' : ' inert'}${modeCls(d, 'gap')}" data-date="${d.date}" ${click}>
      <span class="dlx-rail" style="background:transparent"></span>
      <div class="dlx-day-head">
        <div class="dlx-day-when"><span class="dlx-day-dow">${esc(d.day)}</span>
          <span class="dlx-day-date"><span class="dlx-day-num">${d.dayNum}</span><span class="dlx-day-mon">${MONTH_NAMES_SHORT[d.month]}</span></span>
          <span class="dlx-day-flags">${dayBadges(d)}</span></div>
        <div class="dlx-day-main"><p class="dlx-day-note muted">${clickable ? `<span class="dlx-add" title="Planera dagen" aria-label="Planera dagen">${I.plus}</span>` : '—'}</p></div>
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
      <span>${busy ? `${I.swap} Byter dag…` : `${I.swap} Välj dagen att byta med — recept, egen planering eller tom dag`}</span>
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

  // Tidigare recept ligger INTE i flödet by default — sidan vilar på rubriken +
  // heron. En "forcerad uppåtscroll" (pull i toppen, se touch/wheel-lyssnarna)
  // armar en knapp (_dlxHistoryArmed); knappen fäller ut historiken som ett
  // dragspel NEDÅT (_dlxHistoryOpen) ovanför heron — utfällning nedåt vid toppen
  // ger ingen scroll-ryckning.
  window._dlxHasHistory = history.length > 0;
  if (!history.length) { window._dlxHistoryArmed = false; window._dlxHistoryOpen = false; }
  const showZone = history.length && (window._dlxHistoryArmed || window._dlxHistoryOpen);
  const open = !!window._dlxHistoryOpen;
  // A11y (backlog #22): gesten (pull/hjul i toppen) kräver touch/mus — en diskret
  // alltid-synlig knapp ger tangentbord och alla andra samma väg in.
  const historyHtml = showZone
    ? `<div class="dlx-history-zone">
         <button type="button" class="dlx-history-btn${open ? ' open' : ''}" onclick="dlxToggleHistory()">
           ${open ? I.chevUp : I.history}<span>${open ? 'Dölj tidigare recept' : 'Visa tidigare recept'}</span>
         </button>
         ${open ? `<div class="dlx-history-flow">${renderDayList(history)}</div>` : ''}
       </div>`
    : (history.length
        ? `<button type="button" class="dlx-history-peek" onclick="dlxOpenHistory()">${I.history}<span>Tidigare recept</span></button>`
        : '');

  // Släppzon för "kläm in före ikväll" — Ikväll-kortet ligger utanför dagslistan
  const tonightZone = (tonight && moveZoneCtx()?.set.has(todayIso)) ? dropZone(todayIso) : '';

  // Ordningen i Matsedeln är åter history/hero/banner/today/days — svaret "vad
  // blir det ikväll?" bor numera i egna Idag-fliken (today-view.js), så Matsedeln
  // behåller sin veckoöversikt med heron överst. Ikväll-kortet är kvar (egen
  // presentation, ingen dubblering).
  setSec(host, 'history', historyHtml);
  setSec(host, 'hero', hero);
  setSec(host, 'banner', modeBannerHtml());
  setSec(host, 'today', `${tonightZone}${tonight}`);
  setSec(host, 'days', `<div class="dlx-days">${upcomingHtml}</div>`);
}

// ── Tidigare recept: pull-to-reveal-knapp + dragspel ──────────────────────────
// Sidan vilar på rubrik + hero. Forcerad uppåtscroll i toppen (rubber-band på
// touch, hjul-upp på desktop) "armar" knappen; knappen fäller ut historiken.
window.dlxToggleHistory = function () {
  window._dlxHistoryOpen = !window._dlxHistoryOpen;
  if (!window._dlxHistoryOpen) window._dlxHistoryArmed = false;   // stäng → göm knappen
  renderDeluxe();
};

// Synligt alternativ till gesten (a11y, backlog #22): öppna historiken direkt.
window.dlxOpenHistory = function () {
  window._dlxHistoryArmed = true;
  window._dlxHistoryOpen = true;
  renderDeluxe();
};

function armHistory() {
  if (!window._dlxHasHistory || window._dlxHistoryArmed || window._dlxHistoryOpen) return;
  if (document.body.dataset.activeTab !== 'vecka') return;
  window._dlxHistoryArmed = true;
  renderDeluxe();
}

// Touch: pull nedåt (~64 px) medan man redan är i toppen → arma på touchend
// (committas vid släpp så layouten inte rycker mitt i gesten).
let _pullStartY = null, _pullMax = 0;
document.addEventListener('touchstart', (e) => {
  _pullStartY = (window.scrollY <= 2 && document.body.dataset.activeTab === 'vecka')
    ? e.touches[0].clientY : null;
  _pullMax = 0;
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (_pullStartY != null) _pullMax = Math.max(_pullMax, e.touches[0].clientY - _pullStartY);
}, { passive: true });
document.addEventListener('touchend', () => {
  if (_pullStartY != null && _pullMax > 64 && window.scrollY <= 2) armHistory();
  _pullStartY = null; _pullMax = 0;
}, { passive: true });

// Desktop: hjul-upp medan man är i toppen.
let _wheelAccum = 0;
document.addEventListener('wheel', (e) => {
  if (window.scrollY <= 2 && e.deltaY < 0) {
    _wheelAccum += -e.deltaY;
    if (_wheelAccum > 120) { _wheelAccum = 0; armHistory(); }
  } else _wheelAccum = 0;
}, { passive: true });

// Armad men ej öppnad: scrollar man ner igen göms knappen.
window.addEventListener('scroll', () => {
  if (window._dlxHistoryArmed && !window._dlxHistoryOpen && window.scrollY > 40) {
    window._dlxHistoryArmed = false;
    renderDeluxe();
  }
}, { passive: true });

// ── Interaktion ───────────────────────────────────────────────────────────────
// All daginteraktion går via snabbåtgärds-sheeten (dlxDayClick, definierad i
// sheet-sektionen nedan) — inga inline-utfällningar som knuffar layouten.

function weekRecipeIds() {
  return (window._lastPlan?.days || []).map(d => d.recipeId).filter(id => id != null);
}

function rerender(plan, shop) {
  window.renderWeeklyPlanData(plan, shop, false, window._planArchive, window._customDays);
  if (shop && window.renderShoppingData) window.renderShoppingData(shop);
}

window.dlxShuffle = async function (date, btn) {
  if (window._opBusy) return;
  window._opBusy = true;
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
    window.updateLastPlanDay(date, data.recipeId, data.recipe);
    suppressEcho();
    rerender(window._lastPlan, data.shoppingList || window._lastShop);
    dlxFlashDates([date]);
  } catch {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    dlxFlashError(date, 'Kunde inte byta recept — prova igen.');
  } finally {
    window._opBusy = false;
  }
};

window.dlxFreeDay = async function (date, btn) {
  if (window._opBusy) return;
  window._opBusy = true;
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  suppressEcho();
  try {
    const res = await fetch('/api/skip-day', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, action: 'free' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'fel');
    suppressEcho();
    rerender(data.weeklyPlan, data.shoppingList || window._lastShop);
    dlxFlashDates([date]);
    return true;   // sheeten (#15) toastar sitt eget kvitto vid lyckat resultat
  } catch {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    dlxFlashError(date, 'Kunde inte göra dagen fri — prova igen.');
    return false;
  } finally {
    window._opBusy = false;
  }
};

function dlxFlashError(date, msg) {
  // [data-date] (inte .dlx-day) så även Ikväll-kortet träffas; utan utfälld
  // detalj (t.ex. åtgärd från sheeten) faller felet tillbaka på en toast.
  const detail = document.querySelector(`#weekDeluxe [data-date="${date}"] .dlx-detail`);
  if (!detail) { window.showToast?.(msg, { type: 'error' }); return; }
  let el = detail.querySelector('.dlx-err');
  if (!el) { el = document.createElement('p'); el.className = 'dlx-err'; detail.appendChild(el); }
  el.textContent = msg;
}

// ── Byt dag (swap) ────────────────────────────────────────────────────────────
// State-driven: _dlxSwap = { from, pending } styr banner, mål-markeringar och
// nedtonade kort via renderDeluxe/modeCls — inga imperativa DOM-patchar som
// kan tappas vid re-render. window._opBusy spärrar parallella åtgärder (dubbel-tryck
// eller två ändringar samtidigt = klassisk källa till trasiga planer).
// Bor på window (state.js) så custom-days-vägen i plan-viewer.js delar
// samma spärr (backlog #10) — inte två oberoende guards som kan korsa varandra.

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
  if (window._opBusy) return;
  window._dlxMove = null;
  window._dlxSwap = { from: fromDate, pending: null };
  renderDeluxe();
};

window.dlxCancelSwap = function () {
  if (window._dlxSwap?.pending) return;   // mitt i en skrivning — låt den landa
  window._dlxSwap = null;
  renderDeluxe();
};

// Avbryt pågående läge med Escape (mobil har Avbryt-knappen i bannern)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (window._dlxSheet) { window.dlxCloseSheet(); return; }
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
  if (window._opBusy) return;
  window._dlxSwap = null;
  window._dlxMove = { from: fromDate, pending: null };
  renderDeluxe();
};

window.dlxCancelMove = function () {
  if (window._dlxMove?.pending) return;   // mitt i en skrivning — låt den landa
  window._dlxMove = null;
  renderDeluxe();
};

window.dlxPickMoveTarget = async function (before) {
  const move = window._dlxMove;
  if (!move || move.pending || window._opBusy) return;
  const from = move.from;

  // Omedelbar feedback: banner växlar till "Flyttar dag…", källan får spinner
  window._opBusy = true;
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
    window._opBusy = false;
  }
};

async function dlxPickSwapTarget(toDate) {
  const swap = window._dlxSwap;
  if (!swap || swap.pending || window._opBusy) return;
  if (toDate === swap.from) return;

  // Förvalidera mot tidslinjen — begripligt besked direkt, ingen server-tur
  const t = (window._timelineByDate || {})[toDate];
  if (t) {
    if (t.isArchive) { window.showToast?.('Arkiverade veckor är historik och kan inte ändras — bara dagar i aktuella matsedeln går att byta.', { type: 'info' }); return; }
    if (t.blocked)   { window.showToast?.('Fria dagar kan inte bytas — ångra fri dag först.', { type: 'info' }); return; }
    if (!t.recipeId && !t.isCustom && t.isPast) { window.showToast?.('Passerade tomma dagar kan inte väljas.', { type: 'info' }); return; }
  }

  // Omedelbar feedback: banner växlar till "Byter dag…", båda korten markeras
  window._opBusy = true;
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
    // Egna anteckningar kan ha bytt datum → spegla det innan re-render.
    if (data.customDays) window._customDays = data.customDays;
    rerender(data.weeklyPlan || window._lastPlan, data.shoppingList || window._lastShop);
    dlxFlashDates([swap.from, toDate]);
  } catch (e) {
    swap.pending = null;
    renderDeluxe();   // läget kvar — användaren kan välja ett annat mål eller avbryta
    window.showToast?.(e.message?.length > 4 ? e.message : 'Kunde inte byta dagarna — prova igen.', { type: 'error' });
  } finally {
    window._opBusy = false;
  }
}

// ── Dag-sheeten (backlog #15, variant B — universellt interaktionsmönster) ───
// Bottensheet som är ENDA vägen in i daginteraktionen: alla dagkort (recept,
// egen planering, fri dag, tom dag, arkiv) öppnar sheeten vid tryck — inga
// inline-utfällningar som knuffar layouten. Ren INRAMNING — all mutations-
// logik återanvänds från befintliga, säkra flöden:
//   Byt middag      → swap-days (byt plats, ok även på bekräftad plan) eller
//                     replace-recipe (slumpa/välj själv, bara obekräftad plan)
//   Äter ute/rester/fri dag → skip-day 'free' ("skjut planen →", receptet
//                     sparas, inköpslistan rörs aldrig) + Ångra via unfreeDay
//   Byt/Flytta dag  → befintliga swap-/move-lägena (banner + mål-markering)
//   Editorer        → customDayEditorHtml/blockedDayEditorHtml renderas i
//                     sheeten; deras spara-flöden stänger den via dlxCloseSheet
//   Lägg till       → addManualItem (delade inköpslistan, kategori Övrigt)

let _sheetAdded = [];   // varor tillagda i denna sheet-session (kvitto-chips)

function ensureSheetHost() {
  if (document.getElementById('dlxSheet')) return;
  const back = document.createElement('div');
  back.id = 'dlxSheetBackdrop';
  back.className = 'dlx-sheet-backdrop';
  back.addEventListener('click', () => window.dlxCloseSheet());
  const sheet = document.createElement('div');
  sheet.id = 'dlxSheet';
  sheet.className = 'dlx-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Dagens åtgärder');
  document.body.appendChild(back);
  document.body.appendChild(sheet);
}

// Universell klick-router för ALLA dagkort: i byt dag-läge väljs dagen som mål
// (dlxPickSwapTarget förvaliderar med begripliga besked), i flytta-läge är bara
// släppzonerna klickbara — annars öppnas sheeten för dagen.
window.dlxDayClick = function (date, dayName) {
  if (window._dlxSwap) { dlxPickSwapTarget(date); return; }
  if (window._dlxMove) return;
  openDaySheet(date, dayName);
};

function openDaySheet(date, day) {
  const d = (window._timelineByDate || {})[date];
  if (!d) return;
  ensureSheetHost();
  _sheetAdded = [];
  // Startvy per dagtyp: receptdagar → meny (arkiv direkt till läsläget),
  // egen planering med recept → meny, övriga (notering/fri/tom) → editorn.
  let view;
  if ((d.recipeId && !d.isCustom) || (d.isCustom && d.customRecipeId)) {
    view = d.isArchive ? 'recept' : 'meny';
  } else if (d.isCustom || d.blocked || !d.isPast) {
    view = 'editor';
  } else {
    return;   // passerad tom dag — inget att göra
  }
  window._dlxSheet = { date, day, view };
  renderSheet();
  requestAnimationFrame(() => {
    document.getElementById('dlxSheetBackdrop')?.classList.add('open');
    document.getElementById('dlxSheet')?.classList.add('open');
  });
}

window.dlxCloseSheet = function () {
  window._dlxSheet = null;
  document.getElementById('dlxSheetBackdrop')?.classList.remove('open');
  document.getElementById('dlxSheet')?.classList.remove('open');
};

function sheetRow(onclick, iconCls, icon, title, subText) {
  return `<button type="button" class="dlx-sheet-row" onclick="${onclick}">
      <span class="dlx-sheet-ic${iconCls ? ' ' + iconCls : ''}">${icon}</span>
      <span class="dlx-sheet-txt"><span class="dlx-sheet-t">${title}</span><span class="dlx-sheet-d">${subText}</span></span>
    </button>`;
}

// Rubrikrad för dagen ("Ikväll · 3 juli" / "Lördag · 4 juli")
function sheetWhen(d) {
  return `${d.isToday ? 'Ikväll' : esc(d.day)} · ${d.dayNum} ${MONTH_NAMES_SHORT[d.month]}`;
}

// Receptdetalj i sheeten (ersätter den gamla inline-utfällningen). Läsvänlig,
// scrollar i sheeten; åtgärderna bor i meny-vyn.
function sheetRecipeHtml(d) {
  const rid = d.isCustom ? d.customRecipeId : d.recipeId;
  const title = d.isCustom ? d.customRecipeTitle : d.recipe;
  const r = recipeById(rid);
  const backClick = d.isArchive ? 'dlxCloseSheet()' : "dlxSheetView('meny')";
  const back = `<button type="button" class="dlx-sheet-back" onclick="${backClick}">‹ ${d.isArchive ? 'Stäng' : 'Tillbaka'}</button>`;
  if (!r) {
    return `${back}
      <p class="dlx-sheet-title">${esc(title || 'Recept')}</p>
      <p class="dlx-sheet-empty">Receptet finns inte längre i receptboken.</p>
      <button class="dlx-mini-btn" onclick="dlxCloseSheet();jumpToRecipe('${attr(title)}')">Sök i receptboken</button>`;
  }
  const ings = (r.ingredients || []).map(i => `<li>${esc(i)}</li>`).join('');
  const steps = (r.instructions || []).map((st, i) =>
    `<li><span class="dlx-step-num">${i + 1}</span><span>${esc(st)}</span></li>`).join('');
  const notes = r.notes ? `<div class="dlx-notes">💡 ${esc(r.notes)}</div>` : '';
  return `${back}
    <p class="dlx-sheet-sub">${sheetWhen(d)}${d.isArchive ? ' · 📜 Historisk plan — bara för referens' : ''}</p>
    <p class="dlx-sheet-title">${esc(r.title)}</p>
    <div class="dlx-detail-head">
      <span class="dlx-status ${r.tested ? 'tested' : 'untested'}">${r.tested ? '✓ Provat' : 'Ej provat'}</span>
      <span class="dlx-detail-portions">${r.servings} portioner</span>
      <button type="button" class="dlx-cook-btn" onclick="dlxCloseSheet();openCookMode(${r.id})">${I.pot}<span>Börja laga</span></button>
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
    ${notes}`;
}

// Meny-vyn: dagens åtgärder — raduppsättningen följer samma regler som den
// gamla kortutfällningen (canReplace/canMove/isPast), plus Ikväll-extran.
function sheetMenuHtml(d, s) {
  const isCustomRecipe = d.isCustom && d.customRecipeId;
  const r = recipeById(isCustomRecipe ? d.customRecipeId : d.recipeId);
  const title = isCustomRecipe ? d.customRecipeTitle : d.recipe;
  const sub = [r?.time ? `${r.time} min` : null, r ? PROTEIN_LABEL[r.protein] : null].filter(Boolean).join(' · ');

  let rows = sheetRow("dlxSheetView('recept')", '', I.pot, 'Visa receptet', 'Ingredienser och steg — börja laga');

  if (isCustomRecipe) {
    // Egen planering med recept: redigera (byt recept/notering) + byt dag
    rows += sheetRow("dlxSheetView('editor')", '', I.pencil, 'Redigera dagen', 'Byt recept, skriv notering eller ta bort');
    if (!d.isArchive) rows += sheetRow('dlxSheetStartSwap()', '', I.swap, 'Byt dag', 'Låt dagen byta plats med en annan dag');
  } else {
    const active = d.planId === 'active' && !d.isArchive;
    const canReplace = active && !window.planConfirmed;
    const targets = sheetSwapTargets(s.date);
    if (canReplace || targets.length) {
      rows += sheetRow("dlxSheetView('byt')", 'rust', I.shuffle, 'Byt middag',
        canReplace ? 'Ta en annan dag i veckan — eller ett nytt recept' : 'Ta en annan dag i veckan — listan påverkas inte');
    }
    if (active) {
      rows += sheetRow('dlxSheetStartSwap()', '', I.swap, 'Byt dag', 'Låt dagen byta plats med en annan dag');
      if (!d.isPast) {
        rows += sheetRow('dlxSheetStartMove()', '', I.move, 'Flytta dag', 'Kläm in dagen mellan två andra dagar');
        if (d.isToday) {
          rows += sheetRow("dlxSheetFree('ute')", '', I.fork, 'Vi äter ute', 'Ingen matlagning — receptet sparas till senare');
          rows += sheetRow("dlxSheetFree('rester')", 'ochre', I.leftovers, 'Rester ikväll', 'Töm kylskåpet — receptet sparas till senare');
        } else {
          rows += sheetRow("dlxSheetFree('fri')", '', I.free, 'Fri dag — skjut planen', 'Ingen middag den här dagen — receptet sparas till senare');
        }
      }
    }
  }
  if (d.isToday) {
    rows += sheetRow("dlxSheetView('lista')", '', I.plus, 'Lägg till på listan', 'Något som saknas hemma?');
  }

  return `
    <p class="dlx-sheet-sub">${sheetWhen(d)}${sub ? ` · ${esc(sub)}` : ''}</p>
    <p class="dlx-sheet-title">${d.isToday ? `${I.pot}<span>` : '<span>'}${esc(title || '')}</span></p>
    ${rows}`;
}

function sheetSwapTargets(fromDate) {
  const todayIso = fmtIso(new Date());
  return (window._lastPlan?.days || []).filter(x =>
    x.recipeId && !x.blocked && x.date !== fromDate && x.date >= todayIso);
}

function renderSheet() {
  const s = window._dlxSheet;
  const el = document.getElementById('dlxSheet');
  if (!s || !el) return;
  const d = (window._timelineByDate || {})[s.date];
  if (!d) { window.dlxCloseSheet(); return; }
  let body = '';

  if (s.view === 'meny') {
    body = sheetMenuHtml(d, s);
  } else if (s.view === 'recept') {
    body = sheetRecipeHtml(d);
  } else if (s.view === 'byt') {
    const active = d.planId === 'active' && !d.isArchive;
    const canReplace = active && !window.planConfirmed;
    const targets = sheetSwapTargets(s.date);
    const withWhom = d.isToday ? 'ikväll' : `den ${d.dayNum} ${MONTH_NAMES_SHORT[d.month]}`;
    let rows = '';
    if (canReplace) {
      rows += sheetRow('dlxSheetShuffle()', 'rust', I.shuffle, 'Slumpa nytt recept', 'Appen väljer — de senaste veckornas rätter undviks');
      rows += sheetRow('dlxSheetPick()', '', I.pencil, 'Välj själv i receptboken', 'Bläddra bland alla recept');
    }
    if (targets.length) {
      rows += `<p class="dlx-sheet-cap">${canReplace ? 'Eller ta en annan dags middag' : 'Ta en annan dags middag — inköpslistan påverkas inte'}</p>`;
      rows += targets.map(t => {
        const tl = (window._timelineByDate || {})[t.date];
        const when = tl ? `${tl.day} ${tl.dayNum} ${MONTH_NAMES_SHORT[tl.month]}` : t.date;
        return sheetRow(`dlxSheetSwap('${t.date}')`, '', I.swap, esc(t.recipe || ''), `${esc(when)} · byter plats med ${withWhom}`);
      }).join('');
    }
    if (!rows) rows = `<p class="dlx-sheet-empty">Matsedeln är bekräftad och har inga fler receptdagar att byta med.</p>`;
    body = `
      <button type="button" class="dlx-sheet-back" onclick="dlxSheetView('meny')">‹ Tillbaka</button>
      <p class="dlx-sheet-title">Byt middag</p>
      ${rows}`;
  } else if (s.view === 'editor') {
    // Egen planering-/fri dag-/tom dag-editorn — samma editor-HTML som förut,
    // nu i sheeten. Spara-flödena i plan-viewer.js stänger sheeten vid lyckat
    // resultat (dlxCloseSheet-anrop i success-vägarna).
    const isCustomRecipe = d.isCustom && d.customRecipeId;
    const inner = (d.blocked && !d.isCustom)
      ? window.blockedDayEditorHtml(d.date, d.day)
      : window.customDayEditorHtml(d.date, d.day);
    const backBtn = isCustomRecipe
      ? `<button type="button" class="dlx-sheet-back" onclick="dlxSheetView('meny')">‹ Tillbaka</button>`
      : '';
    const swapBtn = (d.isCustom && !isCustomRecipe && d.customNote && !d.isArchive)
      ? `<div class="dlx-actions"><button class="dlx-act" onclick="dlxSheetStartSwap()">${I.swap}<span>Byt dag</span></button></div>`
      : '';
    body = `${backBtn}<div class="dlx-sheet-editor">${inner}</div>${swapBtn}`;
  } else if (s.view === 'lista') {
    const chips = _sheetAdded.length
      ? `<div class="dlx-sheet-added">${_sheetAdded.map(x => `<span>${esc(x)}</span>`).join('')}</div>`
      : '';
    body = `
      <button type="button" class="dlx-sheet-back" onclick="dlxSheetView('meny')">‹ Tillbaka</button>
      <p class="dlx-sheet-title">Lägg till på listan</p>
      <p class="dlx-sheet-sub">Varan hamnar under Övrigt i den delade inköpslistan.</p>
      <div class="dlx-sheet-addrow">
        <input type="text" id="dlxSheetItemInput" class="custom-note-input" maxlength="80"
               placeholder="T.ex. mjölk, bananer…"
               onkeydown="if(event.key==='Enter'){event.preventDefault();dlxSheetAdd()}">
        <button type="button" id="dlxSheetItemBtn" class="dlx-sheet-addbtn" onclick="dlxSheetAdd()">Lägg till</button>
      </div>
      ${chips}`;
  }

  el.innerHTML = `<div class="dlx-sheet-grip" aria-hidden="true"></div>${body}`;
}

window.dlxSheetView = function (view) {
  if (!window._dlxSheet) return;
  window._dlxSheet.view = view;
  renderSheet();
  if (view === 'lista') document.getElementById('dlxSheetItemInput')?.focus();
};

// Byt dag / Flytta dag — stäng sheeten och gå in i befintligt läge (banner +
// mål-markeringar). Samma flöden som förut, bara ny ingång.
window.dlxSheetStartSwap = function () {
  const s = window._dlxSheet;
  if (!s) return;
  window.dlxCloseSheet();
  window.dlxStartSwap(s.date);
};

window.dlxSheetStartMove = function () {
  const s = window._dlxSheet;
  if (!s) return;
  window.dlxCloseSheet();
  window.dlxStartMove(s.date);
};

window.dlxSheetShuffle = function () {
  const s = window._dlxSheet;
  if (!s) return;
  window.dlxCloseSheet();
  window.dlxShuffle(s.date, null);
};

window.dlxSheetPick = function () {
  const s = window._dlxSheet;
  if (!s) return;
  window.dlxCloseSheet();
  window.enterReplaceMode(s.date, s.day);
};

// Byt plats med en annan receptdag — samma väg som "Byt dag"-flödet, men målet
// är redan valt så swap-läget aldrig syns. Vid fel städas läget (toast visas
// av dlxPickSwapTarget) så användaren inte lämnas i ett oväntat byt dag-läge.
window.dlxSheetSwap = async function (toDate) {
  const s = window._dlxSheet;
  if (!s || window._opBusy) return;
  window.dlxCloseSheet();
  window._dlxMove = null;
  window._dlxSwap = { from: s.date, pending: null };
  await dlxPickSwapTarget(toDate);
  if (!window._dlxSwap) {
    window.showToast?.('Middagarna har bytt plats.', { type: 'success' });
  } else if (!window._dlxSwap.pending) {
    window._dlxSwap = null;
    renderDeluxe();
  }
};

// Vi äter ute / Rester ikväll / Fri dag → skip-day free ("skjut planen →"):
// receptet flyttas till slutet av matsedeln, inköpslistan rörs inte.
// Ångra-knapp i kvitto-toasten.
window.dlxSheetFree = async function (kind) {
  const s = window._dlxSheet;
  if (!s || window._opBusy) return;
  const recipeTitle = (window._lastPlan?.days || []).find(x => x.date === s.date)?.recipe || 'Receptet';
  window.dlxCloseSheet();
  const ok = await window.dlxFreeDay(s.date, null);
  if (ok) {
    const msg = kind === 'rester'
      ? `Rester ikväll — ${recipeTitle} flyttas till slutet av matsedeln.`
      : kind === 'ute'
        ? `Ni äter ute ikväll — ${recipeTitle} flyttas till slutet av matsedeln.`
        : `Dagen är fri — ${recipeTitle} flyttas till slutet av matsedeln.`;
    window.showToast?.(msg, { type: 'success', action: { label: 'Ångra', onClick: () => window.unfreeDay(s.date) } });
  }
};

// Lägg till på listan — återanvänder addManualItem (som toastar sina egna fel
// och tömmer fältet BARA vid lyckad skrivning → tomt fält = kvitto).
window.dlxSheetAdd = async function () {
  if (!window._dlxSheet) return;
  const input = document.getElementById('dlxSheetItemInput');
  const item = input?.value.trim();
  if (!item) { input?.focus(); return; }
  // Inköpsfliken kanske aldrig öppnats denna session → ladda listan först
  // så addManualItem har ett list-id att skriva mot.
  try {
    if (!window._shopListId && window.loadShoppingTab) await window.loadShoppingTab();
  } catch { /* addManualItem ger begripligt fel nedan */ }
  await window.addManualItem('dlxSheetItemInput', 'dlxSheetItemBtn');
  if (input && input.value === '') {
    _sheetAdded.push(item);
    window.showToast?.(`${item} ligger nu på inköpslistan.`, { type: 'success' });
    if (window._dlxSheet) {
      renderSheet();
      document.getElementById('dlxSheetItemInput')?.focus();
    }
  }
};

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
      // Lämna alltid historik-läget när man byter flik → fliken öppnas på
      // rubrik + hero (switchTab scrollar redan till toppen i navigation.js).
      window._dlxHistoryArmed = false;
      window._dlxHistoryOpen = false;
      const r = origSwitch.apply(this, arguments);
      if (tab === 'vecka') {
        try { renderDeluxe(); } catch (e) { console.error('renderDeluxe', e); }
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
