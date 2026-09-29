// Prisoptimera i genereringsguiden (steg 2) — ersätter det separata
// Prisoptimera-arket. Familjen kryssar i veckans reavaror (grupperade per
// ingrediens, bästa besparing först) och genereringen bygger matsedeln runt
// dem: /api/generate tar deal_canons och föredrar recept som täcker de valda
// varorna, med alla vanliga regler kvar. Ingen vald vara = vanlig generering.
//
// Data: GET /api/deals (publik, cachad 1 h på CDN:en). Hämtas först när
// sektionen fälls ut. Urvalet är ren vy-state i minnet (nollas efter en lyckad
// generering) — inget delat innehåll.

import { escapeHtml } from '../utils.js';

const SHOW_FIRST = 12;

let _groups = null;          // null = ej hämtat
let _loading = null;         // pågående hämtning (Promise)
let _showAll = false;
let _failed = false;
const _sel = new Set();      // valda canons

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function fmtKr(v) {
  const r = Math.round((v || 0) * 10) / 10;
  return Number.isInteger(r) ? `${r} kr` : `${r.toFixed(1).replace('.', ',')} kr`;
}

function body() { return document.getElementById('wizDealsBody'); }

function renderSub() {
  const sub = document.getElementById('wizDealsSub');
  if (!sub) return;
  document.getElementById('wizDeals')?.classList.toggle('has-sel', _sel.size > 0);
  if (!_sel.size) { sub.textContent = 'Valfritt — välj varor så byggs matsedeln runt dem'; return; }
  const names = [..._sel].map(cap);
  sub.textContent = `${_sel.size} ${_sel.size === 1 ? 'vara vald' : 'varor valda'}: ${names.join(', ')}`;
}

function render() {
  const el = body();
  if (!el) return;
  document.getElementById('wizDeals')?.classList.toggle('has-sel', _sel.size > 0);
  if (_failed) {
    el.innerHTML = `<p class="wiz-deals-msg">Kunde inte hämta veckans reor just nu.</p>
      <button type="button" class="wiz-deals-more" onclick="wizDealsRetry()">Försök igen</button>`;
    return;
  }
  if (!_groups) {
    el.innerHTML = `<p class="wiz-deals-msg">Hämtar veckans reor…</p>`;
    return;
  }
  if (!_groups.length) {
    el.innerHTML = `<p class="wiz-deals-msg">Inga matvaror på rea just nu — kika tillbaka senare i veckan.</p>`;
    return;
  }
  // Valda varor visas alltid, även om de ligger utanför de första 12.
  const shown = _showAll ? _groups
    : _groups.filter((g, i) => i < SHOW_FIRST || _sel.has(g.canon));
  const rest = _groups.length - shown.length;
  el.innerHTML = `
    <p class="wiz-deals-msg">Willys-reor denna vecka, bästa besparing först. Matsedeln får recept med det du väljer — om de passar dina inställningar.</p>
    <div class="wiz-deal-chips" role="group" aria-label="Reavaror">
      ${shown.map((g) => {
        const on = _sel.has(g.canon);
        return `<button type="button" class="wiz-deal-chip${on ? ' on' : ''}" aria-pressed="${on}"
          data-canon="${escapeHtml(g.canon)}" onclick="wizToggleDeal(this)">
          <span class="wiz-deal-name">${escapeHtml(cap(g.canon))}</span>
          <span class="wiz-deal-save">−${fmtKr(g.bestSaving)}</span>
        </button>`;
      }).join('')}
    </div>
    ${rest > 0 ? `<button type="button" class="wiz-deals-more" onclick="wizDealsShowAll()">Visa alla ${_groups.length} varor</button>` : ''}
    ${_sel.size ? `<button type="button" class="wiz-deals-more" onclick="wizDealsClear()">Rensa val</button>` : ''}`;
}

async function load() {
  if (_groups || _loading) return _loading;
  _failed = false;
  render();
  _loading = (async () => {
    try {
      const res = await fetch('/api/deals');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Okänt fel');
      _groups = data.groups || [];
    } catch {
      _failed = true;
    } finally {
      _loading = null;
      render();
    }
  })();
  return _loading;
}

export function wizToggleDeals() {
  const head = document.querySelector('#wizDeals .wiz-deals-head');
  const el = body();
  if (!head || !el) return;
  const open = el.hidden;
  el.hidden = !open;
  head.setAttribute('aria-expanded', String(open));
  document.getElementById('wizDeals')?.classList.toggle('open', open);
  if (open) { render(); load(); }
}

window.wizToggleDeal = function (btn) {
  const canon = btn?.dataset.canon;
  if (!canon) return;
  if (_sel.has(canon)) _sel.delete(canon); else _sel.add(canon);
  const on = _sel.has(canon);
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', String(on));
  renderSub();
  // "Rensa val"-knappen dyker upp/försvinner — rita om bara när den ändras.
  const hasClear = !!body()?.querySelector('[onclick="wizDealsClear()"]');
  if (hasClear !== (_sel.size > 0)) render();
};
window.wizDealsShowAll = function () { _showAll = true; render(); };
window.wizDealsClear = function () { _sel.clear(); renderSub(); render(); };
window.wizDealsRetry = function () { _failed = false; load(); };
window.wizToggleDeals = wizToggleDeals;

// Läses av generatePlan (plan-generator.js).
export function getSelectedDealCanons() { return [..._sel]; }
// Efter en lyckad generering: nästa matsedel börjar utan val.
export function resetDealSelection() { _sel.clear(); _showAll = false; renderSub(); if (_groups) render(); }

window.getSelectedDealCanons = getSelectedDealCanons;
window.resetDealSelection = resetDealSelection;
