// Entry point — importerar alla moduler och startar appen.
// Modulerna registrerar sina funktioner på window vid import.

import './state.js';
import './utils.js';
import './ui/scroll.js';
import './ui/navigation.js';
import './shopping/shopping-list.js';
import './weekly-plan/ingredient-preview.js';
import './recipes/recipe-browser.js';
import './recipes/recipe-editor.js';
import './recipes/recipe-import.js';
import './weekly-plan/plan-generator.js';
import './weekly-plan/plan-viewer.js';
import './offers/offers-display.js';

async function init() {
  try {
    const res = await fetch('recipes.json');
    if (!res.ok) throw new Error('Kunde inte ladda recipes.json');
    const data = await res.json();
    window.RECIPES      = data.recipes;
    window._allRecipes  = window.RECIPES;
    document.getElementById('loadingState').style.display  = 'none';
    document.getElementById('recipeGrid').innerHTML        = window.RECIPES.map(window.renderCard).join('');
    document.getElementById('countDisplay').textContent    = `${window.RECIPES.length} recept`;
    document.getElementById('footerEl').textContent        =
      `Receptboken · ${data.meta?.lastUpdated || ''} · ${window.RECIPES.length} recept`;
    window.initFilters(window.RECIPES);
    window.applyFilters();
    window.initDatePickers();
  } catch (err) {
    document.getElementById('loadingState').innerHTML = `
      <div style="font-size:2rem;margin-bottom:1rem">⚠️</div>
      <p style="color:var(--terracotta)">${err.message}</p>`;
  }
}

// Event listeners
document.getElementById('search').addEventListener('input', () => window.applyFilters());

document.getElementById('filters').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  const f = btn.dataset.filter;
  if (f === 'alla') {
    window.activeFilters = new Set(['alla']);
  } else {
    window.activeFilters.delete('alla');
    window.activeFilters.has(f) ? window.activeFilters.delete(f) : window.activeFilters.add(f);
    if (window.activeFilters.size === 0) window.activeFilters.add('alla');
  }
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', window.activeFilters.has(b.dataset.filter));
  });
  window.applyFilters();
});

init();
window.loadWeeklyPlan();
window.loadOffers();
