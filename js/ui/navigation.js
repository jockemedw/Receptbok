// Flik-navigering (Idag, Matsedel, Inköp, Recept, Listor).

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
  if (tab === 'shop') window.loadShoppingTab();
  if (tab === 'listor') window.loadListsTab?.();
}

window.switchTab = switchTab;
