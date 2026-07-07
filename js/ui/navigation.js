// Tab-navigering: receptvy, veckovyn, inköpslistan.

export function switchTab(tab) {
  document.body.dataset.activeTab = tab;
  document.getElementById('todayView').classList.toggle('visible',    tab === 'idag');
  document.getElementById('receptView').style.display              = tab === 'recept' ? '' : 'none';
  document.getElementById('weekView').classList.toggle('visible',     tab === 'vecka');
  document.getElementById('shopView').classList.toggle('visible',     tab === 'shop');
  document.getElementById('listsView').classList.toggle('visible',    tab === 'listor');
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  closeHeaderSearch();
  document.getElementById('fabImport').style.display              = tab === 'recept' ? 'block' : 'none';
  if (tab === 'shop') window.loadShoppingTab();
  if (tab === 'listor') window.loadListsTab?.();
  // Veckovyn positioneras av premiumvyns egen switchTab-wrap (snapToHero).
  window.scrollTo({ top: 0 });
  triggerViewEnter(tab);
}

// Kort-entré: markera den aktiva vyn så dess block "reser sig" i tur (CSS
// .view-enter). Sätts BARA här (flikbyte) — aldrig vid data-render → inget eko-
// flimmer. Reflow-touch (offsetWidth) startar om animationen vid varje byte.
// Klassen städas bort efter animationen så inget kort fastnar och nästa byte
// kan spela på nytt.
const VIEW_BY_TAB = { idag: 'todayView', recept: 'receptView', vecka: 'weekView', shop: 'shopView', listor: 'listsView' };
function triggerViewEnter(tab) {
  const el = document.getElementById(VIEW_BY_TAB[tab]);
  if (!el) return;
  el.classList.remove('view-enter');
  void el.offsetWidth;              // tvinga reflow → animationen startar om
  el.classList.add('view-enter');
  setTimeout(() => el.classList.remove('view-enter'), 700);
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
