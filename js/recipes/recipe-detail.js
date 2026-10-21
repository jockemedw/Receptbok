// Receptdetaljen (ny design 2026-10): bild · rubrik · nyckeltal · handlingsknappar
// (Börja laga / Inköpslista / Planera in) · källa · ingredienser med
// portionsstepper och steg i två kolumner. Renderas i #recipeDetailPane —
// till höger om listan på desktop, som helskärm på mobil (recipe-browser.js
// sköter öppna/stäng). Samma renderare används av dag-sheetens "Visa receptet"
// via window.renderDetailInner-kompatibla delar i utils.js — den här filen
// äger BARA panelen.
//
// Läser state: RECIPES, _timelineByDate, replaceMode, customPickMode
// Skriver state: _recipeDetailId (via browser), _placeRecipe, _rdServings

import { proteinLabel, escapeHtml, jsStringAttr, PROTEIN_COLOR, recipeImage, recipeImageIsAi, recipeSource, fmtIso } from '../utils.js';
import { parseQty, fmtQty } from '../ui/cook-mode.js';

const CUISINE_LABEL = {
  italienskt: 'Italienskt', mexikanskt: 'Mexikanskt', medelhavet: 'Medelhavet', 'mellanöstern': 'Mellanöstern',
  indiskt: 'Indiskt', 'thailändskt': 'Thailändskt', japanskt: 'Japanskt', koreanskt: 'Koreanskt',
  kinesiskt: 'Kinesiskt', vietnamesiskt: 'Vietnamesiskt', asiatiskt: 'Asiatiskt', franskt: 'Franskt',
};
const TYPE_LABEL = { soppa: 'Soppa', pasta: 'Pasta', wok: 'Wok', ugn: 'Ugn', sallad: 'Sallad', gryta: 'Gryta', ramen: 'Ramen', curry: 'Curry' };

const I = {
  play: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>',
  back: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"></path></svg>',
  tick: '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"></path></svg>',
  pot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13c0-3.5 3.5-6 8-6s8 2.5 8 6"/><path d="M3 13h18"/><path d="M5.5 13v2c0 1.5 1 2.5 2.5 2.5h8c1.5 0 2.5-1 2.5-2.5v-2"/></svg>',
};

let _servings = null;   // vald portionsmängd i panelen (nollas per recept)
let _servingsFor = null;

function recipeById(id) {
  return (window.RECIPES || []).find(r => r.id === id) || null;
}

// Står receptet på en dag i matsedeln (idag eller framåt)? Då kan dess
// ingredienser skickas till inköpslistan via dagväljaren.
function plannedDayFor(id) {
  const tl = window._timelineByDate || {};
  const today = fmtIso(new Date());
  return Object.values(tl).find(d => d.date >= today && ((d.recipeId === id && !d.isCustom) || d.customRecipeId === id)) || null;
}

// ── Ingrediensrader: namn till vänster, mängd till höger ─────────────────────
function ingredientRow(line, factor) {
  const raw = String(line || '').trim();
  // "Tillbehör:" / "Sås: 2 dl grädde" — gruppetikett före mängden
  let label = '';
  let body = raw;
  const colon = raw.indexOf(':');
  if (colon > 0 && colon < 24) {
    label = raw.slice(0, colon).trim();
    body = raw.slice(colon + 1).trim();
    if (!body) return `<li class="rd-ing rd-ing-group"><span>${escapeHtml(label)}</span></li>`;
  }
  const p = parseQty(body);
  const name = p ? p.rest : body;
  let qty = '';
  if (p) qty = factor === 1 ? p.qtyText : fmtQty(p.num * factor, p.unit);
  return `<li class="rd-ing">
    <span class="rd-ing-name">${label ? `<span class="rd-ing-label">${escapeHtml(label)}</span> ` : ''}${escapeHtml(name)}</span>
    ${qty ? `<span class="rd-ing-qty${factor !== 1 ? ' scaled' : ''}">${escapeHtml(qty)}</span>` : ''}
  </li>`;
}

function ingredientsHtml(r) {
  const base = r.servings || 4;
  const serv = _servingsFor === r.id && _servings ? _servings : base;
  const factor = serv / base;
  return `
    <div class="rd-sec-head">
      <h2 class="rd-h2">Ingredienser</h2>
      <div class="rd-stepper" role="group" aria-label="Portioner">
        <button type="button" aria-label="Färre portioner" onclick="rdServStep(${r.id}, -1)">−</button>
        <span class="rd-stepper-val">${serv} port.</span>
        <button type="button" aria-label="Fler portioner" onclick="rdServStep(${r.id}, 1)">+</button>
      </div>
    </div>
    ${factor !== 1 ? `<p class="rd-serv-note">Mängderna skalade från ${base} portioner.</p>` : ''}
    <ul class="rd-ings">${(r.ingredients || []).map(l => ingredientRow(l, factor)).join('')}</ul>`;
}

window.rdServStep = function (id, delta) {
  const r = recipeById(id);
  if (!r) return;
  const base = r.servings || 4;
  const cur = _servingsFor === id && _servings ? _servings : base;
  _servingsFor = id;
  _servings = Math.min(12, Math.max(1, cur + delta));
  const host = document.querySelector('#recipeDetailPane .rd-ingredients');
  if (host) host.innerHTML = ingredientsHtml(r);
};

// ── Planera in: välj receptet först, dagen sedan (Matsedeln tar emot) ────────
window.placeRecipeStart = function (id) {
  const r = recipeById(id);
  if (!r) return;
  window._placeRecipe = { id, title: r.title };
  window.closeRecipeDetail?.();
  window.switchTab('vecka');
  window.renderDeluxe?.();
  window.showToast?.(`Tryck på dagen då ${r.title} ska lagas.`, { type: 'info' });
};

window.placeRecipeCancel = function () {
  window._placeRecipe = null;
  window.renderDeluxe?.();
};

// ── Panelen ──────────────────────────────────────────────────────────────────
export function renderRecipeDetail(id) {
  const pane = document.getElementById('recipeDetailPane');
  if (!pane) return;
  const r = recipeById(id);
  if (!r) {
    pane.innerHTML = `<div class="rd-empty"><span class="rd-empty-ic">${I.pot}</span><p>Välj ett recept i listan.</p></div>`;
    return;
  }
  if (_servingsFor !== id) { _servingsFor = null; _servings = null; }

  const image = recipeImage(r);
  const color = PROTEIN_COLOR[r.protein] || 'var(--birch)';
  const tags = (r.tags || []).map(t => t.toLowerCase());
  const cuisine = tags.map(t => CUISINE_LABEL[t]).find(Boolean);
  const type = tags.map(t => TYPE_LABEL[t]).find(Boolean);
  const eyebrow = [proteinLabel[r.protein] || r.protein, cuisine || type].filter(Boolean).join(' · ');
  const src = recipeSource(r);
  const pickMode = !!(window.replaceMode || window.customPickMode);
  const planned = plannedDayFor(id);

  const subParts = [
    r.time ? `${r.time} min${r.timeNote ? ` (${escapeHtml(r.timeNote)})` : ''}` : '',
    r.servings ? `${r.servings} portioner` : '',
  ].filter(Boolean);
  const testedBtn = `<button type="button" class="rd-tested${r.tested ? ' on' : ''}" onclick="toggleTested(event, ${r.id})"
      title="${r.tested ? 'Markera som inte provat' : 'Markera som provat'}">${r.tested ? `${I.tick}Provat` : 'Inte provat än'}</button>`;

  const actions = pickMode
    ? `<button type="button" class="rd-btn rd-btn-accent" onclick="selectRecipeForDay(event, ${r.id}, '${jsStringAttr(r.title)}')">Välj det här receptet</button>`
    : `<button type="button" class="rd-btn rd-btn-accent" onclick="openCookMode(${r.id})">${I.play}Börja laga</button>
       ${planned ? `<button type="button" class="rd-btn" onclick="openShoppingDayPicker()" title="Receptet står på ${escapeHtml(planned.day)} — välj dagar att handla för">Inköpslista</button>` : ''}
       <button type="button" class="rd-btn" onclick="placeRecipeStart(${r.id})">Planera in</button>`;

  const sourceHtml = src
    ? `<p class="rd-source">Källa: ${src.url
        ? `<a href="${escapeHtml(src.url)}" target="_blank" rel="noopener">${escapeHtml(src.label)}</a>`
        : escapeHtml(src.label)}${src.site && src.label !== src.site ? ` · ${escapeHtml(src.site)}` : ''}</p>`
    : '';

  const steps = (r.instructions || []).map((s, i) => `
    <li class="rd-step" onclick="this.classList.toggle('done')">
      <span class="rd-step-num" aria-hidden="true">${i + 1}</span>
      <p>${escapeHtml(s)}</p>
    </li>`).join('');

  pane.innerHTML = `
    <div class="rd-mobile-bar">
      <button type="button" class="rd-back" onclick="closeRecipeDetail()">${I.back}Recept</button>
    </div>
    <article class="rd" style="--p:${color}">
      <div class="rd-hero">
        ${image
          ? `<figure class="rd-photo"><img src="${image}" alt="${escapeHtml(r.title)}" width="640" height="480" loading="lazy" decoding="async">${recipeImageIsAi(r) ? '<figcaption>AI-genererad bild · serveringsförslag</figcaption>' : ''}</figure>`
          : `<div class="rd-photo is-empty" aria-hidden="true">${I.pot}<span>Ingen bild än</span></div>`}
        <div class="rd-head">
          <div class="rd-eyebrow"><span class="rd-dot"></span>${escapeHtml(eyebrow)}</div>
          <h1 class="rd-title">${escapeHtml(r.title)}</h1>
          <div class="rd-sub">${subParts.join(' · ')}${subParts.length ? ' · ' : ''}${testedBtn}</div>
          <div class="rd-actions">${actions}</div>
          ${sourceHtml}
        </div>
      </div>
      <div class="rd-cols">
        <section class="rd-ingredients">${ingredientsHtml(r)}</section>
        <section class="rd-steps">
          <h2 class="rd-h2">Gör så här</h2>
          <ol class="rd-steplist">${steps}</ol>
          ${r.notes ? `<div class="notes-box rd-notes">💡 ${escapeHtml(r.notes)}</div>` : ''}
          <button type="button" class="rd-edit" onclick="openEditModal(event, ${r.id})">Redigera recept</button>
        </section>
      </div>
    </article>`;
}

window.renderRecipeDetail = renderRecipeDetail;
