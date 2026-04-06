// Delad app-state — förberedelse för ContextBridge (fas 4).
// Alla moduler läser/skriver via window.* tills ContextBridge kopplas in.
window.RECIPES            = [];
window.activeFilters      = new Set(['alla']);
window.replaceMode        = null;    // { date, dayName } under receptbyte
window.editingId          = null;    // ID vid redigering, null = nytt recept
window.planConfirmed      = false;
window._freshShopContent  = null;    // cache: hoppa över fetch direkt efter API
window._checkedItems      = {};      // { key: bool } — bockar i inköpslistan
window._checkedSaveTimer  = null;
window._shopRecipeItems   = null;    // sparat för textvy-rebuild
window._shopManualItems   = [];
window.isSnapping         = false;   // förhindrar jojo-scroll
window.lastScrollY        = 0;
window.scrollUpAccum      = 0;
