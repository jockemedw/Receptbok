// Inköpslista: rendering, bockning, manuella varor, copy-läge.
// Läser state: _shopListId, _shopItemIds, _checkedItems, _checkedSaveTimer, _shopRecipeItems, _shopManualItems
// Skriver state: _shopListId, _shopItemIds, _checkedItems, _checkedSaveTimer, _shopRecipeItems, _shopManualItems

import { CAT_ICONS, escapeHtml } from '../utils.js';

// Rekonstruerar frontend-state från Supabase-rader
function buildShopState(list, items) {
  const recipeItems = {};
  const manualItemsArr = [];
  const checkedItems = {};
  const itemIds = {};
  for (const row of items) {
    if (row.source === 'recipe') {
      if (!recipeItems[row.category]) recipeItems[row.category] = [];
      while (recipeItems[row.category].length <= row.position) recipeItems[row.category].push(null);
      recipeItems[row.category][row.position] = row.name;
      const key = `recipe::${row.category}::${row.position}`;
      checkedItems[key] = row.checked === true;
      itemIds[key] = row.id;
    } else if (row.source === 'manual') {
      while (manualItemsArr.length <= row.position) manualItemsArr.push(null);
      manualItemsArr[row.position] = row.name;
      const key = `manual::${row.position}`;
      checkedItems[key] = row.checked === true;
      itemIds[key] = row.id;
    }
  }
  for (const cat of Object.keys(recipeItems)) recipeItems[cat] = recipeItems[cat].filter(Boolean);
  return { recipeItems, manualItems: manualItemsArr.filter(Boolean), checkedItems, itemIds };
}

const ICON_NOTE = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h11l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 11h8 M8 14h8 M8 17h5"/></svg>';

export function setShopMode(mode) {
  const isHandla = mode === 'handla';
  document.getElementById('modeBtnHandla').classList.toggle('active', isHandla);
  document.getElementById('modeBtnText').classList.toggle('active', !isHandla);
  document.getElementById('shoppingList').style.display = isHandla ? '' : 'none';
  document.getElementById('shoppingText').classList.toggle('visible', !isHandla);
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

  const uncheckedManual = window._shopManualItems.filter((_, idx) => !window._checkedItems[`manual::${idx}`]);
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
    const manualHtml = manualItems.map((item, idx) => {
      const key     = `manual::${idx}`;
      const checked = window._checkedItems[key] || false;
      return `<li class="shopping-item${checked ? ' checked' : ''}"
                  onclick="toggleShopItem(this,'${key}')">
        <span class="item-checkbox">${checked ? '✓' : ''}</span>
        <span class="item-text">${escapeHtml(item)}</span>
        <button class="remove-manual-btn" onclick="event.stopPropagation();removeManualItem('${escapeHtml(item).replace(/'/g, "\\'")}')">×</button>
      </li>`;
    }).join('');
    checkHtml += `<div class="shopping-category">
      <div class="shopping-cat-header">
        <span class="shopping-cat-name">${ICON_NOTE} Egna tillägg</span>
        <span class="shopping-cat-count">${manualItems.length} varor</span>
      </div>
      <ul class="shopping-items">${manualHtml}</ul>
    </div>`;

    const uncheckedManual = manualItems.filter((_, idx) => !window._checkedItems[`manual::${idx}`]);
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
      return;
    }
    document.getElementById('shopContent').style.display = '';
    if (typeof window.initDispatchUI === 'function') window.initDispatchUI();

    const preserveChecked = window._preserveChecked === true;
    window._preserveChecked = false;
    window._shopListId = list.id;

    const state = buildShopState(list, items);
    window._shopItemIds = state.itemIds;
    if (!preserveChecked) window._checkedItems = state.checkedItems;

    renderFullShoppingList(hasRecipeItems ? state.recipeItems : null, state.manualItems);
  } catch {
    document.getElementById('shopLoading').style.display = 'none';
    document.getElementById('shopNoData').style.display  = '';
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
window.removeManualItem   = removeManualItem;
window.clearShoppingList  = clearShoppingList;
window.copyShoppingList   = copyShoppingList;
window.addManualItem      = addManualItem;
window.loadShoppingTab    = loadShoppingTab;
window.renderShoppingData = renderShoppingData;
window.renderFullShoppingList = renderFullShoppingList;
