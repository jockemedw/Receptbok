// Inköpslista: rendering, bockning, manuella varor, copy-läge.
// Läser state: _freshShopContent, _checkedItems, _checkedSaveTimer, _shopRecipeItems, _shopManualItems
// Skriver state: _freshShopContent, _checkedItems, _checkedSaveTimer, _shopRecipeItems, _shopManualItems

import { CAT_ICONS } from '../utils.js';

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
    try {
      await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_checked', checkedItems: window._checkedItems }),
      });
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
      <div class="shop-text-cat-name">📝 Egna tillägg</div>
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
        <span class="item-text">${item}</span>
        <button class="remove-manual-btn" onclick="event.stopPropagation();removeManualItem('${item.replace(/'/g, "\\'")}')">×</button>
      </li>`;
    }).join('');
    checkHtml += `<div class="shopping-category">
      <div class="shopping-cat-header">
        <span class="shopping-cat-name">📝 Egna tillägg</span>
        <span class="shopping-cat-count">${manualItems.length} varor</span>
      </div>
      <ul class="shopping-items">${manualHtml}</ul>
    </div>`;

    const uncheckedManual = manualItems.filter((_, idx) => !window._checkedItems[`manual::${idx}`]);
    if (uncheckedManual.length) {
      textParts.push(`Egna tillägg:\n${uncheckedManual.map(i => '• ' + i).join('\n')}`);
      textBlocksHtml += `<div class="shop-text-category">
        <div class="shop-text-cat-name">📝 Egna tillägg</div>
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
    let shop;
    let preserveChecked = false;
    if (window._freshShopContent) {
      shop = window._freshShopContent;
      window._freshShopContent = null;
      // Manuella add/remove ändrar inte bock-state — behåll in-memory _checkedItems
      preserveChecked = true;
    } else {
      const res = await fetch('shopping-list.json?' + Date.now());
      if (!res.ok) throw new Error();
      shop = await res.json();
    }
    const recipeItemsData = shop.recipeItems || shop.categories || null;
    const hasRecipe = shop.recipeItemsMovedAt &&
      recipeItemsData && Object.values(recipeItemsData).some(v => v.length > 0);
    const hasManual = shop.manualItems?.length > 0;

    document.getElementById('shopLoading').style.display = 'none';
    if (!hasRecipe && !hasManual) {
      document.getElementById('shopNoData').style.display = '';
      return;
    }
    document.getElementById('shopContent').style.display = '';
    if (!preserveChecked) window._checkedItems = shop.checkedItems || {};
    renderFullShoppingList(hasRecipe ? recipeItemsData : null, shop.manualItems || []);
  } catch {
    document.getElementById('shopLoading').style.display = 'none';
    document.getElementById('shopNoData').style.display  = '';
  }
}

export async function addManualItem() {
  const input = document.getElementById('manualItemInput');
  const item  = input.value.trim();
  if (!item) return;
  const btn = document.getElementById('manualAddBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/shopping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', item }),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    window._freshShopContent = data.content;
    input.value = '';
    loadShoppingTab();
  } catch {
    alert('Kunde inte lägga till varan — prova igen.');
  } finally {
    btn.disabled = false;
  }
}

export async function removeManualItem(item) {
  try {
    const res = await fetch('/api/shopping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', item }),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    window._freshShopContent = data.content;
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
    const res = await fetch('/api/shopping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear' }),
    });
    if (!res.ok) throw new Error();
    window._checkedItems    = {};
    window._freshShopContent = (await res.json()).content;
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
