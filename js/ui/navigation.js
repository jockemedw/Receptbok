// Tab-navigering: receptvy, veckovyn, inköpslistan.

export function switchTab(tab) {
  document.body.dataset.activeTab = tab;
  document.getElementById('todayView').classList.toggle('visible',    tab === 'idag');
  document.getElementById('receptView').style.display              = tab === 'recept' ? '' : 'none';
  document.getElementById('weekView').classList.toggle('visible',     tab === 'vecka');
  document.getElementById('shopView').classList.toggle('visible',     tab === 'shop');
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  closeHeaderSearch();
  document.getElementById('fabImport').style.display              = tab === 'recept' ? 'block' : 'none';
  if (tab === 'shop') window.loadShoppingTab();
  // Veckovyn positioneras av premiumvyns egen switchTab-wrap (snapToHero).
  window.scrollTo({ top: 0 });
}

function closeHeaderSearch() {
  document.getElementById('headerSearchArea').classList.add('hidden');
  document.getElementById('headerSearchBtn').classList.remove('active');
  document.getElementById('openSearchBtn')?.classList.remove('is-active');
}

export function toggleHeaderSearch() {
  const area  = document.getElementById('headerSearchArea');
  const btn   = document.getElementById('headerSearchBtn');
  const fab   = document.getElementById('openSearchBtn');
  const input = document.getElementById('search');
  const willOpen = area.classList.contains('hidden');
  area.classList.toggle('hidden', !willOpen);
  btn.classList.toggle('active', willOpen);
  fab?.classList.toggle('is-active', willOpen);
  window.updateSearchClear?.();
  // Fokusera synkront i tryck-gesten — annars öppnar iOS inte tangentbordet.
  if (willOpen && input) input.focus({ preventScroll: false });
}

// Stäng sökning med Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeHeaderSearch();
});

window.switchTab = switchTab;
window.toggleHeaderSearch = toggleHeaderSearch;
