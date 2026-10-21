// Flik-navigering (Idag, Matsedel, Inköp, Recept, Listor).

// Batch C (prestandaplanen): Inköp och Listor hämtas inte om vid varje flikbyte.
// Realtime-kanalerna markerar fliken som inaktuell (_shopDirty) när någon annan
// ändrar, och egna ändringar uppdaterar vyn direkt — så en lista som laddats
// nyss är färsk. Efter FRESH_MS hämtas den om ändå (tyst, utan spinner), som
// skyddsnät om ett realtime-event gått förlorat (t.ex. app i bakgrunden).
const FRESH_MS = 60 * 1000;
const isStale = (loadedAt, dirty) => dirty || !loadedAt || (Date.now() - loadedAt) > FRESH_MS;

export function switchTab(tab) {
  // Rulla till toppen FÖRST, medan layouten för den gamla vyn fortfarande är
  // ren — då kostar scrollen ingen extra layout. Görs den efter vybytet
  // tvingar den fram en hel layout av den nya vyn innan wrapparna
  // (premiumvyn/Idag) ritar om, och sidan layoutas två gånger per flikbyte.
  // Synkront (inte rAF) så att t.ex. dlxAfterPick mäter kort mot rätt scroll.
  if (window.scrollY !== 0) window.scrollTo(0, 0);
  document.body.dataset.activeTab = tab;
  document.getElementById('todayView').classList.toggle('visible',    tab === 'idag');
  document.getElementById('receptView').style.display              = tab === 'recept' ? '' : 'none';
  document.getElementById('weekView').classList.toggle('visible',     tab === 'vecka');
  document.getElementById('shopView').classList.toggle('visible',     tab === 'shop');
  document.getElementById('listsView').classList.toggle('visible',    tab === 'listor');
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.getElementById('fabImport').style.display              = tab === 'recept' ? 'block' : 'none';
  if (tab === 'shop') {
    window.ensureDispatchUI?.();   // Willys-knappen: avgörs först när fliken faktiskt syns
    if (isStale(window._shopLoadedAt, window._shopDirty)) window.loadShoppingTab();
  }
  if (tab === 'listor' && isStale(window._listsLoadedAt, false)) window.loadListsTab?.();
}

window.switchTab = switchTab;
