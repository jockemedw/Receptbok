// Receptbläddrare: rendering av receptkort, filtrering, sökning.
// Läser state: RECIPES, activeFilters, isSnapping, scrollUpAccum
// Skriver state: isSnapping, scrollUpAccum

import { proteinLabel, timeStr, renderIngredient, renderDetailInner } from '../utils.js';

// ── Filter-grupper ────────────────────────────────────────────────────────────
const TIME_TAGS    = ['vardag30', 'helg60'];
const TYPE_TAGS    = ['soppa', 'pasta', 'wok', 'ugn', 'sallad', 'gryta', 'ramen', 'curry'];
const CUISINE_TAGS = ['asiatiskt', 'indiskt', 'japanskt', 'koreanskt'];
const TAG_LABELS   = {
  vardag30: 'Vardag ≤30 min', helg60: 'Helg ≤60 min',
  soppa: 'Soppa', pasta: 'Pasta', wok: 'Wok', ugn: 'Ugn',
  sallad: 'Sallad', gryta: 'Gryta', ramen: 'Ramen', curry: 'Curry',
  asiatiskt: 'Asiatiskt', indiskt: 'Indiskt', japanskt: 'Japanskt', koreanskt: 'Koreanskt',
};
const HIDDEN_TAGS = new Set([
  'fisk', 'kyckling', 'kött', 'fläsk', 'vegetarisk', 'veg',
  'vardag', 'middag', 'snabb', 'snabb30',
]);
const CATEGORIZED = new Set([...TIME_TAGS, ...TYPE_TAGS, ...CUISINE_TAGS]);

export function renderCard(r) {
  const t = timeStr(r);

  return `
<div class="recipe-card"
     data-id="${r.id}"
     data-title="${r.title.toLowerCase()}"
     data-protein="${r.protein}"
     data-tags="${r.tags.join(' ')}"
     data-tested="${r.tested}"
     data-time="${r.time || 999}"
     data-ingredients="${r.ingredients.join(' ').toLowerCase()}"
     data-instructions="${r.instructions.join(' ').toLowerCase()}">
  <div class="card-header" onclick="toggleCard(this.closest('.recipe-card'))">
    <div class="recipe-num">${r.id}</div>
    <div class="card-info">
      <div class="card-title">${r.title}</div>
      <div class="card-meta">
        <span class="pill pill-protein">${proteinLabel[r.protein] || r.protein}</span>
        ${t ? `<span class="pill pill-time">⏱ ${t}</span>` : ''}
        <span class="pill ${r.tested ? 'pill-tested' : 'pill-untested'} pill-toggle"
              onclick="toggleTested(event, ${r.id})">${r.tested ? '✓ Provat' : 'Ej provat'}</span>
      </div>
    </div>
    <button class="select-btn"
            onclick="selectRecipeForDay(event,${r.id},'${r.title.replace(/'/g, "\\'")}')">Välj</button>
    <span class="card-chevron">›</span>
  </div>
  <div class="recipe-detail">
    <div class="detail-inner">${renderDetailInner(r)}</div>
  </div>
</div>`;
}

export function toggleCard(card) {
  const wasOpen = card.classList.contains('open');
  document.querySelectorAll('.recipe-card.open').forEach(c => c.classList.remove('open'));
  if (!wasOpen) {
    card.classList.add('open');
    window.isSnapping   = true;
    window.scrollUpAccum = 0;
    document.querySelector('header').classList.remove('header-hidden');
    setTimeout(() => {
      const hh  = document.querySelector('header').offsetHeight;
      const top = card.getBoundingClientRect().top + window.scrollY - hh - 12;
      window.smoothScrollTo(top, 420);
    }, 680);
  }
}

export function applyFilters() {
  const q     = document.getElementById('search').value.toLowerCase().trim();
  const cards = document.querySelectorAll('.recipe-card');
  let shown   = 0;

  cards.forEach(card => {
    const protein = card.dataset.protein;
    const tags    = card.dataset.tags;
    const tested  = card.dataset.tested === 'true';
    const time    = parseInt(card.dataset.time);
    const title   = card.dataset.title;
    const ings    = card.dataset.ingredients;
    const steps   = card.dataset.instructions;

    let passFilter = window.activeFilters.has('alla');
    if (!passFilter) {
      for (const f of window.activeFilters) {
        if (f === 'provat'  && tested)          { passFilter = true; break; }
        if (f === 'oprovat' && !tested)         { passFilter = true; break; }
        if (f === 'snabb'   && time <= 30)      { passFilter = true; break; }
        if (protein === f || tags.includes(f))  { passFilter = true; break; }
      }
    }

    const passSearch = !q || title.includes(q) || protein.includes(q) || tags.includes(q)
      || ings.includes(q) || steps.includes(q);

    const show = passFilter && passSearch;
    card.style.display = show ? '' : 'none';
    if (!show) card.classList.remove('open');
    if (show) shown++;
  });

  document.getElementById('emptyState').style.display   = shown === 0 ? 'block' : 'none';
  document.getElementById('resultsInfo').textContent    = (q || !window.activeFilters.has('alla'))
    ? `Visar ${shown} av ${window.RECIPES.length} recept` : '';
}

export function jumpToRecipe(title) {
  window.switchTab('recept');
  window.activeFilters = new Set(['alla']);
  document.getElementById('search').value = '';
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === 'alla');
  });
  applyFilters();
  document.querySelectorAll('.recipe-card').forEach(card => {
    if (card.dataset.title === title.toLowerCase()) {
      toggleCard(card);
      setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  });
}

export async function toggleTested(event, id) {
  event.stopPropagation();
  const pill = event.currentTarget;
  pill.style.opacity = '0.5';
  try {
    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_tested', id }),
    });
    if (!res.ok) throw new Error();
    const { tested } = await res.json();
    const r = window.RECIPES.find(r => r.id === id);
    if (r) r.tested = tested;
    pill.className   = `pill ${tested ? 'pill-tested' : 'pill-untested'} pill-toggle`;
    pill.textContent = tested ? '✓ Provat' : 'Ej provat';
    pill.closest('.recipe-card').dataset.tested = tested;
  } catch {
    pill.style.outline = '2px solid var(--rust)';
    setTimeout(() => { pill.style.outline = ''; }, 1500);
  } finally {
    pill.style.opacity = '';
  }
}

export function initFilters(recipes) {
  const allTags = new Set();
  for (const r of recipes) for (const t of (r.tags || [])) allTags.add(t);

  const cap     = s => s.charAt(0).toUpperCase() + s.slice(1);
  const lbl     = name => `<span class="filter-group-label">${name}</span>`;
  const btn     = (f, text) => `<button class="filter-btn" data-filter="${f}">${text}</button>`;
  const tagBtns = tags => tags.filter(t => allTags.has(t)).map(t => btn(t, TAG_LABELS[t] || cap(t))).join('');

  const timeBtns    = tagBtns(TIME_TAGS);
  const typeBtns    = tagBtns(TYPE_TAGS);
  const cuisineBtns = tagBtns(CUISINE_TAGS);
  const otherTags   = [...allTags].filter(t => !CATEGORIZED.has(t) && !HIDDEN_TAGS.has(t)).sort();
  const otherBtns   = otherTags.map(t => btn(t, cap(t))).join('');

  const parts = [
    btn('alla', 'Alla'),
    ...(timeBtns    ? [lbl('Tid'),    timeBtns]    : []),
    lbl('Protein'),
    btn('snabb', 'Snabb &lt;30 min'),
    ...['fisk', 'kyckling', 'kött', 'fläsk', 'vegetarisk'].map(p => btn(p, proteinLabel[p] || p)),
    lbl('Provat'),
    btn('provat', '✓ Provat'),
    btn('oprovat', '✗ Oprövat'),
    ...(typeBtns    ? [lbl('Typ'),    typeBtns]    : []),
    ...(cuisineBtns ? [lbl('Kök'),    cuisineBtns] : []),
    ...(otherBtns   ? [lbl('Övrigt'), otherBtns]   : []),
  ];

  document.getElementById('filters').innerHTML = parts.join('');
}

window.renderCard    = renderCard;
window.toggleCard    = toggleCard;
window.applyFilters  = applyFilters;
window.jumpToRecipe  = jumpToRecipe;
window.toggleTested  = toggleTested;
window.initFilters   = initFilters;
