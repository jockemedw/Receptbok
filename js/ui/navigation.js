// Tab-navigering: receptvy, veckovyn, inköpslistan.

export function switchTab(tab) {
  document.body.dataset.activeTab = tab;
  document.getElementById('receptView').style.display              = tab === 'recept' ? '' : 'none';
  document.getElementById('weekView').classList.toggle('visible',     tab === 'vecka');
  document.getElementById('shopView').classList.toggle('visible',     tab === 'shop');
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  closeHeaderSearch();
  document.getElementById('fabImport').style.display              = tab === 'recept' ? 'block' : 'none';
  if (tab === 'shop') window.loadShoppingTab();
  if (tab === 'vecka' && window.centerTodayCard) {
    requestAnimationFrame(() => window.centerTodayCard({ smooth: false }));
  }
  window.scrollTo({ top: 0 });
}

function closeHeaderSearch() {
  document.getElementById('headerSearchArea').classList.add('hidden');
  document.getElementById('headerSearchBtn').classList.remove('active');
}

export function toggleHeaderSearch() {
  const area = document.getElementById('headerSearchArea');
  const btn  = document.getElementById('headerSearchBtn');
  const willOpen = area.classList.contains('hidden');
  area.classList.toggle('hidden', !willOpen);
  btn.classList.toggle('active', willOpen);
  if (willOpen) setTimeout(() => document.getElementById('search').focus(), 80);
}

// Stäng sökning med Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeHeaderSearch();
});

window.switchTab = switchTab;
window.toggleHeaderSearch = toggleHeaderSearch;
