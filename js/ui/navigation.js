// Tab-navigering: receptvy, veckovyn, inköpslistan.

export function switchTab(tab) {
  document.getElementById('receptView').style.display              = tab === 'recept' ? '' : 'none';
  document.getElementById('weekView').classList.toggle('visible',     tab === 'vecka');
  document.getElementById('shopView').classList.toggle('visible',     tab === 'shop');
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.getElementById('headerSearchArea').classList.toggle('hidden', tab !== 'recept');
  document.getElementById('fabImport').style.display              = tab === 'recept' ? 'block' : 'none';
  if (tab === 'shop') window.loadShoppingTab();
  if (tab === 'vecka' && window.centerTodayCard) {
    requestAnimationFrame(() => window.centerTodayCard({ smooth: false }));
  }
  window.scrollTo({ top: 0 });
}

window.switchTab = switchTab;
