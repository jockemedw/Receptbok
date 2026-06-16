// "Veckans fynd" — popup som visar rea-varor optimeringen hittade och föreslår
// rea-recept att byta in i matsedeln.
//
// Öppnas automatiskt en gång efter en prisoptimerad generering (plan-generator)
// och kan återöppnas via besparings-statistiken i premiumvyns hero.
//
// Läser: window._weeklyDeals ({ candidates }), window._lastPlan, window._lastShop,
//        window._planArchive, window._customDays.
// Skriver via /api/replace-recipe (newRecipeId + saving/savingMatches behålls).

import { escapeHtml, fmtShort, PROTEIN_COLOR } from '../utils.js';

const PROTEIN_LABEL = { fisk: 'Fisk', kyckling: 'Kyckling', kött: 'Kött', fläsk: 'Fläsk', vegetarisk: 'Vegetariskt' };
const COIN = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 7.5v9 M9.5 9.7c.6-.7 1.5-1 2.5-1s2 .3 2.4 1c.5.8 0 1.7-1 2-.7.2-2.7.3-3.4.7-.9.4-1.4 1.3-.9 2.1.5.7 1.6 1 2.5 1s1.9-.3 2.5-1"/></svg>';

function fmtKr(value) {
  if (value == null) return '–';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded} kr` : `${rounded.toFixed(1).replace('.', ',')} kr`;
}

export function hasWeeklyDeals() {
  return !!(window._weeklyDeals?.candidates?.length);
}

function matchRows(matches) {
  return (matches || []).map((m) => {
    const loyalty = m.loyalty ? '<span class="saving-loyalty">Willys Plus</span>' : '';
    const brand = m.brandLine ? `<div class="saving-brand">${escapeHtml(m.brandLine)}</div>` : '';
    return `
      <li class="saving-row">
        <div class="saving-row-main">
          <div class="saving-canon">${escapeHtml(m.canon)}${loyalty}</div>
          <div class="saving-product">${escapeHtml(m.name)}</div>
          ${brand}
          <div class="saving-prices">
            <span class="saving-promo">${fmtKr(m.promoPrice)}</span>
            <span class="saving-regular">normalt ${fmtKr(m.regularPrice)}</span>
          </div>
        </div>
        <div class="saving-delta">−${fmtKr(m.savingPerUnit)}</div>
      </li>`;
  }).join('');
}

// Recept-fynd som redan ligger i matsedeln (del 1).
function inPlanDeals() {
  const days = window._lastPlan?.days || [];
  return days.filter((d) => d.recipeId && d.saving > 0 && d.savingMatches?.length);
}

// Dagar i aktiva planen som ett föreslaget recept kan ersätta.
function targetDays() {
  const days = window._lastPlan?.days || [];
  return days.filter((d) => d.recipeId && !d.blocked && !d.custom && !d.free);
}

function candidateCard(c) {
  const color = PROTEIN_COLOR[c.protein] || 'var(--lichen)';
  const meta = [
    c.protein ? `<span class="deal-chip" style="--chip:${color}">${escapeHtml(PROTEIN_LABEL[c.protein] || c.protein)}</span>` : '',
    c.time ? `<span class="deal-time">${c.time} min</span>` : '',
  ].filter(Boolean).join('');

  const dayPicker = targetDays().map((d) => `
    <button type="button" class="deal-day-chip" data-date="${d.date}"
            onclick="dealConfirmDay(${c.recipeId}, '${d.date}', this)">
      <span class="deal-day-when">${escapeHtml(d.day || fmtShort(d.date))}</span>
      <span class="deal-day-cur">nu: ${escapeHtml(d.recipe || '–')}</span>
    </button>`).join('');

  const n = (c.matches || []).length;
  return `
    <li class="deal-card collapsible" data-recipe="${c.recipeId}">
      <button type="button" class="deal-card-head deal-card-toggle" onclick="dealToggleCard(this)" aria-expanded="false">
        <div class="deal-card-main">
          <div class="deal-title">${escapeHtml(c.title)}</div>
          <div class="deal-meta">${meta}<span class="deal-matchcount">${n} ${n === 1 ? 'fynd' : 'fynd'}</span></div>
        </div>
        <div class="deal-saving">${COIN} ${c.saving} kr <span class="deal-chev" aria-hidden="true">›</span></div>
      </button>
      <ul class="saving-list deal-matches" hidden>${matchRows(c.matches)}</ul>
      <button type="button" class="deal-bytin-btn" onclick="dealBytIn(${c.recipeId}, this)">Byt in i matsedeln</button>
      <div class="deal-day-picker" hidden>
        <p class="deal-day-hint">Vilken dag ska bytas till <strong>${escapeHtml(c.title)}</strong>?</p>
        <div class="deal-day-chips">${dayPicker}</div>
      </div>
    </li>`;
}

export function openDealsPopup() {
  if (!hasWeeklyDeals()) return;
  closeDealsPopup();

  const inPlan = inPlanDeals();
  const candidates = window._weeklyDeals.candidates;

  const inPlanHtml = inPlan.length ? `
    <section class="deal-section">
      <h3 class="deal-section-title">I din matsedel <span class="deal-count">${inPlan.length}</span></h3>
      <ul class="deal-list">
        ${inPlan.map((d) => {
          const n = (d.savingMatches || []).length;
          return `
          <li class="deal-card in-plan collapsible">
            <button type="button" class="deal-card-head deal-card-toggle" onclick="dealToggleCard(this)" aria-expanded="false">
              <div class="deal-card-main"><div class="deal-title">${escapeHtml(d.recipe)}</div>
                <div class="deal-meta"><span class="deal-when">${escapeHtml(d.day || fmtShort(d.date))}</span><span class="deal-matchcount">${n} fynd</span></div></div>
              <div class="deal-saving">${COIN} ${d.saving} kr <span class="deal-chev" aria-hidden="true">›</span></div>
            </button>
            <ul class="saving-list deal-matches" hidden>${matchRows(d.savingMatches)}</ul>
          </li>`;
        }).join('')}
      </ul>
    </section>` : '';

  const candHtml = `
    <section class="deal-section">
      <h3 class="deal-section-title">Fler fynd att haka på <span class="deal-count">${candidates.length}</span></h3>
      <p class="deal-section-sub">Rea-recept som inte kom med — tryck på ett för att se varorna, "Byt in" för att lägga det på en dag.</p>
      <ul class="deal-list">${candidates.map(candidateCard).join('')}</ul>
    </section>`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay deals-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeDealsPopup(); };
  overlay.innerHTML = `
    <div class="modal-box deals-box" role="dialog" aria-modal="true" aria-label="Veckans fynd">
      <div class="deals-head">
        <h2>${COIN} Veckans fynd</h2>
        <button type="button" class="modal-close" onclick="closeDealsPopup()" aria-label="Stäng">×</button>
      </div>
      <p class="deal-intro">Rea-varor på Willys Ekholmen som matchar dina recept.</p>
      <div class="deals-body">
        ${inPlanHtml}
        ${candHtml}
      </div>
      <p class="saving-footnote">Reapriser kan ändras eller löpa ut. Besparingen räknas per enhet och förutsätter att du handlar erbjudandet.</p>
    </div>`;
  document.body.appendChild(overlay);
}

export function closeDealsPopup() {
  document.querySelectorAll('.deals-overlay').forEach((el) => el.remove());
}

// Fäll ut/ihop ett recept-korts varulista.
export function dealToggleCard(btnEl) {
  const card = btnEl.closest('.deal-card');
  if (!card) return;
  const matches = card.querySelector('.deal-matches');
  if (!matches) return;
  const open = matches.hidden;
  matches.hidden = !open;
  btnEl.classList.toggle('open', open);
  btnEl.setAttribute('aria-expanded', open ? 'true' : 'false');
}

// Tryck på "Byt in" → fäll ut dag-väljaren under kortet.
export function dealBytIn(recipeId, btnEl) {
  const card = btnEl.closest('.deal-card');
  if (!card) return;
  const picker = card.querySelector('.deal-day-picker');
  if (!picker) return;
  const open = !picker.hidden;
  // Stäng andra öppna väljare
  document.querySelectorAll('.deal-day-picker').forEach((p) => { p.hidden = true; });
  document.querySelectorAll('.deal-bytin-btn').forEach((b) => b.classList.remove('active'));
  picker.hidden = open;
  btnEl.classList.toggle('active', !open);
}

// Bekräfta dag → byt in receptet och behåll dess fynd.
export async function dealConfirmDay(recipeId, date, btnEl) {
  const cand = window._weeklyDeals?.candidates?.find((c) => c.recipeId === recipeId);
  if (!cand) return;

  btnEl.disabled = true;
  btnEl.classList.add('is-loading');

  try {
    const res = await fetch('/api/replace-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        newRecipeId: recipeId,
        saving: cand.saving,
        savingMatches: cand.matches,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');

    // Uppdatera in-memory-planen så vyn visar det nya receptet + fyndet.
    const day = window._lastPlan?.days?.find((d) => d.date === date);
    if (day) {
      day.recipe = cand.title;
      day.recipeId = recipeId;
      day.saving = cand.saving;
      day.savingMatches = cand.matches;
    }
    // Receptet ligger nu i planen → ta bort det ur kandidaterna.
    window._weeklyDeals.candidates = window._weeklyDeals.candidates.filter((c) => c.recipeId !== recipeId);

    if (data.shoppingList && window.renderShoppingData) {
      window.renderShoppingData(data.shoppingList);
      if (window.renderIngredientPreview) {
        window.renderIngredientPreview(
          data.shoppingList.recipeItems || null,
          data.shoppingList.recipeItemsMovedAt || null,
          false
        );
      }
    }

    closeDealsPopup();
    window.renderWeeklyPlanData(window._lastPlan, window._lastShop, false, window._planArchive, window._customDays);
    if (window.switchTab) window.switchTab('vecka');
    if (window.showToast) {
      window.showToast(`${cand.title} inbytt — sparar ca ${cand.saving} kr.`, { type: 'success' });
    }
  } catch (e) {
    btnEl.disabled = false;
    btnEl.classList.remove('is-loading');
    if (window.showToast) window.showToast('Kunde inte byta in receptet — prova igen.', { type: 'error' });
  }
}

window.openDealsPopup = openDealsPopup;
window.closeDealsPopup = closeDealsPopup;
window.dealToggleCard = dealToggleCard;
window.dealBytIn = dealBytIn;
window.dealConfirmDay = dealConfirmDay;
window.hasWeeklyDeals = hasWeeklyDeals;
