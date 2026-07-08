// Prisoptimera — reor-först-flödet (ersätter den gamla dolda viktnings-toggeln).
// Steg 1: veckans Willys-reor grupperade per ingrediens (sorterade på bästa
//         besparing) → familjen kryssar i vilka varor de vill laga något av.
// Steg 2: receptförslag som använder de valda varorna, störst besparing först
//         → "Lägg in på en dag" byter in receptet i den aktiva matsedeln
//         (återanvänder /api/replace-recipe, precis som Veckans fynd).
//
// Läser: window._lastPlan (måldagar), window.apiFetch, window.showToast.
// Data: /api/deals — GET (publik) = steg 1 reor, POST (auth) = steg 2 recept.

import { escapeHtml, fmtShort, PROTEIN_COLOR } from '../utils.js';

const PROTEIN_LABEL = { fisk: 'Fisk', kyckling: 'Kyckling', kött: 'Kött', fläsk: 'Fläsk', vegetarisk: 'Vegetariskt' };
const COIN = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 7.5v9 M9.5 9.7c.6-.7 1.5-1 2.5-1s2 .3 2.4 1c.5.8 0 1.7-1 2-.7.2-2.7.3-3.4.7-.9.4-1.4 1.3-.9 2.1.5.7 1.6 1 2.5 1s1.9-.3 2.5-1"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l5 5L20 6"/></svg>';

let _groups = [];
const _sel = new Set();          // valda canons
let _suggestions = [];

function fmtKr(v) {
  if (v == null) return '–';
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? `${r} kr` : `${r.toFixed(1).replace('.', ',')} kr`;
}
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function el() { return document.querySelector('.po-overlay'); }
function setTitle(t) { const h = document.getElementById('poTitle'); if (h) h.textContent = t; }

// ── Öppna / stäng ─────────────────────────────────────────────────────────────
export async function openPrisoptimera() {
  closePrisoptimera();
  const overlay = document.createElement('div');
  overlay.className = 'po-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closePrisoptimera(); };
  overlay.innerHTML = `
    <div class="po-sheet" role="dialog" aria-modal="true" aria-label="Prisoptimera">
      <header class="po-head">
        <button type="button" class="po-back" id="poBack" onclick="poBack()" aria-label="Tillbaka" hidden>‹</button>
        <h2 class="po-h2">${COIN}<span id="poTitle">Prisoptimera</span></h2>
        <button type="button" class="po-close" onclick="closePrisoptimera()" aria-label="Stäng">×</button>
      </header>
      <div class="po-body" id="poBody">
        <div class="po-loading">${COIN}<p>Hämtar veckans reor…</p></div>
      </div>
      <div class="po-cta-bar" id="poCtaBar" hidden>
        <button type="button" class="po-cta" id="poCta" disabled onclick="poShowRecipes()">
          <span id="poCtaText">Välj minst en vara</span><span class="po-cta-n" id="poCtaN" hidden>0</span>
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  _sel.clear();
  try {
    const res = await fetch('/api/deals');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');
    _groups = data.groups || [];
    renderStep1();
  } catch (e) {
    const body = document.getElementById('poBody');
    if (body) body.innerHTML = `<div class="po-empty"><p>Kunde inte hämta Willys-reorna just nu.</p><button type="button" class="po-retry" onclick="openPrisoptimera()">Försök igen</button></div>`;
  }
}

export function closePrisoptimera() {
  document.querySelectorAll('.po-overlay').forEach((o) => o.remove());
  document.body.style.overflow = '';
}

// ── Steg 1: reor per ingrediens ───────────────────────────────────────────────
function renderStep1() {
  setTitle('Prisoptimera');
  document.getElementById('poBack').hidden = true;
  const body = document.getElementById('poBody');
  const bar = document.getElementById('poCtaBar');
  bar.hidden = false;

  if (!_groups.length) {
    body.innerHTML = `<div class="po-empty"><p>Inga matvaror på rea just nu — kika tillbaka senare i veckan.</p></div>`;
    bar.hidden = true;
    return;
  }

  body.innerHTML = `
    <p class="po-intro">Veckans reor på Willys, <strong>sorterade efter bästa besparing</strong>. Kryssa i de varor du vill laga något av — så föreslår vi recept som använder dem.</p>
    <div class="po-eyebrow"><span>Reor per ingrediens</span><span class="po-cnt">${_groups.length} grupper</span></div>
    <div class="po-glist">
      ${_groups.map((g, i) => {
        const selected = _sel.has(g.canon);
        return `
        <div class="po-grp${selected ? ' sel' : ''}" data-i="${i}">
          <div class="po-grp-head">
            <div class="po-check" onclick="poToggleGroup(${i}, event)" role="checkbox" aria-checked="${selected}" tabindex="0">${CHECK}</div>
            <div class="po-grp-main" onclick="poToggleOpen(${i})">
              <div class="po-grp-name">${escapeHtml(cap(g.canon))}</div>
              <div class="po-grp-sub">${g.count} erbjudande${g.count > 1 ? 'n' : ''} · bästa spar ${fmtKr(g.bestSaving)}</div>
            </div>
            <div class="po-grp-save" onclick="poToggleOpen(${i})">−${fmtKr(g.bestSaving)}</div>
            <div class="po-grp-chev" onclick="poToggleOpen(${i})">›</div>
          </div>
          <div class="po-prods">
            ${g.offers.map((o) => `
              <div class="po-prod">
                <div class="po-prod-main">
                  <div class="po-prod-name">${escapeHtml(o.name)}${o.loyalty ? '<span class="po-loyal">Willys Plus</span>' : ''}${o.bulk ? '<span class="po-bulk">storpack</span>' : ''}</div>
                  ${o.brandLine ? `<div class="po-prod-brand">${escapeHtml(o.brandLine)}</div>` : ''}
                </div>
                <div class="po-prod-price">
                  <span class="po-p-now">${fmtKr(o.promoPrice)}</span><span class="po-p-was">${fmtKr(o.regularPrice)}</span>
                  <span class="po-p-save">spar ${fmtKr(o.savingPerUnit)}</span>
                </div>
              </div>`).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  updateCta();
  document.querySelector('.po-body').scrollTop = 0;
}

export function poToggleOpen(i) {
  const g = document.querySelector(`.po-grp[data-i="${i}"]`);
  if (g) g.classList.toggle('open');
}
export function poToggleGroup(i, ev) {
  if (ev) ev.stopPropagation();
  const g = _groups[i];
  if (!g) return;
  const node = document.querySelector(`.po-grp[data-i="${i}"]`);
  if (_sel.has(g.canon)) { _sel.delete(g.canon); node?.classList.remove('sel'); }
  else { _sel.add(g.canon); node?.classList.add('sel'); }
  node?.querySelector('.po-check')?.setAttribute('aria-checked', _sel.has(g.canon));
  updateCta();
}
function updateCta() {
  const n = _sel.size;
  const cta = document.getElementById('poCta');
  const t = document.getElementById('poCtaText');
  const badge = document.getElementById('poCtaN');
  if (!cta) return;
  cta.disabled = n === 0;
  if (n === 0) { t.textContent = 'Välj minst en vara'; badge.hidden = true; }
  else { t.textContent = 'Visa receptförslag'; badge.hidden = false; badge.textContent = n; }
}

// ── Steg 2: receptförslag ─────────────────────────────────────────────────────
export async function poShowRecipes() {
  if (_sel.size === 0) return;
  const body = document.getElementById('poBody');
  document.getElementById('poCtaBar').hidden = true;
  document.getElementById('poBack').hidden = false;
  setTitle('Receptförslag');
  body.innerHTML = `<div class="po-loading">${COIN}<p>Letar recept från dina reor…</p></div>`;

  try {
    const res = await window.apiFetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canons: [..._sel] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');
    _suggestions = data.suggestions || [];
    renderStep2();
  } catch (e) {
    body.innerHTML = `<div class="po-empty"><p>Kunde inte hämta receptförslag — prova igen.</p><button type="button" class="po-retry" onclick="poShowRecipes()">Försök igen</button></div>`;
  }
}

function targetDays() {
  return (window._lastPlan?.days || []).filter((d) => d.recipeId && !d.blocked);
}

function renderStep2() {
  const body = document.getElementById('poBody');
  const chosen = [..._sel].map((c) => cap(c)).join(', ');
  if (!_suggestions.length) {
    body.innerHTML = `
      <p class="po-intro">Inga av dina recept använder <strong>${escapeHtml(chosen.toLowerCase())}</strong> just nu. Prova att välja fler varor, eller lägg till recept med de ingredienserna.</p>`;
    document.querySelector('.po-body').scrollTop = 0;
    return;
  }
  const days = targetDays();
  const dayPicker = days.length
    ? days.map((d) => `
        <button type="button" class="po-daychip" data-date="${d.date}">
          <span class="po-dc-when">${escapeHtml(d.day || fmtShort(d.date))}</span>
          <span class="po-dc-cur">nu: ${escapeHtml(d.recipe || '–')}</span>
        </button>`).join('')
    : `<p class="po-noplan">Generera en matsedel först — sen kan du byta in rea-recept på en dag.</p>`;

  body.innerHTML = `
    <p class="po-intro">Recept som använder <strong>${escapeHtml(chosen.toLowerCase())}</strong>, störst besparing först. Tryck på ett recept för att se fynden — lägg sen in det på en dag.</p>
    <div class="po-eyebrow"><span>Receptförslag</span><span class="po-cnt">${_suggestions.length}</span></div>
    <div class="po-reclist">
      ${_suggestions.map((c) => {
        const color = PROTEIN_COLOR[c.protein] || 'var(--lichen)';
        const n = (c.matches || []).length;
        return `
        <div class="po-rcard" data-recipe="${c.recipeId}" style="--rail:${color}">
          <button type="button" class="po-rcard-head" onclick="poToggleCard(this)" aria-expanded="false">
            <div class="po-rcard-main">
              <div class="po-rtitle">${escapeHtml(c.title)}</div>
              <div class="po-rmeta">
                <span class="po-chip">${escapeHtml(PROTEIN_LABEL[c.protein] || c.protein || '')}</span>
                ${c.time ? `<span class="po-rtime">${c.time} min</span>` : ''}
                <span class="po-rmatch">· ${n} fynd</span>
              </div>
            </div>
            <div class="po-rsave">${COIN}${c.saving} kr <span class="po-rchev">›</span></div>
          </button>
          <ul class="po-rmatches" hidden>
            ${(c.matches || []).map((m) => `
              <li class="po-mrow">
                <div><div class="po-m-can">${escapeHtml(cap(m.canon))}${m.loyalty ? '<span class="po-loyal">Willys Plus</span>' : ''}${m.bulk ? '<span class="po-bulk">storpack</span>' : ''}</div>
                  <div class="po-m-prod">${escapeHtml(m.name)}</div>
                  <div class="po-m-price"><span class="po-p-now">${fmtKr(m.promoPrice)}</span> <span class="po-p-was">${fmtKr(m.regularPrice)}</span></div></div>
                <div class="po-m-save">−${fmtKr(m.savingPerUnit)}</div>
              </li>`).join('')}
          </ul>
          <button type="button" class="po-addbtn" onclick="poPickDay(${c.recipeId})">Lägg in på en dag</button>
          <div class="po-daypick" hidden>
            <p class="po-dp-hint">Vilken dag ska bli <strong>${escapeHtml(c.title)}</strong>?</p>
            <div class="po-daychips">${dayPicker}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <p class="po-foot">Besparingen avser hela förpackningen och förutsätter att du handlar erbjudandet. Reapriser kan ändras eller löpa ut.</p>`;

  // Bind dag-knapparna (data-date) per kort → poConfirmDay(recipeId, date).
  body.querySelectorAll('.po-rcard').forEach((card) => {
    const rid = Number(card.dataset.recipe);
    card.querySelectorAll('.po-daychip').forEach((btn) => {
      btn.addEventListener('click', () => poConfirmDay(rid, btn.dataset.date, btn));
    });
  });
  document.querySelector('.po-body').scrollTop = 0;
}

export function poToggleCard(btn) {
  const card = btn.closest('.po-rcard');
  const matches = card?.querySelector('.po-rmatches');
  if (!matches) return;
  const open = matches.hidden;
  matches.hidden = !open;
  card.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

export function poPickDay(recipeId) {
  const card = document.querySelector(`.po-rcard[data-recipe="${recipeId}"]`);
  if (!card) return;
  const picker = card.querySelector('.po-daypick');
  const open = !picker.hidden;
  document.querySelectorAll('.po-daypick').forEach((p) => { p.hidden = true; });
  document.querySelectorAll('.po-addbtn').forEach((b) => b.classList.remove('active'));
  picker.hidden = open;
  card.querySelector('.po-addbtn')?.classList.toggle('active', !open);
}

export async function poConfirmDay(recipeId, date, btnEl) {
  const cand = _suggestions.find((c) => c.recipeId === recipeId);
  if (!cand || !date) return;
  btnEl.disabled = true;
  btnEl.classList.add('is-loading');
  try {
    const res = await window.apiFetch('/api/replace-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, newRecipeId: recipeId, saving: cand.saving, savingMatches: cand.matches }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');

    const day = window._lastPlan?.days?.find((d) => d.date === date);
    if (day) { day.recipe = cand.title; day.recipeId = recipeId; day.saving = cand.saving; day.savingMatches = cand.matches; }

    if (data.shoppingList && window.renderShoppingData) {
      window.renderShoppingData(data.shoppingList);
      window.renderIngredientPreview?.(data.shoppingList.recipeItems || null, data.shoppingList.recipeItemsMovedAt || null, false);
    }

    closePrisoptimera();
    window.renderWeeklyPlanData(window._lastPlan, window._lastShop, false, window._planArchive, window._customDays);
    window.switchTab?.('vecka');
    window.showToast?.(`${cand.title} inlagt — sparar ca ${cand.saving} kr.`, { type: 'success' });
  } catch (e) {
    btnEl.disabled = false;
    btnEl.classList.remove('is-loading');
    window.showToast?.('Kunde inte lägga in receptet — prova igen.', { type: 'error' });
  }
}

export function poBack() { renderStep1(); }

window.openPrisoptimera = openPrisoptimera;
window.closePrisoptimera = closePrisoptimera;
window.poToggleOpen = poToggleOpen;
window.poToggleGroup = poToggleGroup;
window.poShowRecipes = poShowRecipes;
window.poToggleCard = poToggleCard;
window.poPickDay = poPickDay;
window.poConfirmDay = poConfirmDay;
window.poBack = poBack;
