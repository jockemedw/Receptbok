// Inköpslista: rendering, bockning, manuella varor, copy-läge.
// Läser state: _shopListId, _shopItemIds, _checkedItems, _checkedSaveTimer, _shopRecipeItems, _shopManualItems
// Skriver state: _shopListId, _shopItemIds, _checkedItems, _checkedSaveTimer, _shopRecipeItems, _shopManualItems

import { CAT_ICONS, escapeHtml } from '../utils.js';

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
      const { eventType, new: newRow } = payload;
      if (eventType === 'UPDATE' && newRow?.source === 'recipe') {
        // Riktad DOM-uppdatering för receptvaror (undviker full reload)
        const key = Object.keys(window._shopItemIds || {}).find(k => window._shopItemIds[k] === newRow.id);
        if (!key) return;
        const serverChecked = newRow.checked === true;
        if (window._checkedItems[key] === serverChecked) return; // redan rätt
        window._checkedItems[key] = serverChecked;
        const el = document.querySelector(`.shopping-item[onclick*="${key}"]`);
        if (el) {
          el.classList.toggle('checked', serverChecked);
          el.querySelector('.item-checkbox').textContent = serverChecked ? '✓' : '';
        }
        rebuildShopText();
      } else {
        // Ny vara, borttagen vara eller manuell vara ändrad → ladda om
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

  for (const cat of Object.keys(recipeRows)) {
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
}

export async function removeShopItem(key) {
  const id = window._shopItemIds?.[key];
  if (!id) { alert('Kunde inte ta bort varan — prova igen.'); return; }
  try {
    const { error } = await window.db.from('shopping_items').delete().eq('id', id);
    if (error) throw error;
    // Index-nycklarna skiftar när en vara försvinner → bygg om bock-state från DB
    window._preserveChecked = false;
    loadShoppingTab();
  } catch {
    alert('Kunde inte ta bort varan — prova igen.');
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
    } catch { /* tyst fel — nästa bockning försöker igen */ }
  }, 600);
}

export function toggleShopItem(el, key) {
  if (window._editMode) return;   // i redigera-läget gör radklick inget — bara × tar bort
  const nowChecked = !window._checkedItems[key];
  window._checkedItems[key] = nowChecked;
  el.classList.toggle('checked', nowChecked);
  el.querySelector('.item-checkbox').textContent = nowChecked ? '✓' : '';
  rebuildShopText();
  scheduleCheckedSave();
}

export function rebuildShopText() {
  let textParts = [];
  let textBlocksHtml = '';

  if (window._shopRecipeItems) {
    const recipeText = Object.entries(window._shopRecipeItems)
      .filter(([, items]) => items.length > 0)
      .map(([cat, items]) => {
        const unchecked = items.filter((_, idx) => !window._checkedItems[`recipe::${cat}::${idx}`]);
        return unchecked.length ? `${cat}:\n${unchecked.map(i => '• ' + i).join('\n')}` : null;
      }).filter(Boolean).join('\n\n');
    if (recipeText) textParts.push(recipeText);

    textBlocksHtml += Object.entries(window._shopRecipeItems)
      .filter(([, items]) => items.length > 0)
      .map(([cat, items]) => {
        const unchecked = items.filter((_, idx) => !window._checkedItems[`recipe::${cat}::${idx}`]);
        if (!unchecked.length) return '';
        return `<div class="shop-text-category">
          <div class="shop-text-cat-name">${CAT_ICONS[cat] || '•'} ${cat}</div>
          <div class="shop-text-items">${unchecked.map(i => '• ' + i).join('\n')}</div>
        </div>`;
      }).join('');
  }

  const uncheckedManual = window._shopManualItems.filter((item) => !window._checkedItems[`manual::${item}`]);
  if (uncheckedManual.length) {
    textParts.push(`Egna tillägg:\n${uncheckedManual.map(i => '• ' + i).join('\n')}`);
    textBlocksHtml += `<div class="shop-text-category">
      <div class="shop-text-cat-name">${ICON_NOTE} Egna tillägg</div>
      <div class="shop-text-items">${uncheckedManual.map(i => '• ' + i).join('\n')}</div>
    </div>`;
  }

  const textEl = document.getElementById('shoppingText');
  textEl.innerHTML = textBlocksHtml +
    `<button class="shop-copy-btn" onclick="copyShoppingList()">Kopiera hela listan</button>`;
  textEl._fullText = textParts.join('\n\n');
}

export function renderFullShoppingList(recipeItems, manualItems) {
  window._shopRecipeItems = recipeItems;
  window._shopManualItems = manualItems;
  let checkHtml = '';
  let textParts = [];
  let textBlocksHtml = '';

  if (recipeItems) {
    checkHtml += Object.entries(recipeItems)
      .filter(([, items]) => items.length > 0)
      .map(([cat, items]) => {
        const icon = CAT_ICONS[cat] || '•';
        const itemsHtml = items.map((item, idx) => {
          const key     = `recipe::${cat}::${idx}`;
          const checked = window._checkedItems[key] || false;
          return `<li class="shopping-item${checked ? ' checked' : ''}"
                      onclick="toggleShopItem(this,'${key}')">
            <span class="item-checkbox">${checked ? '✓' : ''}</span>
            <span class="item-text">${item}</span>
            <button class="remove-item-btn" data-key="${key}" title="Ta bort varan"
                    onclick="event.stopPropagation();removeShopItem(this.dataset.key)">×</button>
          </li>`;
        }).join('');
        return `<div class="shopping-category">
          <div class="shopping-cat-header">
            <span class="shopping-cat-name">${icon} ${cat}</span>
            <span class="shopping-cat-count">${items.length} varor</span>
          </div>
          <ul class="shopping-items">${itemsHtml}</ul>
        </div>`;
      }).join('');

    const recipeText = Object.entries(recipeItems)
      .filter(([, items]) => items.length > 0)
      .map(([cat, items]) => {
        const unchecked = items.filter((_, idx) => !window._checkedItems[`recipe::${cat}::${idx}`]);
        return unchecked.length ? `${cat}:\n${unchecked.map(i => '• ' + i).join('\n')}` : null;
      }).filter(Boolean).join('\n\n');
    if (recipeText) textParts.push(recipeText);

    textBlocksHtml += Object.entries(recipeItems)
      .filter(([, items]) => items.length > 0)
      .map(([cat, items]) => {
        const unchecked = items.filter((_, idx) => !window._checkedItems[`recipe::${cat}::${idx}`]);
        if (!unchecked.length) return '';
        return `<div class="shop-text-category">
          <div class="shop-text-cat-name">${CAT_ICONS[cat] || '•'} ${cat}</div>
          <div class="shop-text-items">${unchecked.map(i => '• ' + i).join('\n')}</div>
        </div>`;
      }).join('');
  }

  if (manualItems.length > 0) {
    const manualHtml = manualItems.map((item) => {
      const key     = `manual::${item}`;
      const checked = window._checkedItems[key] || false;
      return `<li class="shopping-item${checked ? ' checked' : ''}"
                  data-key="${escapeHtml(key)}"
                  onclick="toggleShopItem(this,this.dataset.key)">
        <span class="item-checkbox">${checked ? '✓' : ''}</span>
        <span class="item-text">${escapeHtml(item)}</span>
        <button class="remove-item-btn" data-item="${escapeHtml(item)}" title="Ta bort varan" onclick="event.stopPropagation();removeManualItem(this.dataset.item)">×</button>
      </li>`;
    }).join('');
    checkHtml += `<div class="shopping-category">
      <div class="shopping-cat-header">
        <span class="shopping-cat-name">${ICON_NOTE} Egna tillägg</span>
        <span class="shopping-cat-count">${manualItems.length} varor</span>
      </div>
      <ul class="shopping-items">${manualHtml}</ul>
    </div>`;

    const uncheckedManual = manualItems.filter((item) => !window._checkedItems[`manual::${item}`]);
    if (uncheckedManual.length) {
      textParts.push(`Egna tillägg:\n${uncheckedManual.map(i => '• ' + i).join('\n')}`);
      textBlocksHtml += `<div class="shop-text-category">
        <div class="shop-text-cat-name">${ICON_NOTE} Egna tillägg</div>
        <div class="shop-text-items">${uncheckedManual.map(i => '• ' + i).join('\n')}</div>
      </div>`;
    }
  }

  document.getElementById('shoppingList').innerHTML = checkHtml;
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
    const { data: lists, error: listErr } = await window.db
      .from('shopping_lists')
      .select('*')
      .eq('household_id', householdId)
      .eq('is_active', true)
      .limit(1);
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

export async function addManualItem(inputId = 'manualItemInput', btnId = 'manualAddBtn') {
  const input = document.getElementById(inputId);
  const item  = input.value.trim();
  if (!item) return;
  const btn = document.getElementById(btnId);
  btn.disabled = true;
  try {
    const listId = window._shopListId;
    if (!listId) throw new Error('Ingen aktiv inköpslista');
    const position = (window._shopManualItems || []).length;
    const { error } = await window.db
      .from('shopping_items')
      .insert({ list_id: listId, category: 'Övrigt', name: item, source: 'manual', checked: false, position });
    if (error) throw error;
    input.value = '';
    window._preserveChecked = true;
    loadShoppingTab();
  } catch {
    alert('Kunde inte lägga till varan — prova igen.');
  } finally {
    btn.disabled = false;
  }
}

export async function removeManualItem(item) {
  try {
    const idx = (window._shopManualItems || []).indexOf(item);
    if (idx === -1) throw new Error('Varan hittades inte');
    const id = window._shopItemIds?.[`manual::${idx}`];
    if (!id) throw new Error('Inget id för varan');
    const { error } = await window.db.from('shopping_items').delete().eq('id', id);
    if (error) throw error;
    window._preserveChecked = true;
    loadShoppingTab();
  } catch {
    alert('Kunde inte ta bort varan — prova igen.');
  }
}

export async function clearShoppingList() {
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
    alert('Kunde inte rensa listan — prova igen.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Rensa';
  }
}

export function copyShoppingList() {
  const el = document.getElementById('shoppingText');
  navigator.clipboard.writeText(el._fullText || '').then(() => {
    const btn = el.querySelector('.shop-copy-btn');
    btn.textContent = 'Kopierad!';
    setTimeout(() => { btn.textContent = 'Kopiera hela listan'; }, 2000);
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
window.toggleEditMode     = toggleEditMode;
window.removeShopItem     = removeShopItem;
window.removeManualItem   = removeManualItem;
window.clearShoppingList  = clearShoppingList;
window.copyShoppingList   = copyShoppingList;
window.addManualItem      = addManualItem;
window.loadShoppingTab    = loadShoppingTab;
window.renderShoppingData = renderShoppingData;
window.renderFullShoppingList = renderFullShoppingList;
