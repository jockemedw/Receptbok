// Inköpslista: rendering, bockning, manuella varor, copy-läge.
// Läser state: _shopListId, _shopItemIds, _checkedItems, _checkedSaveTimer, _shopRecipeItems, _shopManualItems
// Skriver state: _shopListId, _shopItemIds, _checkedItems, _checkedSaveTimer, _shopRecipeItems, _shopManualItems

import { CAT_ICONS, escapeHtml, fmtIso } from '../utils.js';

// Kanonisk kategoriordning (samma som inköpslistan byggs i) — håller ordningen
// stabil oavsett i vilken ordning DB-raderna råkar komma tillbaka.
const CATEGORY_ORDER = ['Mejeri', 'Grönsaker', 'Fisk & kött', 'Frukt', 'Skafferi', 'Övrigt'];
function sortCategories(cats) {
  return cats.slice().sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, 'sv');
  });
}

// ── Realtime-prenumeration för inköpsvaror ────────────────────────────────────
let _shopChannel = null;

function unsubscribeShoppingItems() {
  if (_shopChannel) {
    window.db.removeChannel(_shopChannel);
    _shopChannel = null;
  }
}

function subscribeShoppingItems(listId) {
  unsubscribeShoppingItems();
  if (!listId) return;
  _shopChannel = window.db
    .channel(`shopping_items:${listId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter: `list_id=eq.${listId}` }, (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload;
      if (eventType === 'UPDATE' && newRow?.source === 'recipe') {
        // Riktad DOM-uppdatering för receptvaror (undviker full reload)
        const key = Object.keys(window._shopItemIds || {}).find(k => window._shopItemIds[k] === newRow.id);
        if (!key) return;
        const serverChecked = newRow.checked === true;
        if (window._checkedItems[key] === serverChecked) return; // redan rätt
        window._checkedItems[key] = serverChecked;
        if (serverChecked) window._checkSeq[key] = window._checkSeqNext++;
        else delete window._checkSeq[key];
        if (window._handlaMode) {
          // handla-läge: bockade varor byter plats (upp/ner under strecket) → rendera om
          renderFullShoppingList(window._shopRecipeItems, window._shopManualItems);
        } else {
          const el = document.querySelector(`.shopping-item[onclick*="${key}"]`);
          if (el) {
            el.classList.toggle('checked', serverChecked);
            el.querySelector('.item-checkbox').textContent = serverChecked ? '✓' : '';
          }
        }
        rebuildShopText();
        updateShopProgress();
      } else if (eventType === 'DELETE') {
        // Borttagen vara → ta bort på plats (bevarar ordning, ingen omladdning).
        // Lokala borttagningar är redan hanterade → då blir detta en no-op.
        if (oldRow?.id != null) applyRemovalById(oldRow.id);
        else { window._preserveChecked = false; loadShoppingTab(); }
      } else {
        // Ny vara eller manuell vara ändrad → ladda om
        window._preserveChecked = false;
        loadShoppingTab();
      }
    })
    .subscribe();
}

// Rekonstruerar frontend-state från Supabase-rader.
// Nycklar baseras på kompakt index (0..n) per kategori — matchar renderingens
// index och håller bocknings-state rätt även efter att en vara tagits bort
// (då blir det luckor i `position`-kolumnen i DB).
function buildShopState(list, items) {
  const recipeRows = {};   // kategori → rader
  const manualRows = [];
  for (const row of items) {
    if (row.source === 'recipe') (recipeRows[row.category] ||= []).push(row);
    else if (row.source === 'manual') manualRows.push(row);
  }

  const recipeItems = {};
  const checkedItems = {};
  const itemIds = {};

  for (const cat of sortCategories(Object.keys(recipeRows))) {
    const sorted = recipeRows[cat].slice().sort((a, b) => a.position - b.position);
    recipeItems[cat] = [];
    sorted.forEach((row, idx) => {
      recipeItems[cat].push(row.name);
      const key = `recipe::${cat}::${idx}`;
      checkedItems[key] = row.checked === true;
      itemIds[key] = row.id;
    });
  }

  const manualSorted = manualRows.slice().sort((a, b) => a.position - b.position);
  const manualItems = manualSorted.map((row) => row.name);
  manualSorted.forEach((row, idx) => {
    const key = `manual::${idx}`;
    checkedItems[key] = row.checked === true;
    itemIds[key] = row.id;
  });

  return { recipeItems, manualItems, checkedItems, itemIds };
}

const ICON_NOTE = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h11l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 11h8 M8 14h8 M8 17h5"/></svg>';
const ICON_HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/></svg>';
const ICON_DRAG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';

// ── Skafferi/"har hemma" (backlog #13) ───────────────────────────────────────
// Markerade varor visas dämpade (inte borttagna), räknas inte i "X av Y" och
// följer inte med i kopierad text. Minnet ligger i Supabase-tabellen
// pantry_items per NORMALISERAT varunamn ("grädde (2 dl)" → "grädde") så
// markeringen överlever veckans nya lista. Tabellen skapas av
// db/migrations/002_pantry_items.sql — saknas den göms funktionen helt.

// Varunamn → skafferi-nyckel: stryk mängdparentesen ("(2 dl)") och normalisera.
function pantryKey(name) {
  return String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
}

function isPantryName(name) {
  return window._pantrySupported && window._pantryItems?.has(pantryKey(name));
}

async function loadPantry(householdId) {
  try {
    const { data, error } = await window.db
      .from('pantry_items')
      .select('name')
      .eq('household_id', householdId);
    if (error) throw error;
    window._pantrySupported = true;
    window._pantryItems = new Set((data || []).map((r) => r.name));
  } catch {
    // Tabellen saknas (migration 002 ej körd) eller nätfel → göm funktionen
    // den här laddningen. Ingen regression mot dagens beteende.
    window._pantrySupported = false;
    window._pantryItems = new Set();
  }
}

export async function togglePantryItem(name) {
  if (!window._pantrySupported) return;
  const key = pantryKey(name);
  if (!key) return;
  const had = window._pantryItems.has(key);
  // Optimistiskt: uppdatera vyn direkt, återställ vid fel.
  if (had) window._pantryItems.delete(key); else window._pantryItems.add(key);
  renderFullShoppingList(window._shopRecipeItems || null, window._shopManualItems || []);
  try {
    const householdId = await window.getHouseholdId();
    if (had) {
      const { error } = await window.db.from('pantry_items')
        .delete().eq('household_id', householdId).eq('name', key);
      if (error) throw error;
    } else {
      const { error } = await window.db.from('pantry_items')
        .upsert({ household_id: householdId, name: key });
      if (error) throw error;
    }
  } catch {
    if (had) window._pantryItems.add(key); else window._pantryItems.delete(key);
    renderFullShoppingList(window._shopRecipeItems || null, window._shopManualItems || []);
    window.showToast?.('Kunde inte spara "har hemma"-markeringen — prova igen.', { type: 'error' });
  }
}

// Knappen på varje rad (bara när tabellen finns). data-name undviker
// escaping-fällor i inline-onclick.
function pantryBtnHtml(name) {
  if (!window._pantrySupported) return '';
  const active = isPantryName(name);
  return `<button class="pantry-btn${active ? ' active' : ''}" data-name="${escapeHtml(name)}"
            title="${active ? 'Har hemma — tryck för att lägga tillbaka i listan' : 'Har hemma — behöver inte köpas'}"
            aria-label="${active ? 'Ta bort har hemma-markering' : 'Markera som har hemma'}" aria-pressed="${active}"
            onclick="event.stopPropagation();togglePantryItem(this.dataset.name)">${ICON_HOME}</button>`;
}

export function setShopMode(mode) {
  const isHandla = mode === 'handla';
  document.getElementById('modeBtnHandla').classList.toggle('active', isHandla);
  document.getElementById('modeBtnText').classList.toggle('active', !isHandla);
  document.getElementById('shoppingList').style.display = isHandla ? '' : 'none';
  document.getElementById('shoppingText').classList.toggle('visible', !isHandla);
  // Redigera-läget hör bara hemma i handla-vyn
  const editBar = document.getElementById('shopEditBar');
  if (editBar) editBar.style.display = isHandla ? '' : 'none';
  if (!isHandla && window._editMode) toggleEditMode();
}

// Handla-läge: bockade varor sjunker ner under ett streck ("I korgen"),
// sorterade med senast ibockade överst. En ren vy-preferens (in-memory,
// nollställs vid omladdning) — själva bock-statusen ligger kvar i Supabase.
export function toggleHandlaMode() {
  window._handlaMode = !window._handlaMode;
  const btn = document.getElementById('handlaModeBtn');
  if (btn) {
    btn.classList.toggle('active', window._handlaMode);
    btn.setAttribute('aria-pressed', window._handlaMode ? 'true' : 'false');
  }
  renderFullShoppingList(window._shopRecipeItems || null, window._shopManualItems || []);
}

// Redigera-läge: visar en ×-knapp på varje vara så att man kan ta bort den helt
// (inte bara bocka av den som köpt).
export function toggleEditMode() {
  window._editMode = !window._editMode;
  const list = document.getElementById('shoppingList');
  const btn  = document.getElementById('editModeBtn');
  if (list) list.classList.toggle('editing', window._editMode);
  if (btn) {
    btn.classList.toggle('active', window._editMode);
    btn.textContent = window._editMode ? '✓ Klar' : '✎ Redigera';
  }
  // Re-rendera så varornas text växlar mellan etikett och redigerbart fält
  if (window._shopRecipeItems || (window._shopManualItems && window._shopManualItems.length)) {
    renderFullShoppingList(window._shopRecipeItems || null, window._shopManualItems || []);
  }
}

// Tar bort en vara ur in-memory-state och re-renderar från minnet — ingen
// DB-omladdning. Bevarar kategoriordningen och kräver ingen sid-omladdning.
// Re-keyar receptvarornas index kontigerligt så bock-state förblir korrekt.
// Returnerar true om varan fanns (annars no-op, t.ex. redan borttagen).
function applyRemovalById(id) {
  if (id == null) return false;
  const recipeItems = {};
  const checkedItems = {};
  const itemIds = {};
  let found = false;

  for (const cat of Object.keys(window._shopRecipeItems || {})) {
    const names = window._shopRecipeItems[cat] || [];
    const kept = [];
    names.forEach((name, i) => {
      const oldKey = `recipe::${cat}::${i}`;
      const rowId = window._shopItemIds?.[oldKey];
      if (rowId === id) { found = true; return; }
      kept.push({ name, checked: window._checkedItems?.[oldKey] || false, rowId });
    });
    if (kept.length) {
      recipeItems[cat] = kept.map((x) => x.name);
      kept.forEach((x, newIdx) => {
        const k = `recipe::${cat}::${newIdx}`;
        checkedItems[k] = x.checked;
        itemIds[k] = x.rowId;
      });
    }
  }

  const manualItems = [];
  (window._shopManualItems || []).forEach((name, i) => {
    const rowId = window._shopItemIds?.[`manual::${i}`];
    if (rowId === id) { found = true; return; }
    itemIds[`manual::${manualItems.length}`] = rowId;
    manualItems.push(name);
  });
  // Manuella bock-nycklar är textbaserade i renderingen — bevara dem
  for (const name of manualItems) {
    const tk = `manual::${name}`;
    if (window._checkedItems?.[tk] !== undefined) checkedItems[tk] = window._checkedItems[tk];
  }

  if (!found) return false;

  window._checkedItems = checkedItems;
  window._shopItemIds  = itemIds;
  renderFullShoppingList(Object.keys(recipeItems).length ? recipeItems : null, manualItems);
  return true;
}

// Tar bort en vara med Ångra-möjlighet: raden hämtas före borttagningen och kan
// återskapas från toast-knappen. Ingen omladdning — ordningen bevaras.
async function deleteWithUndo(id) {
  const { data: row, error: readErr } = await window.db
    .from('shopping_items').select('*').eq('id', id).maybeSingle();
  if (readErr || !row) throw readErr || new Error('rad saknas');
  const { error } = await window.db.from('shopping_items').delete().eq('id', id);
  if (error) throw error;
  applyRemovalById(id);
  updateShopProgress();
  window.showToast(`${row.name} borttagen`, {
    type: 'success',
    action: {
      label: 'Ångra',
      onClick: async () => {
        try {
          const { id: _omit, ...fields } = row;
          const { error: insErr } = await window.db.from('shopping_items').insert(fields);
          if (insErr) throw insErr;
          window._preserveChecked = true;
          loadShoppingTab();
        } catch {
          window.showToast('Kunde inte ångra — lägg till varan manuellt.', { type: 'error' });
        }
      },
    },
  });
}

export async function removeShopItem(key) {
  const id = window._shopItemIds?.[key];
  if (!id) { window.showToast('Kunde inte ta bort varan — prova igen.', { type: 'error' }); return; }
  try {
    await deleteWithUndo(id);
  } catch {
    window.showToast('Kunde inte ta bort varan — prova igen.', { type: 'error' });
  }
}

export function scheduleCheckedSave() {
  clearTimeout(window._checkedSaveTimer);
  window._checkedSaveTimer = setTimeout(async () => {
    if (!window._shopItemIds) return;
    const checkedIds   = [];
    const uncheckedIds = [];
    for (const [key, id] of Object.entries(window._shopItemIds)) {
      if (window._checkedItems[key]) checkedIds.push(id);
      else uncheckedIds.push(id);
    }
    try {
      const ps = [];
      if (checkedIds.length)   ps.push(window.db.from('shopping_items').update({ checked: true  }).in('id', checkedIds));
      if (uncheckedIds.length) ps.push(window.db.from('shopping_items').update({ checked: false }).in('id', uncheckedIds));
      await Promise.all(ps);
    } catch {
      // Nästa bockning försöker igen, men säg till så en ensam bockning inte
      // tappas tyst om appen stängs innan dess.
      window.showToast?.('Kunde inte spara bockningen — kolla nätet och prova igen.', { type: 'error' });
    }
  }, 600);
}

export function toggleShopItem(el, key) {
  if (window._editMode) return;   // i redigera-läget gör radklick inget — bara × tar bort
  if (el.classList.contains('pantry')) return;   // "har hemma"-vara bockas inte — den handlas inte
  const nowChecked = !window._checkedItems[key];
  window._checkedItems[key] = nowChecked;
  if (nowChecked) window._checkSeq[key] = window._checkSeqNext++;
  else delete window._checkSeq[key];
  if (window._handlaMode) {
    // handla-läge: den avbockade varan ska sjunka ner under strecket (eller
    // dyka upp igen om man avmarkerar) → rendera om hela listan.
    renderFullShoppingList(window._shopRecipeItems, window._shopManualItems);
  } else {
    el.classList.toggle('checked', nowChecked);
    el.querySelector('.item-checkbox').textContent = nowChecked ? '✓' : '';
    rebuildShopText();
  }
  updateShopProgress();
  scheduleCheckedSave();
}

// ── Progress: "X av Y klara" + räknare per kategori ──────────────────────────
// Räknar från in-memory-state och uppdaterar DOM på plats (ingen re-render).
function shopCounts() {
  // "Har hemma"-varor står utanför räkningen — de ska inte handlas.
  let total = 0, done = 0;
  const perCat = {};
  for (const [cat, items] of Object.entries(window._shopRecipeItems || {})) {
    const c = { total: 0, done: 0 };
    items.forEach((item, idx) => {
      if (isPantryName(item)) return;
      c.total++;
      if (window._checkedItems[`recipe::${cat}::${idx}`]) c.done++;
    });
    perCat[cat] = c;
    total += c.total; done += c.done;
  }
  const manual = window._shopManualItems || [];
  if (manual.length) {
    const c = { total: 0, done: 0 };
    manual.forEach((item) => {
      if (isPantryName(item)) return;
      c.total++;
      if (window._checkedItems[`manual::${item}`]) c.done++;
    });
    perCat['__manual'] = c;
    total += c.total; done += c.done;
  }
  return { total, done, perCat };
}

const RING_C = 2 * Math.PI * 26; // omkrets för r=26 i 60×60-viewBoxen

export function updateShopProgress() {
  const { total, done, perCat } = shopCounts();
  const ring  = document.querySelector('#shopProgress .shop-ring-fill');
  const count = document.querySelector('#shopProgress .shop-ring-count');
  const lbl   = document.querySelector('#shopProgress .shop-progress-label');
  const sub   = document.querySelector('#shopProgress .shop-progress-sub');
  if (ring)  ring.style.strokeDashoffset = (total ? RING_C * (1 - done / total) : RING_C).toFixed(1);
  if (count) count.textContent = done;
  if (lbl) lbl.textContent = total
    ? (done >= total ? 'Allt klart! 🎉' : `${done} av ${total} klara`)
    : '';
  if (sub) sub.textContent = total
    ? (done >= total ? 'hela listan är i korgen' : `${total - done} kvar att plocka`)
    : '';
  document.querySelectorAll('#shopProgress, .shop-progress').forEach(el =>
    el.classList.toggle('complete', total > 0 && done >= total));
  document.querySelectorAll('.shopping-cat-count[data-cat]').forEach(el => {
    const c = perCat[el.dataset.cat];
    if (c) el.textContent = `${c.done} av ${c.total}`;
  });
}

function shopProgressHtml() {
  const { total, done } = shopCounts();
  if (!total) return '';
  const off = (RING_C * (1 - done / total)).toFixed(1);
  return `<div id="shopProgress" class="shop-progress${done >= total ? ' complete' : ''}">
    <span class="shop-ring" aria-hidden="true">
      <svg viewBox="0 0 60 60">
        <circle class="shop-ring-track" cx="30" cy="30" r="26"/>
        <circle class="shop-ring-fill" cx="30" cy="30" r="26"
                stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${off}"/>
      </svg>
      <span class="shop-ring-count">${done}</span>
    </span>
    <span class="shop-progress-txt">
      <span class="shop-progress-label">${done >= total ? 'Allt klart! 🎉' : `${done} av ${total} klara`}</span>
      <span class="shop-progress-sub">${done >= total ? 'hela listan är i korgen' : `${total - done} kvar att plocka`}</span>
    </span>
  </div>`;
}

// Textcell för en vara: redigerbart fält i redigera-läge, annars vanlig text.
// Namnet escapas alltid (varorna är användarredigerbara → XSS-skydd).
function itemTextCell(name, rowId) {
  if (window._editMode) {
    const v = escapeHtml(name);
    return `<input class="item-edit-input" type="text" value="${v}" data-id="${rowId ?? ''}" data-orig="${v}"
              onclick="event.stopPropagation()"
              onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
              onchange="renameShopItem(this)">`;
  }
  return `<span class="item-text">${escapeHtml(name)}</span>`;
}

// Byt namn på en vara (i redigera-läge). Uppdaterar DB + minne utan omladdning.
export async function renameShopItem(inputEl) {
  const id = inputEl.dataset.id;            // shopping_items.id är en UUID-sträng
  const orig = inputEl.dataset.orig || '';
  const newName = inputEl.value.trim();
  if (!id || !newName || newName === orig) { inputEl.value = newName || orig; return; }

  // Uppdatera minnet direkt (optimistiskt) så en efterföljande re-render — t.ex.
  // när man trycker "✓ Klar" — visar det nya namnet och inte snäpper tillbaka.
  inputEl.dataset.orig = newName;
  const wasManual = updateNameInMemory(id, newName);
  if (wasManual) renderFullShoppingList(window._shopRecipeItems, window._shopManualItems);
  else rebuildShopText();

  try {
    const { error } = await window.db.from('shopping_items').update({ name: newName }).eq('id', id);
    if (error) throw error;
  } catch {
    // Återställ vid fel
    updateNameInMemory(id, orig);
    inputEl.dataset.orig = orig;
    if (document.body.contains(inputEl)) inputEl.value = orig;
    if (wasManual) renderFullShoppingList(window._shopRecipeItems, window._shopManualItems);
    else rebuildShopText();
    window.showToast('Kunde inte ändra varan — prova igen.', { type: 'error' });
  }
}

// Uppdaterar varans namn i in-memory-state. Returnerar true om den var manuell.
function updateNameInMemory(id, newName) {
  const key = Object.keys(window._shopItemIds || {}).find(k => window._shopItemIds[k] === id);
  if (!key) return false;
  const rm = key.match(/^recipe::(.+)::(\d+)$/);
  if (rm) {
    const cat = rm[1], idx = parseInt(rm[2], 10);
    if (window._shopRecipeItems?.[cat]) window._shopRecipeItems[cat][idx] = newName;
    return false;
  }
  const mm = key.match(/^manual::(\d+)$/);
  if (mm) {
    const idx = parseInt(mm[1], 10);
    const oldName = window._shopManualItems?.[idx];
    if (window._shopManualItems) window._shopManualItems[idx] = newName;
    if (oldName != null && oldName !== newName) {
      const oldK = `manual::${oldName}`, newK = `manual::${newName}`;
      if (window._checkedItems?.[oldK] !== undefined) {
        window._checkedItems[newK] = window._checkedItems[oldK];
        delete window._checkedItems[oldK];
      }
    }
    return true;
  }
  return false;
}

export function rebuildShopText() {
  let textParts = [];
  let textBlocksHtml = '';

  if (window._shopRecipeItems) {
    const recipeText = Object.entries(window._shopRecipeItems)
      .filter(([, items]) => items.length > 0)
      .map(([cat, items]) => {
        const unchecked = items.filter((item, idx) => !window._checkedItems[`recipe::${cat}::${idx}`] && !isPantryName(item));
        return unchecked.length ? `${cat}:\n${unchecked.map(i => '• ' + i).join('\n')}` : null;
      }).filter(Boolean).join('\n\n');
    if (recipeText) textParts.push(recipeText);

    textBlocksHtml += Object.entries(window._shopRecipeItems)
      .filter(([, items]) => items.length > 0)
      .map(([cat, items]) => {
        const unchecked = items.filter((item, idx) => !window._checkedItems[`recipe::${cat}::${idx}`] && !isPantryName(item));
        if (!unchecked.length) return '';
        return `<div class="shop-text-category">
          <div class="shop-text-cat-name">${CAT_ICONS[cat] || '•'} ${cat}</div>
          <div class="shop-text-items">${unchecked.map(i => '• ' + escapeHtml(i)).join('\n')}</div>
        </div>`;
      }).join('');
  }

  const uncheckedManual = window._shopManualItems.filter((item) => !window._checkedItems[`manual::${item}`] && !isPantryName(item));
  if (uncheckedManual.length) {
    textParts.push(`Egna tillägg:\n${uncheckedManual.map(i => '• ' + i).join('\n')}`);
    textBlocksHtml += `<div class="shop-text-category">
      <div class="shop-text-cat-name">${ICON_NOTE} Egna tillägg</div>
      <div class="shop-text-items">${uncheckedManual.map(i => '• ' + escapeHtml(i)).join('\n')}</div>
    </div>`;
  }

  const textEl = document.getElementById('shoppingText');
  textEl.innerHTML = textBlocksHtml +
    `<button class="shop-copy-btn" onclick="copyShoppingList()">Kopiera hela listan</button>`;
  textEl._fullText = textParts.join('\n\n');
}

// ── Rad-byggare (delas av kategori-vyn och handla-lägets "I korgen"-sektion) ──
// Receptvara: bock-nyckeln bakas in i onclick (realtime-selektorn matchar på den).
function recipeItemLi(cat, idx, name) {
  const key     = `recipe::${cat}::${idx}`;
  const pantry  = isPantryName(name);
  const checked = !pantry && (window._checkedItems[key] || false);
  const rowId   = window._shopItemIds?.[key];
  return `<li class="shopping-item${checked ? ' checked' : ''}${pantry ? ' pantry' : ''}"
              onclick="toggleShopItem(this,'${key}')">
    <span class="item-checkbox">${checked ? '✓' : ''}</span>
    ${itemTextCell(name, rowId)}
    ${pantry ? '<span class="pantry-tag">har hemma</span>' : ''}
    ${pantryBtnHtml(name)}
    <button class="remove-item-btn" data-key="${key}" title="Ta bort varan"
            onclick="event.stopPropagation();removeShopItem(this.dataset.key)">×</button>
  </li>`;
}

// Egen vara: bock-nyckeln är textbaserad (namnet). I redigera-läget får den
// dessutom ett draghandtag för att byta ordning (drag-and-drop).
function manualItemLi(idx, name) {
  const key     = `manual::${name}`;
  const pantry  = isPantryName(name);
  const checked = !pantry && (window._checkedItems[key] || false);
  const rowId   = window._shopItemIds?.[`manual::${idx}`];
  const handle  = `<button class="drag-handle" title="Dra för att byta ordning" aria-label="Dra för att byta ordning"
              onpointerdown="startManualDrag(event, this)" onclick="event.stopPropagation()">${ICON_DRAG}</button>`;
  return `<li class="shopping-item${checked ? ' checked' : ''}${pantry ? ' pantry' : ''}"
              data-key="${escapeHtml(key)}" data-manual-idx="${idx}"
              onclick="toggleShopItem(this,this.dataset.key)">
    <span class="item-checkbox">${checked ? '✓' : ''}</span>
    ${itemTextCell(name, rowId)}
    ${pantry ? '<span class="pantry-tag">har hemma</span>' : ''}
    ${pantryBtnHtml(name)}
    ${handle}
    <button class="remove-item-btn" data-item="${escapeHtml(name)}" title="Ta bort varan" onclick="event.stopPropagation();removeManualItem(this.dataset.item)">×</button>
  </li>`;
}

export function renderFullShoppingList(recipeItems, manualItems) {
  window._shopRecipeItems = recipeItems;
  window._shopManualItems = manualItems;
  let checkHtml = '';
  let textParts = [];
  let textBlocksHtml = '';
  const handla = window._handlaMode === true;
  const doneItems = [];   // handla-läge: bockade varor samlas här → visas under strecket

  if (recipeItems) {
    checkHtml += Object.entries(recipeItems)
      .filter(([, items]) => items.length > 0)
      .map(([cat, items]) => {
        const icon = CAT_ICONS[cat] || '•';
        const itemsHtml = items.map((item, idx) => {
          const key = `recipe::${cat}::${idx}`;
          // handla-läge: bockade (ej pantry) flyttas till "I korgen"-sektionen
          if (handla && !isPantryName(item) && window._checkedItems[key]) {
            doneItems.push({ seq: window._checkSeq[key] || 0, html: recipeItemLi(cat, idx, item) });
            return '';
          }
          return recipeItemLi(cat, idx, item);
        }).join('');
        // handla-läge: dölj kort där allt är bockat (inget kvar att plocka)
        if (handla && !itemsHtml.trim()) return '';
        const catTotal = items.filter((item) => !isPantryName(item)).length;
        const catDone = items.filter((item, idx) => !isPantryName(item) && window._checkedItems[`recipe::${cat}::${idx}`]).length;
        return `<div class="shopping-category">
          <div class="shopping-cat-header">
            <span class="shopping-cat-name">${icon} ${cat}</span>
            <span class="shopping-cat-count" data-cat="${cat}">${catDone} av ${catTotal}</span>
          </div>
          <ul class="shopping-items">${itemsHtml}</ul>
        </div>`;
      }).join('');

    const recipeText = Object.entries(recipeItems)
      .filter(([, items]) => items.length > 0)
      .map(([cat, items]) => {
        const unchecked = items.filter((item, idx) => !window._checkedItems[`recipe::${cat}::${idx}`] && !isPantryName(item));
        return unchecked.length ? `${cat}:\n${unchecked.map(i => '• ' + i).join('\n')}` : null;
      }).filter(Boolean).join('\n\n');
    if (recipeText) textParts.push(recipeText);

    textBlocksHtml += Object.entries(recipeItems)
      .filter(([, items]) => items.length > 0)
      .map(([cat, items]) => {
        const unchecked = items.filter((item, idx) => !window._checkedItems[`recipe::${cat}::${idx}`] && !isPantryName(item));
        if (!unchecked.length) return '';
        return `<div class="shop-text-category">
          <div class="shop-text-cat-name">${CAT_ICONS[cat] || '•'} ${cat}</div>
          <div class="shop-text-items">${unchecked.map(i => '• ' + escapeHtml(i)).join('\n')}</div>
        </div>`;
      }).join('');
  }

  if (manualItems.length > 0) {
    const manualHtml = manualItems.map((item, idx) => {
      // handla-läge: bockade (ej pantry) flyttas till "I korgen"-sektionen
      if (handla && !isPantryName(item) && window._checkedItems[`manual::${item}`]) {
        doneItems.push({ seq: window._checkSeq[`manual::${item}`] || 0, html: manualItemLi(idx, item) });
        return '';
      }
      return manualItemLi(idx, item);
    }).join('');
    // handla-läge: dölj kortet om alla egna varor är bockade
    if (!(handla && !manualHtml.trim())) {
      const manualTotal = manualItems.filter((item) => !isPantryName(item)).length;
      const manualDone = manualItems.filter((item) => !isPantryName(item) && window._checkedItems[`manual::${item}`]).length;
      checkHtml += `<div class="shopping-category">
        <div class="shopping-cat-header">
          <span class="shopping-cat-name">${ICON_NOTE} Egna tillägg</span>
          <span class="shopping-cat-count" data-cat="__manual">${manualDone} av ${manualTotal}</span>
        </div>
        <ul class="shopping-items">${manualHtml}</ul>
      </div>`;
    }

    const uncheckedManual = manualItems.filter((item) => !window._checkedItems[`manual::${item}`] && !isPantryName(item));
    if (uncheckedManual.length) {
      textParts.push(`Egna tillägg:\n${uncheckedManual.map(i => '• ' + i).join('\n')}`);
      textBlocksHtml += `<div class="shop-text-category">
        <div class="shop-text-cat-name">${ICON_NOTE} Egna tillägg</div>
        <div class="shop-text-items">${uncheckedManual.map(i => '• ' + escapeHtml(i)).join('\n')}</div>
      </div>`;
    }
  }

  // handla-läge: strecket + "I korgen"-sektionen, senast ibockade överst
  if (handla && doneItems.length) {
    doneItems.sort((a, b) => b.seq - a.seq);
    checkHtml += `<div class="shop-done-section">
      <div class="shop-done-divider"><span>I korgen · ${doneItems.length}</span></div>
      <div class="shopping-category">
        <ul class="shopping-items">${doneItems.map((d) => d.html).join('')}</ul>
      </div>
    </div>`;
  }

  document.getElementById('shoppingList').innerHTML = shopProgressHtml() + checkHtml;
  const textEl = document.getElementById('shoppingText');
  textEl.innerHTML = textBlocksHtml +
    `<button class="shop-copy-btn" onclick="copyShoppingList()">Kopiera hela listan</button>`;
  textEl._fullText = textParts.join('\n\n');
}

export async function loadShoppingTab() {
  document.getElementById('shopLoading').style.display  = '';
  document.getElementById('shopContent').style.display  = 'none';
  document.getElementById('shopNoData').style.display   = 'none';
  try {
    const householdId = await window.getHouseholdId();
    const [{ data: lists, error: listErr }] = await Promise.all([
      window.db
        .from('shopping_lists')
        .select('*')
        .eq('household_id', householdId)
        .eq('is_active', true)
        .limit(1),
      loadPantry(householdId),   // "har hemma"-minnet (göms tyst om tabellen saknas)
    ]);
    if (listErr) throw listErr;

    const list = lists?.[0] ?? null;
    let items = [];
    if (list) {
      const { data: rows, error: itemsErr } = await window.db
        .from('shopping_items')
        .select('*')
        .eq('list_id', list.id)
        .order('position');
      if (itemsErr) throw itemsErr;
      items = rows ?? [];
    }

    const hasRecipeItems = !!(list?.recipe_items_moved_at && items.some(i => i.source === 'recipe'));
    const hasManual      = items.some(i => i.source === 'manual');

    document.getElementById('shopLoading').style.display = 'none';
    if (!hasRecipeItems && !hasManual) {
      document.getElementById('shopNoData').style.display = '';
      unsubscribeShoppingItems();
      return;
    }
    document.getElementById('shopContent').style.display = '';
    if (typeof window.initDispatchUI === 'function') window.initDispatchUI();

    const preserveChecked = window._preserveChecked === true;
    window._preserveChecked = false;
    window._shopListId = list.id;
    subscribeShoppingItems(list.id);

    const state = buildShopState(list, items);
    window._shopItemIds = state.itemIds;
    if (!preserveChecked) window._checkedItems = state.checkedItems;

    renderFullShoppingList(hasRecipeItems ? state.recipeItems : null, state.manualItems);
  } catch {
    document.getElementById('shopLoading').style.display = 'none';
    document.getElementById('shopNoData').style.display  = '';
    unsubscribeShoppingItems();
  }
}

// Hämtar den aktiva inköpslistan, eller skapar en tom om ingen finns (t.ex. innan
// någon matsedel genererats). Återanvänder alltid en befintlig aktiv lista så att
// vi aldrig får två aktiva rader. Rör inte veckoplaner.
async function ensureActiveShoppingList() {
  if (window._shopListId) return window._shopListId;
  const householdId = await window.getHouseholdId();
  const { data: existing } = await window.db
    .from('shopping_lists')
    .select('id')
    .eq('household_id', householdId)
    .eq('is_active', true)
    .limit(1);
  if (existing?.[0]?.id) {
    window._shopListId = existing[0].id;
    return window._shopListId;
  }
  const today = fmtIso(new Date());
  const { data: created, error } = await window.db
    .from('shopping_lists')
    .insert({ household_id: householdId, start_date: today, end_date: today, is_active: true })
    .select('id')
    .single();
  if (error) throw error;
  window._shopListId = created.id;
  return window._shopListId;
}

export async function addManualItem(inputId = 'manualItemInput', btnId = 'manualAddBtn') {
  const input = document.getElementById(inputId);
  const item  = input.value.trim();
  if (!item) return;
  const btn = document.getElementById(btnId);
  btn.disabled = true;
  try {
    // I tomt läge finns ännu ingen aktiv lista — skapa (eller återanvänd) en
    // så att man kan börja med egna varor utan att först generera en matsedel.
    const listId = await ensureActiveShoppingList();
    const position = (window._shopManualItems || []).length;
    const { error } = await window.db
      .from('shopping_items')
      .insert({ list_id: listId, category: 'Övrigt', name: item, source: 'manual', checked: false, position });
    if (error) throw error;
    input.value = '';
    window._preserveChecked = true;
    loadShoppingTab();
  } catch {
    window.showToast('Kunde inte lägga till varan — prova igen.', { type: 'error' });
  } finally {
    btn.disabled = false;
  }
}

export async function removeManualItem(item) {
  const idx = (window._shopManualItems || []).indexOf(item);
  const id = idx === -1 ? null : window._shopItemIds?.[`manual::${idx}`];
  if (!id) { window.showToast('Kunde inte ta bort varan — prova igen.', { type: 'error' }); return; }
  try {
    await deleteWithUndo(id);
  } catch {
    window.showToast('Kunde inte ta bort varan — prova igen.', { type: 'error' });
  }
}

// ── Drag-and-drop: byt ordning på egna varor (bara i redigera-läget) ──────────
// Finger-följande sortering via Pointer Events (touch-först). Den dragna raden
// translateras med fingret medan grannarna byter plats i DOM när man korsar
// deras mittlinje; `baseY` justeras vid varje byte så rörelsen aldrig hoppar.
// Vid släpp läses den nya DOM-ordningen och en kontiguerlig `position`-ordning
// (0..n) sparas för de egna varorna (självläker gamla luckor). Receptvarornas
// ordning rörs aldrig (buckten sorteras per källa var för sig).
let _manualDrag = null;

export function startManualDrag(e, handle) {
  if (!window._editMode) return;
  if (e.button != null && e.button !== 0) return;   // bara vänster musknapp / touch
  const li = handle.closest('.shopping-item');
  const ul = li?.parentElement;
  if (!li || !ul) return;
  e.preventDefault();
  e.stopPropagation();
  _manualDrag = { li, ul, handle, baseY: e.clientY, pointerId: e.pointerId, moved: false };
  li.classList.add('dragging');
  try { handle.setPointerCapture(e.pointerId); } catch { /* capture är bara en optimering */ }
  handle.addEventListener('pointermove', onManualDragMove);
  handle.addEventListener('pointerup', endManualDrag);
  handle.addEventListener('pointercancel', endManualDrag);
}

function onManualDragMove(e) {
  const st = _manualDrag;
  if (!st) return;
  e.preventDefault();
  const { li, ul } = st;
  const y = e.clientY;

  // Max ett byte per event: kolla närmaste granne i rörelseriktningen.
  const prev = li.previousElementSibling;
  if (prev && prev.classList.contains('shopping-item')) {
    const r = prev.getBoundingClientRect();
    if (y < r.top + r.height / 2) {
      st.baseY -= prev.offsetHeight;
      ul.insertBefore(li, prev);
      st.moved = true;
      li.style.transform = `translateY(${y - st.baseY}px)`;
      return;
    }
  }
  const next = li.nextElementSibling;
  if (next && next.classList.contains('shopping-item')) {
    const r = next.getBoundingClientRect();
    if (y > r.top + r.height / 2) {
      st.baseY += next.offsetHeight;
      ul.insertBefore(li, next.nextElementSibling);
      st.moved = true;
    }
  }
  li.style.transform = `translateY(${y - st.baseY}px)`;
}

function endManualDrag() {
  const st = _manualDrag;
  if (!st) return;
  const { li, ul, handle } = st;
  handle.removeEventListener('pointermove', onManualDragMove);
  handle.removeEventListener('pointerup', endManualDrag);
  handle.removeEventListener('pointercancel', endManualDrag);
  try { handle.releasePointerCapture(st.pointerId); } catch { /* redan släppt */ }
  li.style.transform = '';
  li.classList.remove('dragging');
  _manualDrag = null;
  if (!st.moved) return;   // ingen faktisk omflyttning → ingen skrivning
  const order = Array.from(ul.querySelectorAll('.shopping-item'))
    .map((n) => n.dataset.manualIdx)
    .filter((v) => v != null)
    .map(Number);
  commitManualOrder(order);
}

// Skriver den nya ordningen för de VISADE egna varorna (kan vara en delmängd i
// handla-läget) tillbaka på de slots de upptog, låter bockade/dolda varor ligga
// kvar, och sparar en kontiguerlig `position`-ordning till Supabase.
async function commitManualOrder(shownOrderIdx) {
  const items = (window._shopManualItems || []).slice();
  if (!shownOrderIdx.length) { renderFullShoppingList(window._shopRecipeItems, items); return; }
  const ids     = items.map((_, i) => window._shopItemIds?.[`manual::${i}`]);
  const newItems = items.slice();
  const newIds   = ids.slice();
  const slots    = shownOrderIdx.slice().sort((a, b) => a - b);
  slots.forEach((slot, k) => {
    const src = shownOrderIdx[k];
    newItems[slot] = items[src];
    newIds[slot]   = ids[src];
  });
  window._shopManualItems = newItems;
  if (window._shopItemIds) newItems.forEach((_, k) => { window._shopItemIds[`manual::${k}`] = newIds[k]; });
  renderFullShoppingList(window._shopRecipeItems, newItems);

  try {
    const ps = newIds
      .map((id, k) => id ? window.db.from('shopping_items').update({ position: k }).eq('id', id) : null)
      .filter(Boolean);
    await Promise.all(ps);
  } catch {
    window.showToast?.('Kunde inte spara ordningen — prova igen.', { type: 'error' });
  }
}

export async function clearShoppingList() {
  const ok = await window.confirmDialog({
    title: 'Rensa hela inköpslistan?',
    message: 'Alla varor tas bort — även egna tillägg och det som redan är avbockat. Det går inte att ångra.',
    confirmLabel: 'Rensa listan',
    danger: true,
  });
  if (!ok) return;
  const btn = document.getElementById('modeBtnClear');
  btn.disabled = true;
  btn.textContent = 'Rensar…';
  try {
    const listId = window._shopListId;
    if (listId) {
      const { error: delErr } = await window.db
        .from('shopping_items')
        .delete()
        .eq('list_id', listId);
      if (delErr) throw delErr;
      await window.db.from('shopping_lists').update({ is_active: false }).eq('id', listId);
    }
    unsubscribeShoppingItems();
    window._checkedItems = {};
    window._shopItemIds  = {};
    window._shopListId   = null;
    loadShoppingTab();
  } catch {
    window.showToast('Kunde inte rensa listan — prova igen.', { type: 'error' });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Rensa lista';
  }
}

export function copyShoppingList() {
  const el = document.getElementById('shoppingText');
  navigator.clipboard.writeText(el._fullText || '').then(() => {
    const btn = el.querySelector('.shop-copy-btn');
    btn.textContent = 'Kopierad!';
    setTimeout(() => { btn.textContent = 'Kopiera hela listan'; }, 2000);
  }).catch(() => {
    // Clipboard nekas i osäker kontext / äldre iOS — ge besked i stället för tyst.
    window.showToast?.('Kunde inte kopiera listan — markera texten och kopiera manuellt.', { type: 'error' });
  });
}

// Renderar ett shop-objekt från API-svar (används av plan-viewer efter skip/block)
export function renderShoppingData(shop) {
  const recipeItemsData = shop.recipeItems || shop.categories || null;
  const hasRecipe = shop.recipeItemsMovedAt &&
    recipeItemsData && Object.values(recipeItemsData).some(v => v.length > 0);
  const hasManual = (shop.manualItems || []).length > 0;
  if (!hasRecipe && !hasManual) return;
  if (shop.checkedItems) window._checkedItems = shop.checkedItems;
  renderFullShoppingList(hasRecipe ? recipeItemsData : null, shop.manualItems || []);
  document.getElementById('shopLoading').style.display = 'none';
  document.getElementById('shopNoData').style.display  = 'none';
  document.getElementById('shopContent').style.display = '';
}

// Exponera på window för inline onclick-attribut
window.setShopMode        = setShopMode;
window.toggleShopItem     = toggleShopItem;
window.togglePantryItem   = togglePantryItem;
window.toggleEditMode     = toggleEditMode;
window.toggleHandlaMode   = toggleHandlaMode;
window.renameShopItem     = renameShopItem;
window.removeShopItem     = removeShopItem;
window.removeManualItem   = removeManualItem;
window.startManualDrag    = startManualDrag;
window.clearShoppingList  = clearShoppingList;
window.copyShoppingList   = copyShoppingList;
window.addManualItem      = addManualItem;
window.loadShoppingTab    = loadShoppingTab;
window.renderShoppingData = renderShoppingData;
window.renderFullShoppingList = renderFullShoppingList;
