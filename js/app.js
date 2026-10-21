// Entry point — importerar alla moduler och startar appen.
// Modulerna registrerar sina funktioner på window vid import.

import './ui/perf.js';   // ?perf=1 → mätning (Fas 0). Inert utan flaggan.
import './state.js';
import { svCompare, escapeHtml } from './utils.js';
import { isDbUnreachable, getLastDbError, DB_RESTING_MESSAGE } from './supabase-client.js';
import { requireAuth, signOut } from './auth-gate.js';
import { recipeFromRow } from './data-mapper.js';
import './ui/scroll.js';
import './ui/navigation.js';
import './ui/feedback.js';
import './ui/cook-mode.js';
import './shopping/shopping-list.js';
import './shopping/day-picker.js';
import './shopping/dispatch-ui.js';
import './lists/lists-view.js';
import './weekly-plan/ingredient-preview.js';
import './recipes/recipe-browser.js';
import './recipes/recipe-detail.js';
import './recipes/recipe-editor.js';
import './recipes/recipe-import.js';
import './weekly-plan/plan-generator.js';
import './weekly-plan/plan-viewer.js';
import './weekly-plan/plan-viewer-deluxe.js';
import './weekly-plan/day-drag.js';
import './today/today-view.js';
import './weekly-plan/deals-popup.js';
import './weekly-plan/wiz-deals.js';

async function init() {
  // Batch A1 (prestandaplanen): matsedeln hämtas PARALLELLT med recepten — båda
  // behöver bara hushålls-id. loadWeeklyPlan väntar på window._recipesReady innan
  // den ritar, så renderordningen recept → matsedel är oförändrad; det är bara
  // nätverksrundorna som överlappar. Löftet löses ALLTID (finally), även när
  // recepten inte gick att ladda — annars skulle matsedeln aldrig ritas.
  let recipesReady;
  window._recipesReady = new Promise((resolve) => { recipesReady = resolve; });
  try {
    const householdId = await window.getHouseholdId();
    window.perfMark?.('hushåll');
    if (householdId) {
      Promise.resolve(window.loadWeeklyPlan?.()).then(
        () => window.perfMark?.('matsedel'),
        () => window.perfMark?.('matsedel:fel'),
      );
    }
    if (!householdId) {
      // Pausad free-tier-databas ser ut som "hushåll saknas" — skilj på dem
      // så familjen får veta att det bara är att vänta, inte att något är trasigt.
      throw new Error(isDbUnreachable(getLastDbError())
        ? DB_RESTING_MESSAGE
        : 'Kunde inte hitta hushållsinformation.');
    }
    const { data: rows, error } = await window.db
      .from('recipes')
      .select('*')
      .eq('household_id', householdId)
      .order('id');
    if (error) throw new Error(isDbUnreachable(error) ? DB_RESTING_MESSAGE : 'Kunde inte ladda recepten.');
    window.RECIPES     = rows.map(recipeFromRow);
    window._allRecipes = window.RECIPES;
    // Finns source_url-kolumnen (migration 014)? select('*') ger nyckeln bara då.
    window._recipeSourceSupported = rows.length > 0 && Object.prototype.hasOwnProperty.call(rows[0], 'source_url');
    window.perfMark?.('recept');
    document.getElementById('loadingState').style.display = 'none';
    syncRecipeCount();
    buildTagFilterUI();
    window.renderRecipeBrowser();
    // Mäter kostnaden för att bygga Recept-fliken vid boot fast den är dold
    // (åtgärd A4 i docs/prestanda-plan-2026-09.md ska kunna bevisas).
    window.perfMark?.('receptvy');
    window.initDatePickers();
  } catch (err) {
    // F162: dela vilo-läget med Idag-vyn (default-flik) — den här katastrof-UI:n
    // sitter inuti #receptView, som är dold på startskärmen och aldrig syns.
    window._dbResting = err.message === DB_RESTING_MESSAGE;
    const loading = document.getElementById('loadingState');
    loading.innerHTML = `
      <div style="font-size:2rem;margin-bottom:1rem">⚠️</div>
      <p style="color:var(--rust)"></p>
      <button type="button" class="empty-reset-btn" onclick="location.reload()">Prova igen</button>`;
    loading.querySelector('p').textContent = err.message;
  } finally {
    recipesReady();
  }
}

// Sidfotens receptantal. Delas med recipe-editor.js (ny/raderad receptpost).
function syncRecipeCount() {
  const el = document.getElementById('footerCount');
  if (el) el.textContent = `Receptboken · ${window.RECIPES.length} recept`;
}
window.syncRecipeCount = syncRecipeCount;

// Logga ut — diskret i sidfoten, alltid bakom en bekräftelse (barnhänder).
document.getElementById('signOutBtn')?.addEventListener('click', async () => {
  const ok = await window.confirmDialog({
    title: 'Logga ut?',
    message: 'Du loggas ut från Receptboken på den här enheten. Familjens matsedel och listor finns kvar.',
    confirmLabel: 'Logga ut',
    cancelLabel: 'Avbryt',
  });
  if (ok) await signOut();
});

// Event listeners
const searchInput = document.getElementById('search');
const searchClear = document.getElementById('searchClear');
function updateSearchClear() {
  searchClear.classList.toggle('hidden', searchInput.value.length === 0);
}
window.updateSearchClear = updateSearchClear;
// Debounce själva omritningen: X-knappen uppdateras direkt, men listan byggs
// om först när användaren slutat skriva (~140ms) — annars fryser varje tangent.
let searchDebounce = null;
searchInput.addEventListener('input', () => {
  updateSearchClear();
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => window.renderRecipeBrowser(), 140);
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  updateSearchClear();
  clearTimeout(searchDebounce);
  window.renderRecipeBrowser();
  searchInput.focus();
});

// ── Bottom-sheets (Sortera, Filter, genereringsguiden, dagväljaren, butiksval) ──
// iOS-säker scroll-lock: spara scrollY, fixa body, återställ vid stängning.
let openSheetCount = 0;

function openSheet(id) {
  const sheet = document.getElementById(id);
  // Idempotent per sheet: openStorePicker() anropas även inifrån den öppna
  // butiksväljaren (Tillbaka/efter koppling) — utan spärren räknades låset upp
  // två gånger och body fastnade som position:fixed efter stängning.
  if (sheet.classList.contains('open')) return;
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
  pushSheetHistory();
}

function closeSheet(id) {
  const sheet = document.getElementById(id);
  const wasOpen = sheet.classList.contains('open');
  // Redan stängd (t.ex. Escape inom 280 ms, eller guiden stängd under
  // genereringen) — rör varken räknaren eller scroll-låset.
  if (!wasOpen) return;
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
  setTimeout(() => { if (!sheet.classList.contains('open')) sheet.hidden = true; }, 280);
  popSheetHistory();
}

window.openBottomSheet  = openSheet;   // delas med plan-generator.js (planSheet), day-picker.js (shopDaysSheet) och dispatch-ui.js (shopStoreSheet)
window.closeBottomSheet = closeSheet;

// ── Back-button / history-integration för sheets & modaler (F196) ──────────
// PWA-fälla: utan detta gjorde Android bakåtknapp/gest ingenting alls medan en
// sheet var öppen — appen lämnades eller inget synligt hände, mitt i t.ex.
// genereringsguiden. Vi pushar ett neutralt history-state när en sheet öppnas
// och en enda popstate-lyssnare stänger vad som än råkar vara öppet, i
// stället för att navigera bort. DOM-driven (kollar vad som faktiskt syns)
// snarare än en egen stack — säkrare mot att tappa synk med UI-stängning
// (X-knapp, backdrop, Escape, spara-flöden). Delas via window.pushSheetHistory
// /popSheetHistory så dlx-sheeten (plan-viewer-deluxe.js) kan haka på utan att
// äga sin egen historik-logik.
let closingFromPopstate = false;

function pushSheetHistory() {
  history.pushState({ receptbokSheet: true }, '');
}

// Anropas av stängningskoden (X, backdrop, Escape, spara-flöden) — konsumerar
// den pushade historik-posten så bakåtknappen inte behöver tryckas två gånger.
// No-op om stängningen redan orsakades av en back-navigering (se popstate
// nedan) eller om det inte fanns någon pushad historik-post kvar.
function popSheetHistory() {
  if (closingFromPopstate) return;
  if (history.state?.receptbokSheet) history.back();
}

const SHEET_IDS = ['filterSheet', 'planSheet', 'shopDaysSheet', 'shopStoreSheet'];

function closeAnyOpenSheet() {
  if (document.getElementById('dlxSheet')?.classList.contains('open')) { window.dlxCloseSheet?.(); return; }
  // Receptdetaljen i helskärm (mobil) stängs av bakåtknappen som en sheet.
  if (document.getElementById('receptView')?.classList.contains('rv-detail-open')) { window.closeRecipeDetail?.(); return; }
  if (document.getElementById('shopSide')?.classList.contains('open')) { window.closeShopSide?.(); return; }
  for (const id of SHEET_IDS) {
    const s = document.getElementById(id);
    if (s && s.classList.contains('open')) { closeSheet(id); return; }
  }
}

window.addEventListener('popstate', () => {
  closingFromPopstate = true;
  try { closeAnyOpenSheet(); } finally { closingFromPopstate = false; }
});

window.pushSheetHistory = pushSheetHistory;
window.popSheetHistory  = popSheetHistory;

document.getElementById('openFilterBtn').addEventListener('click', () => openSheet('filterSheet'));

document.body.addEventListener('click', e => {
  const close = e.target.closest('[data-sheet-close]');
  if (close) closeSheet(close.dataset.sheetClose);
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  SHEET_IDS.forEach(id => {
    const s = document.getElementById(id);
    if (s && !s.hidden) closeSheet(id);
  });
});

// Taggar som redan täcks av andra filterdimensioner — exkluderas från tagg-UI
const EXCLUDED_TAGS = new Set([
  'vardag30', 'helg60', 'snabb30', 'vardag', 'doh', 'veg', 'vegetarisk',
  'fisk', 'kyckling', 'kött', 'fläsk', 'tofu',
  'italienskt', 'mexikanskt', 'medelhavet', 'mellanöstern', 'indiskt',
  'thailändskt', 'japanskt', 'koreanskt', 'kinesiskt', 'vietnamesiskt',
  'asiatiskt', 'franskt',
]);

function buildTagFilterUI() {
  const counts = {};
  for (const r of window.RECIPES) {
    for (const t of r.tags) {
      const low = t.toLowerCase();
      if (EXCLUDED_TAGS.has(low)) continue;
      counts[low] = (counts[low] || 0) + 1;
    }
  }
  const sorted = Object.entries(counts).sort((a, b) => svCompare(a[0], b[0]));
  if (sorted.length === 0) return;

  const container = document.getElementById('tagFilterChecks');
  container.innerHTML = sorted.map(([tag, count]) =>
    `<label class="bs-check"><input type="checkbox" data-fgroup="tags" value="${escapeHtml(tag)}"><span>${escapeHtml(tag)} (${count})</span></label>`
  ).join('');

  document.getElementById('tagFilterGroup').style.display = '';

  container.querySelectorAll('input[type="checkbox"]').forEach(c => {
    c.addEventListener('change', () => {
      const set = window.recipeFilters.tags;
      if (c.checked) set.add(c.value); else set.delete(c.value);
      updateFilterDot();
      window.renderRecipeBrowser();
    });
  });
}

// Filter: checkbox change (statiska filter: tested, mainIngredient, time, season)
document.querySelectorAll('#filterSheet input[type="checkbox"]').forEach(c => {
  c.addEventListener('change', () => {
    const set = window.recipeFilters[c.dataset.fgroup];
    if (c.checked) set.add(c.value); else set.delete(c.value);
    updateFilterDot();
    window.renderRecipeBrowser();
  });
});

function clearRecipeFilters() {
  for (const k of Object.keys(window.recipeFilters)) window.recipeFilters[k].clear();
  document.querySelectorAll('#filterSheet input[type="checkbox"]').forEach(c => { c.checked = false; });
  updateFilterDot();
}

document.getElementById('filterClearBtn').addEventListener('click', () => {
  clearRecipeFilters();
  window.renderRecipeBrowser();
});

function updateFilterDot() {
  const f = window.recipeFilters;
  const any = f.tested.size + f.mainIngredient.size + f.time.size + f.tags.size + f.season.size > 0;
  document.getElementById('filterDot').hidden = !any;
}

// "Rensa sökning och filter"-knapp i empty state — tomläget kan lika gärna
// bero på filtren som på sökningen, så nolla båda.
document.getElementById('emptyState').addEventListener('click', e => {
  if (e.target.closest('.empty-reset-btn')) {
    searchInput.value = '';
    updateSearchClear();
    clearTimeout(searchDebounce);
    clearRecipeFilters();
    window.renderRecipeBrowser();
  }
});

async function boot() {
  // Sent installerade perf-hooks: wrappar window.switchTab YTTERST, efter att
  // premiumvyn och Idag-fliken lagt sina egna wrappers.
  window.perfInstallLateHooks?.();
  await requireAuth();
  window.perfMark?.('auth');
  await init();   // startar även matsedelsladdningen (parallellt med recepten, se init)
  // Batch C2: Listor-fliken förhämtas när huvudtråden har tid (2 frågor), så
  // första flikbytet är momentant. Inköp förhämtas redan av Idag-vyn (shopState).
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  idle(() => { if (!window._listsLoadedAt) Promise.resolve(window.loadListsTab?.()).catch(() => {}); });

  // Deep-link via query param: ?tab=recept|vecka|shop|listor
  const tabParam = new URLSearchParams(window.location.search).get('tab');
  if (tabParam && ['recept', 'vecka', 'shop', 'listor'].includes(tabParam)) {
    window.switchTab(tabParam);
  }

  // PWA: service worker cachar appskalet så appen öppnar direkt och funkar
  // utan nät (data hämtas fortfarande live från Supabase när nät finns).
  // Relativ sökväg → fungerar både på Vercel (rot) och GitHub Pages (underkatalog).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => { /* offline-stöd är bara bonus */ });
  }
}

boot();
