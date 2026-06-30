// Matlagningsläge — fullskärmsvy för att laga ett recept vid spisen.
// Stor text, bockbara ingredienser och steg, och Wake Lock så att skärmen
// inte släcks medan man lagar. Ren presentationsvy — muterar ingen data.

import { escapeHtml } from '../utils.js';
import { scaleIngredient, fmtNum } from './portion-scale.js';

let _wakeLock = null;
let _overlay  = null;
let _scrollY  = 0;
let _ings     = [];   // ingredienser i originalform (för omräkning)
let _servings = null; // receptets bas-portioner (om angivet)

async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator) _wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* batterisparläge m.m. — appen funkar ändå */ }
}
function releaseWakeLock() {
  try { _wakeLock?.release(); } catch { /* redan släppt */ }
  _wakeLock = null;
}
// Wake lock släpps av OS:et när fliken hamnar i bakgrunden — ta tillbaka det
function onVisibility() {
  if (document.visibilityState === 'visible' && _overlay) acquireWakeLock();
}
document.addEventListener('visibilitychange', onVisibility);

function lockScroll() {
  _scrollY = window.scrollY;
  document.body.classList.add('cook-open');
}
function unlockScroll() {
  document.body.classList.remove('cook-open');
  window.scrollTo(0, _scrollY);
}

function progressLabel(done, total) {
  if (!total) return '';
  return done >= total ? 'Allt klart — smaklig måltid! 🎉' : `Steg ${Math.min(done + 1, total)} av ${total}`;
}

function updateProgress() {
  if (!_overlay) return;
  const total = _overlay.querySelectorAll('.cook-step').length;
  const done  = _overlay.querySelectorAll('.cook-step.done').length;
  const bar   = _overlay.querySelector('.cook-progress-fill');
  const lbl   = _overlay.querySelector('.cook-progress-label');
  if (bar) bar.style.width = total ? `${(done / total) * 100}%` : '0%';
  if (lbl) lbl.textContent = progressLabel(done, total);
  // Markera nästa steg
  _overlay.querySelectorAll('.cook-step').forEach((el) => el.classList.remove('current'));
  const next = _overlay.querySelector('.cook-step:not(.done)');
  if (next && done > 0) next.classList.add('current');
}

// Portioner som faktorn ger (om bas-portioner finns), annars faktor-text.
function scaleSummary(factor) {
  if (_servings) return `${fmtNum(_servings * factor)} portioner`;
  return factor === 1 ? '4 portioner' : `×${fmtNum(factor)}`;
}

const SCALE_STEPS = [0.5, 1, 2];

function scaleControlsHtml() {
  if (!_ings.length) return '';
  const chips = SCALE_STEPS.map((f) =>
    `<button type="button" class="cook-scale-btn${f === 1 ? ' active' : ''}"
       onclick="window._cookScale(${f})">×${fmtNum(f)}</button>`
  ).join('');
  return `<div class="cook-scale">
      <span class="cook-scale-label">${escapeHtml(scaleSummary(1))}</span>
      <div class="cook-scale-btns">${chips}</div>
    </div>`;
}

// Räkna om ingredienstexten live; bock-state (.done) bevaras per rad.
function applyScale(factor) {
  if (!_overlay) return;
  _overlay.querySelectorAll('.cook-ing').forEach((li, idx) => {
    const span = li.querySelector('.cook-ing-text');
    if (span) span.textContent = scaleIngredient(_ings[idx] || '', factor);
  });
  _overlay.querySelectorAll('.cook-scale-btn').forEach((btn, i) =>
    btn.classList.toggle('active', SCALE_STEPS[i] === factor));
  const lbl = _overlay.querySelector('.cook-scale-label');
  if (lbl) lbl.textContent = scaleSummary(factor);
}

export function closeCookMode() {
  if (!_overlay) return;
  releaseWakeLock();
  const el = _overlay;
  _overlay = null;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 250);
  unlockScroll();
  document.removeEventListener('keydown', onCookKey);
}

function onCookKey(e) {
  if (e.key === 'Escape') closeCookMode();
}

export function openCookMode(recipeId) {
  const r = (window.RECIPES || []).find((x) => x.id === recipeId);
  if (!r) { window.showToast?.('Receptet kunde inte öppnas — prova igen.', { type: 'error' }); return; }
  if (_overlay) closeCookMode();

  _ings     = r.ingredients || [];
  _servings = r.servings || null;
  const ings = _ings.map((i) =>
    `<li class="cook-ing" onclick="this.classList.toggle('done')"><span class="cook-ing-box"></span><span class="cook-ing-text">${escapeHtml(i)}</span></li>`
  ).join('');
  const steps = (r.instructions || []).map((s, i) =>
    `<li class="cook-step" onclick="this.classList.toggle('done');window._cookProgress()">
       <span class="cook-step-num">${i + 1}</span><span class="cook-step-text">${escapeHtml(s)}</span>
     </li>`
  ).join('');
  const notes = r.notes
    ? `<div class="cook-notes">💡 ${escapeHtml(r.notes)}</div>` : '';
  const meta = [
    r.servings ? `${r.servings} portioner` : null,
    r.time ? `${r.time} min` : null,
    r.timeNote || null,
  ].filter(Boolean).join(' · ');

  _overlay = document.createElement('div');
  _overlay.className = 'cook-overlay';
  _overlay.innerHTML = `
    <div class="cook-safe-strip"></div>
    <div class="cook-head">
      <div class="cook-head-info">
        <span class="cook-eyebrow">Nu lagar vi</span>
        <h2 class="cook-title">${escapeHtml(r.title)}</h2>
        ${meta ? `<p class="cook-meta">${escapeHtml(meta)}</p>` : ''}
      </div>
      <button type="button" class="cook-close" aria-label="Stäng matlagningsläget" onclick="closeCookMode()">✕</button>
    </div>
    <div class="cook-progress">
      <div class="cook-progress-track"><div class="cook-progress-fill"></div></div>
      <span class="cook-progress-label">${progressLabel(0, (r.instructions || []).length)}</span>
    </div>
    <div class="cook-body">
      <details class="cook-ings-wrap" open>
        <summary>Ingredienser</summary>
        ${scaleControlsHtml()}
        <ul class="cook-ings">${ings}</ul>
      </details>
      <ol class="cook-steps">${steps}</ol>
      ${notes}
      <button type="button" class="cook-done-btn" onclick="closeCookMode()">Klar — stäng</button>
    </div>`;

  document.body.appendChild(_overlay);
  lockScroll();
  requestAnimationFrame(() => _overlay?.classList.add('show'));
  document.addEventListener('keydown', onCookKey);
  acquireWakeLock();
}

window._cookProgress = updateProgress;
window._cookScale    = applyScale;
window.openCookMode  = openCookMode;
window.closeCookMode = closeCookMode;
