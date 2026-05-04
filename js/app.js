// Entry point — importerar alla moduler och startar appen.
// Modulerna registrerar sina funktioner på window vid import.

import './state.js';
import './utils.js';
import './ui/scroll.js';
import './ui/navigation.js';
import './shopping/shopping-list.js';
import './shopping/dispatch-ui.js';
import './weekly-plan/ingredient-preview.js';
import './recipes/recipe-browser.js';
import './recipes/recipe-editor.js';
import './recipes/recipe-import.js';
import './weekly-plan/plan-generator.js';
import './weekly-plan/plan-viewer.js';

async function init() {
  try {
    const res = await fetch('recipes.json');
    if (!res.ok) throw new Error('Kunde inte ladda recipes.json');
    const data = await res.json();
    window.RECIPES      = data.recipes;
    window._allRecipes  = window.RECIPES;
    document.getElementById('loadingState').style.display  = 'none';
    document.getElementById('footerEl').textContent        =
      `Receptboken · ${data.meta?.lastUpdated || ''} · ${window.RECIPES.length} recept`;
    window.renderRecipeBrowser();
    window.initDatePickers();
  } catch (err) {
    document.getElementById('loadingState').innerHTML = `
      <div style="font-size:2rem;margin-bottom:1rem">⚠️</div>
      <p style="color:var(--rust)">${err.message}</p>`;
  }
}

// Event listeners
document.getElementById('search').addEventListener('input', () => window.renderRecipeBrowser());

// ── Bottom-sheet (Sortera + Filter) ─────────────────────────────────────────
// iOS-säker scroll-lock: spara scrollY, fixa body, återställ vid stängning.
let openSheetCount = 0;

function openSheet(id) {
  const sheet = document.getElementById(id);
  sheet.hidden = false;
  void sheet.offsetWidth;
  sheet.classList.add('open');

  if (openSheetCount === 0) {
    const scrollY = window.scrollY;
    document.body.dataset.scrollLockY = scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top      = `-${scrollY}px`;
    document.body.style.left     = '0';
    document.body.style.right    = '0';
    document.body.style.width    = '100%';
  }
  openSheetCount++;
}

function closeSheet(id) {
  const sheet = document.getElementById(id);
  sheet.classList.remove('open');

  openSheetCount = Math.max(0, openSheetCount - 1);
  if (openSheetCount === 0) {
    const scrollY = parseInt(document.body.dataset.scrollLockY || '0', 10);
    document.body.style.position = '';
    document.body.style.top      = '';
    document.body.style.left     = '';
    document.body.style.right    = '';
    document.body.style.width    = '';
    delete document.body.dataset.scrollLockY;
    window.scrollTo(0, scrollY);
  }
  setTimeout(() => { sheet.hidden = true; }, 280);
}

document.getElementById('openSortBtn').addEventListener('click', () => openSheet('sortSheet'));
document.getElementById('openFilterBtn').addEventListener('click', () => openSheet('filterSheet'));

document.body.addEventListener('click', e => {
  const close = e.target.closest('[data-sheet-close]');
  if (close) closeSheet(close.dataset.sheetClose);
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  ['sortSheet', 'filterSheet'].forEach(id => {
    const s = document.getElementById(id);
    if (s && !s.hidden) closeSheet(id);
  });
});

// Sortera: radio change
document.querySelectorAll('#sortSheet input[name="groupBy"]').forEach(r => {
  r.addEventListener('change', () => {
    if (r.checked) {
      window.setGroupBy(r.value);
      closeSheet('sortSheet');
    }
  });
});

// Filter: checkbox change
document.querySelectorAll('#filterSheet input[type="checkbox"]').forEach(c => {
  c.addEventListener('change', () => {
    const set = window.recipeFilters[c.dataset.fgroup];
    if (c.checked) set.add(c.value); else set.delete(c.value);
    updateFilterDot();
    window.renderRecipeBrowser();
  });
});

document.getElementById('filterClearBtn').addEventListener('click', () => {
  for (const k of Object.keys(window.recipeFilters)) window.recipeFilters[k].clear();
  document.querySelectorAll('#filterSheet input[type="checkbox"]').forEach(c => { c.checked = false; });
  updateFilterDot();
  window.renderRecipeBrowser();
});

function updateFilterDot() {
  const f = window.recipeFilters;
  const any = f.tested.size + f.protein.size + f.time.size > 0;
  document.getElementById('filterDot').hidden = !any;
}

// "Rensa sökning"-knapp i empty state
document.getElementById('emptyState').addEventListener('click', e => {
  if (e.target.closest('.empty-reset-btn')) {
    document.getElementById('search').value = '';
    window.renderRecipeBrowser();
  }
});

init();
window.loadWeeklyPlan();

// Deep-link via query param: ?tab=recept|vecka|shop
const _tabParam = new URLSearchParams(window.location.search).get('tab');
if (_tabParam && ['recept', 'vecka', 'shop'].includes(_tabParam)) {
  window.switchTab(_tabParam);
}
