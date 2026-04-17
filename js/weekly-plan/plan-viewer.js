// Veckovyn: rendering, receptbyte, dagbyte, bekräftelse.
// Läser state: RECIPES, planConfirmed, isSnapping, scrollUpAccum
// Skriver state: planConfirmed, isSnapping, scrollUpAccum

import { fmtIso, fmtShort, PROTEIN_COLOR } from '../utils.js';

// ── Replace-läge ─────────────────────────────────────────────────────────────

export function enterReplaceMode(date, dayName) {
  window.replaceMode = { date, dayName };
  document.getElementById('replaceBannerDay').textContent = dayName;
  document.getElementById('receptView').classList.add('replace-mode');
  window.switchTab('recept');
}

export function exitReplaceMode() {
  window.replaceMode = null;
  document.getElementById('receptView').classList.remove('replace-mode');
}

export async function selectRecipeForDay(event, recipeId, title) {
  event.stopPropagation();
  if (!window.replaceMode) return;
  const { date } = window.replaceMode;

  const btn = event.currentTarget;
  btn.disabled    = true;
  btn.textContent = 'Sparar…';

  try {
    const res = await fetch('/api/replace-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, newRecipeId: recipeId }),
    });
    if (!res.ok) throw new Error();

    const data = await res.json();
    const card = document.querySelector(`.week-day-card[data-date="${date}"]`);
    if (card) {
      card.dataset.recipeid = recipeId;
      card.querySelector('.week-day-recipe').textContent = title;
    }
    if (data.shoppingList) {
      window.renderIngredientPreview(
        data.shoppingList.recipeItems || null,
        data.shoppingList.recipeItemsMovedAt || null,
        false
      );
      if (window.renderShoppingData) window.renderShoppingData(data.shoppingList);
    }
    exitReplaceMode();
    window.switchTab('vecka');
  } catch {
    btn.disabled    = false;
    btn.textContent = 'Välj';
    const banner = document.getElementById('replaceBanner');
    if (!banner.querySelector('.replace-err')) {
      const e = document.createElement('span');
      e.className  = 'replace-err';
      e.style.cssText = 'color:var(--terracotta);font-size:0.8rem';
      e.textContent   = 'Kunde inte spara — prova igen.';
      banner.insertBefore(e, banner.querySelector('.replace-banner-cancel'));
    }
  }
}

// ── Dagbyte ───────────────────────────────────────────────────────────────────

export function enterSwapMode(fromDate) {
  cancelSwapMode();
  const fromCard = document.querySelector(`.week-day-card[data-date="${fromDate}"]`);
  if (!fromCard) return;

  const panel = document.getElementById('weekRecipeDetail');
  panel.classList.remove('open');
  panel.innerHTML = '';

  fromCard.classList.remove('selected');
  fromCard.classList.add('swap-source');
  document.querySelectorAll('.week-day-card').forEach(c => {
    if (c !== fromCard) c.classList.add('swap-target');
  });
}

export function cancelSwapMode() {
  document.querySelectorAll('.week-day-card.swap-source').forEach(c => c.classList.remove('swap-source'));
  document.querySelectorAll('.week-day-card.swap-target').forEach(c => c.classList.remove('swap-target'));
}

export async function swapDays(date1, date2) {
  cancelSwapMode();
  document.querySelectorAll('.week-day-card').forEach(c => c.classList.remove('selected'));
  const panel = document.getElementById('weekRecipeDetail');
  panel.classList.remove('open');
  panel.innerHTML = '';

  const card1 = document.querySelector(`.week-day-card[data-date="${date1}"]`);
  const card2 = document.querySelector(`.week-day-card[data-date="${date2}"]`);
  const orig1 = card1 ? { title: card1.querySelector('.week-day-recipe').textContent, rid: card1.dataset.recipeid } : null;
  const orig2 = card2 ? { title: card2.querySelector('.week-day-recipe').textContent, rid: card2.dataset.recipeid } : null;

  function applySwap(c1, o1, c2, o2) {
    if (!c1 || !c2) return;
    const t1 = c1.querySelector('.week-day-recipe');
    const t2 = c2.querySelector('.week-day-recipe');
    t1.style.opacity = '0';
    t2.style.opacity = '0';
    setTimeout(() => {
      t1.textContent = o2.title;
      t2.textContent = o1.title;
      c1.dataset.recipeid = o2.rid;
      c2.dataset.recipeid = o1.rid;
      c1.setAttribute('onclick', `openWeekRecipe(${o2.rid || 'null'}, '${o2.title.replace(/'/g, "\\'")}', this)`);
      c2.setAttribute('onclick', `openWeekRecipe(${o1.rid || 'null'}, '${o1.title.replace(/'/g, "\\'")}', this)`);
      t1.style.opacity = '';
      t2.style.opacity = '';
    }, 150);
  }

  applySwap(card1, orig1, card2, orig2); // optimistisk uppdatering

  try {
    const res = await fetch('/api/swap-days', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date1, date2 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');
  } catch (e) {
    applySwap(card1, orig2, card2, orig1); // återställ vid fel
    const errEl = document.createElement('p');
    errEl.style.cssText = 'color:var(--terracotta);font-size:0.82rem;padding:0.5rem 1rem';
    errEl.textContent   = 'Kunde inte byta dag — prova igen.';
    panel.innerHTML = '';
    panel.appendChild(errEl);
    panel.classList.add('open');
  }
}

// ── Receptbyte (slumpa/välj) ──────────────────────────────────────────────────

export async function replaceRecipe(currentId, date, btnEl) {
  btnEl.disabled    = true;
  btnEl.textContent = 'Letar recept…';

  const weekRecipeIds = Array.from(document.querySelectorAll('.week-day-card[data-recipeid]'))
    .map(c => parseInt(c.dataset.recipeid, 10))
    .filter(id => !isNaN(id));

  try {
    const res = await fetch('/api/replace-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, currentRecipeId: currentId, weekRecipeIds }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');

    const selectedCard = document.querySelector('.week-day-card.selected');
    if (selectedCard) {
      selectedCard.dataset.recipeid = data.recipeId;
      selectedCard.querySelector('.week-day-recipe').textContent = data.recipe;
      selectedCard.classList.remove('selected');
      openWeekRecipe(data.recipeId, data.recipe, selectedCard);
    }
    if (data.shoppingList) {
      window.renderIngredientPreview(
        data.shoppingList.recipeItems || null,
        data.shoppingList.recipeItemsMovedAt || null,
        false
      );
      if (window.renderShoppingData) window.renderShoppingData(data.shoppingList);
    }
  } catch (e) {
    btnEl.disabled    = false;
    btnEl.textContent = 'Föreslå nytt recept';
    const panel  = document.getElementById('weekRecipeDetail');
    const errEl  = panel.querySelector('.replace-error');
    if (!errEl) {
      const p = document.createElement('p');
      p.className    = 'replace-error';
      p.style.cssText = 'color:var(--terracotta);font-size:0.82rem;margin-top:0.5rem';
      p.textContent   = 'Kunde inte byta recept — prova igen.';
      btnEl.after(p);
    }
  }
}

// ── Detaljpanel ───────────────────────────────────────────────────────────────

export function openWeekRecipe(recipeId, title, cardEl) {
  if (cardEl.classList.contains('swap-target')) {
    const fromDate = document.querySelector('.week-day-card.swap-source')?.dataset.date;
    if (fromDate) swapDays(fromDate, cardEl.dataset.date);
    return;
  }

  const panel          = document.getElementById('weekRecipeDetail');
  const alreadySelected = cardEl.classList.contains('selected');
  cancelSwapMode();
  document.querySelectorAll('.week-day-card').forEach(c => c.classList.remove('selected'));

  if (alreadySelected) {
    panel.classList.remove('open');
    panel.innerHTML = '';
    return;
  }

  const r = recipeId ? window.RECIPES.find(x => x.id === recipeId) : null;
  if (!r) { window.jumpToRecipe(title); return; }

  cardEl.classList.add('selected');

  const t        = r.time ? (r.timeNote ? `${r.time} min · ${r.timeNote}` : `${r.time} min`) : '';
  const ingHtml  = r.ingredients.map(i => `<li>${i}</li>`).join('');
  const stepsHtml = r.instructions.map(s =>
    `<li onclick="toggleStep(this)"><span>${s}</span></li>`
  ).join('');
  const notesHtml = r.notes
    ? `<div class="detail-section"><p class="recipe-notes">${r.notes}</p></div>` : '';
  const date    = cardEl.dataset.date || '';
  const dayName = cardEl.dataset.day  || '';

  const PROTEIN_LABEL = { fisk: 'Fisk', kyckling: 'Kyckling', kött: 'Kött', fläsk: 'Fläsk', vegetarisk: 'Vegetarisk' };

  const replaceBtns = window.planConfirmed ? '' : `
    <button class="replace-recipe-btn" onclick="enterReplaceMode('${date}', '${dayName}')">Välj annat recept</button>
    <button class="replace-recipe-btn" onclick="replaceRecipe(${r.id}, '${date}', this)">Slumpa nytt recept</button>
    <button class="replace-recipe-btn" onclick="enterSwapMode('${date}')">Byt dag</button>`;
  const dayActionBtns = `<div class="day-action-btns">
    <button class="day-action-btn" onclick="skipDay('${date}')">Hoppa över — skjut recept →</button>
    <button class="day-action-btn day-action-block" onclick="blockDay('${date}')">Blockera dag</button>
  </div>`;
  const actionBtns = replaceBtns + dayActionBtns;

  panel.innerHTML = `<div class="detail-inner">
    <div class="week-recipe-header">
      <div class="week-recipe-title">${r.title}</div>
      <span class="pill pill-protein">${PROTEIN_LABEL[r.protein] || r.protein}</span>
      ${t ? `<span class="pill pill-time">⏱ ${t}</span>` : ''}
      <span class="pill ${r.tested ? 'pill-tested' : 'pill-untested'} pill-toggle"
            onclick="toggleTested(event, ${r.id})">${r.tested ? '✓ Provat' : 'Ej provat'}</span>
    </div>
    <div class="detail-section">
      <h3>Ingredienser · ${r.servings} portioner</h3>
      <ul class="ingredients-list">${ingHtml}</ul>
    </div>
    <div class="detail-section">
      <h3>Tillagning</h3>
      <ol class="steps-list">${stepsHtml}</ol>
    </div>
    ${notesHtml}
    ${actionBtns}
  </div>`;

  panel.classList.add('open');
  window.isSnapping    = true;
  window.scrollUpAccum = 0;
  document.querySelector('header').classList.remove('header-hidden');
  const hh  = document.querySelector('header').offsetHeight;
  const top = panel.getBoundingClientRect().top + window.scrollY - hh - 8;
  window.smoothScrollTo(top, 380);
}

// ── Blockera / Hoppa över ────────────────────────────────────────────────────

async function modifyDay(date, action) {
  const cards = document.querySelectorAll('.week-day-card');
  cards.forEach(c => c.style.pointerEvents = 'none');

  try {
    const res = await fetch('/api/skip-day', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, action }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');

    // Stäng detaljpanelen
    const panel = document.getElementById('weekRecipeDetail');
    panel.classList.remove('open');
    panel.innerHTML = '';
    document.querySelectorAll('.week-day-card').forEach(c => c.classList.remove('selected'));

    // Re-rendera planen
    const shop = data.shoppingList || null;
    renderWeeklyPlanData(data.weeklyPlan, shop);

    // Uppdatera inköpslistan om den finns
    if (shop && window.renderShoppingData) {
      window.renderShoppingData(shop);
    }
  } catch (e) {
    const panel = document.getElementById('weekRecipeDetail');
    const errEl = document.createElement('p');
    errEl.style.cssText = 'color:var(--terracotta);font-size:0.82rem;padding:0.5rem 1rem';
    errEl.textContent = `Kunde inte ${action === 'skip' ? 'hoppa över' : 'blockera'} dagen — prova igen.`;
    panel.innerHTML = '';
    panel.appendChild(errEl);
    panel.classList.add('open');
  } finally {
    cards.forEach(c => c.style.pointerEvents = '');
  }
}

export function skipDay(date) { return modifyDay(date, 'skip'); }
export function blockDay(date) { return modifyDay(date, 'block'); }

// ── Bekräftelse ───────────────────────────────────────────────────────────────

export async function confirmPlan() {
  const btn      = document.getElementById('confirmPlanBtn');
  const statusEl = document.getElementById('confirmStatus');
  btn.disabled    = true;
  btn.textContent = 'Bygger inköpslista…';
  statusEl.textContent = '';

  try {
    const res  = await fetch('/api/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');

    window.planConfirmed = true;
    document.getElementById('confirmPlanWrap').style.display = 'none';
    document.querySelectorAll('.swap-icon-btn').forEach(b => b.remove());

    const panel = document.getElementById('weekRecipeDetail');
    panel.classList.remove('open');
    panel.innerHTML = '';
    document.querySelectorAll('.week-day-card').forEach(c => c.classList.remove('selected'));

    window.renderIngredientPreview(
      data.shoppingList?.recipeItems || null,
      data.shoppingList?.recipeItemsMovedAt || null,
      true
    );
  } catch (e) {
    btn.disabled    = false;
    btn.textContent = '✓ Bekräfta och bygg inköpslista';
    statusEl.textContent = 'Kunde inte bekräfta — prova igen.';
    statusEl.className   = 'confirm-status';
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

export function renderWeeklyPlanData(plan, shop, freshlyGenerated = false) {
  if (!plan?.days?.length) { document.getElementById('weekNoData').style.display = ''; return; }

  document.getElementById('weekLoading').style.display = 'none';
  document.getElementById('weekNoData').style.display  = 'none';
  document.getElementById('weekContent').style.display = '';

  let metaText = '';
  if (plan.startDate && plan.endDate)
    metaText = `${fmtShort(plan.startDate)} – ${fmtShort(plan.endDate)}`;
  else if (plan.week)
    metaText = `Vecka ${plan.week}`;
  document.getElementById('weekMeta').textContent = metaText;

  const todayIso = fmtIso(new Date());
  document.getElementById('weekGrid').innerHTML = plan.days.map(d => {
    const isToday  = d.date === todayIso;
    const isPast   = d.date < todayIso;
    const isBlocked = d.blocked && !d.recipeId;
    const cls = (isBlocked ? ' blocked' : '') + (isToday ? ' today' : isPast ? ' past' : '');
    const dot = isToday ? '<span class="today-dot"></span>' : '';

    if (isBlocked) {
      return `<div class="week-day-card${cls}" data-date="${d.date || ''}" data-day="${d.day || ''}">
        <div class="week-day-name">${d.day}${d.date ? ' · ' + fmtShort(d.date) : ''}${dot}</div>
        <div class="week-day-recipe blocked-recipe-text">Fri dag</div>
      </div>`;
    }

    const safeTitle    = (d.recipe || '').replace(/'/g, "\\'");
    const rid          = d.recipeId || '';
    const recipe       = rid ? window.RECIPES.find(r => r.id === rid) : null;
    const proteinColor = recipe ? (PROTEIN_COLOR[recipe.protein] || '') : '';
    const borderStyle  = proteinColor ? ` style="border-left: 3px solid ${proteinColor}"` : '';
    const swapBtn = window.planConfirmed ? '' :
      `<button class="swap-icon-btn" title="Flytta till annan dag"
         onclick="event.stopPropagation();enterSwapMode('${d.date || ''}')"
       ><svg xmlns="http://www.w3.org/2000/svg" width="13" height="10" viewBox="0 0 13 10"
         fill="none" stroke="currentColor" stroke-width="1.6"
         stroke-linecap="round" stroke-linejoin="round">
         <path d="M1 2.5h11M9 0.5l2.5 2L9 4.5"/>
         <path d="M12 7.5H1M4 5.5L1.5 7.5 4 9.5"/>
       </svg></button>`;
    const savingBadge = (d.saving && d.saving >= 10)
      ? `<div class="week-day-saving" title="Uppskattad besparing jämfört med normalpris">💰 ${d.saving} kr</div>`
      : '';
    return `<div class="week-day-card${cls}"${borderStyle}
      data-recipeid="${rid}" data-date="${d.date || ''}" data-day="${d.day || ''}"
      onclick="openWeekRecipe(${rid || 'null'}, '${safeTitle}', this)">
      <div class="week-day-name">${d.day}${d.date ? ' · ' + fmtShort(d.date) : ''}${dot}</div>
      <div class="week-day-recipe">${d.recipe}</div>
      ${savingBadge}
      ${swapBtn}
    </div>`;
  }).join('');

  setTimeout(() => {
    const target = document.querySelector('.week-day-card.today')
                || document.querySelector('.week-day-card:not(.past)');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, 150);

  const confirmed = !!plan.confirmedAt;
  window.planConfirmed = confirmed;

  const confirmWrap   = document.getElementById('confirmPlanWrap');
  const confirmStatus = document.getElementById('confirmStatus');
  const confirmBtn    = document.getElementById('confirmPlanBtn');
  confirmWrap.style.display  = confirmed ? 'none' : '';
  confirmBtn.disabled        = false;
  confirmBtn.textContent     = '✓ Bekräfta och bygg inköpslista';
  confirmStatus.textContent  = '';
  confirmStatus.className    = 'confirm-status';

  const recipeItems = shop?.recipeItems || shop?.categories || null;
  window.renderIngredientPreview(recipeItems, shop?.recipeItemsMovedAt || null, freshlyGenerated || confirmed);
  document.getElementById('triggerSection').classList.add('collapsed');
}

export async function loadWeeklyPlan() {
  try {
    const [planRes, shopRes] = await Promise.all([
      fetch('weekly-plan.json'),
      fetch('shopping-list.json'),
    ]);
    document.getElementById('weekLoading').style.display = 'none';
    if (!planRes.ok) { document.getElementById('weekNoData').style.display = ''; return; }
    const plan = await planRes.json();
    const shop = shopRes.ok ? await shopRes.json() : null;
    if (!plan?.days?.length) { document.getElementById('weekNoData').style.display = ''; return; }
    renderWeeklyPlanData(plan, shop);
  } catch {
    document.getElementById('weekLoading').style.display = 'none';
    document.getElementById('weekNoData').style.display  = '';
  }
}

window.enterReplaceMode    = enterReplaceMode;
window.exitReplaceMode     = exitReplaceMode;
window.selectRecipeForDay  = selectRecipeForDay;
window.enterSwapMode       = enterSwapMode;
window.cancelSwapMode      = cancelSwapMode;
window.swapDays            = swapDays;
window.replaceRecipe       = replaceRecipe;
window.openWeekRecipe      = openWeekRecipe;
window.skipDay             = skipDay;
window.blockDay            = blockDay;
window.confirmPlan         = confirmPlan;
window.renderWeeklyPlanData = renderWeeklyPlanData;
window.loadWeeklyPlan      = loadWeeklyPlan;
