// Ingrediensförhandsgranskning i veckovyn + "Flytta till inköpslista"-knapp.

import { CAT_ICONS } from '../utils.js';

export function toggleIngredientSection() {
  document.getElementById('ingredientSection').classList.toggle('ingredient-section-open');
}

export function renderIngredientPreview(recipeItems, movedAt, expand = false) {
  const section = document.getElementById('ingredientSection');
  if (expand) section.classList.add('ingredient-section-open');
  else        section.classList.remove('ingredient-section-open');

  const btn = document.getElementById('flyttaBtn');
  if (!recipeItems || Object.values(recipeItems).every(v => v.length === 0)) {
    document.getElementById('ingredientPreview').innerHTML =
      '<p style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0">Inga ingredienser genererade ännu.</p>';
    btn.style.display = 'none';
    return;
  }

  const html = Object.entries(recipeItems)
    .filter(([, items]) => items.length > 0)
    .map(([cat, items]) => `<div class="ingredient-preview-category">
      <div class="ingredient-preview-cat-name">
        <span>${CAT_ICONS[cat] || '•'} ${cat}</span>
        <span class="ingredient-preview-cat-count">${items.length} varor</span>
      </div>
      <ul class="ingredient-preview-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>
    </div>`).join('');

  document.getElementById('ingredientPreview').innerHTML = html;
  btn.style.display    = '';
  btn.dataset.movedAt  = movedAt || '';
}

export async function moveToShoppingList() {
  const btn = document.getElementById('flyttaBtn');
  btn.disabled    = true;
  btn.textContent = 'Flyttar…';
  try {
    const res = await fetch('/api/shopping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'move' }),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const shop = data.content;
    btn.dataset.movedAt = shop?.recipeItemsMovedAt || '';
    btn.textContent     = 'Flytta till inköpslista →';
    btn.disabled        = false;
    window._freshShopContent = shop;
    window.switchTab('shop');
  } catch {
    alert('Kunde inte flytta varorna — prova igen.');
    btn.textContent = 'Flytta till inköpslista →';
    btn.disabled    = false;
  }
}

window.toggleIngredientSection = toggleIngredientSection;
window.renderIngredientPreview = renderIngredientPreview;
window.moveToShoppingList      = moveToShoppingList;
