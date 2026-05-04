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
    document.getElementById('countDisplay').textContent    = `${window.RECIPES.length} recept`;
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
document.getElementById('groupBy').addEventListener('change', e => window.setGroupBy(e.target.value));

// "Rensa filter"-knapp i empty state
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
