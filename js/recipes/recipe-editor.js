// Receptredigering: öppna/stänga modal, spara, ta bort.
// Läser state: RECIPES, editingId
// Skriver state: RECIPES, editingId

import { proteinLabel, timeStr, renderIngredient, renderDetailInner } from '../utils.js';

export function openEditModal(event, id) {
  event.stopPropagation();
  const r = window.RECIPES.find(r => r.id === id);
  if (!r) return;
  window.editingId = id;
  document.getElementById('edit-title').value        = r.title;
  document.getElementById('edit-protein').value      = r.protein;
  document.getElementById('edit-time').value         = r.time || '';
  document.getElementById('edit-servings').value     = r.servings || 4;
  document.getElementById('edit-tags').value         = (r.tags || []).join(', ');
  document.getElementById('edit-ingredients').value  = (r.ingredients || []).join('\n');
  document.getElementById('edit-instructions').value = (r.instructions || []).join('\n');
  document.getElementById('edit-notes').value        = r.notes || '';
  document.getElementById('editFeedback').textContent = '';
  document.getElementById('editSaveBtn').disabled    = false;
  document.getElementById('editModal').style.display = 'block';
  document.body.style.overflow = 'hidden';
}

export function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  document.body.style.overflow = '';
  window.editingId = null;
  document.getElementById('editModalTitle').textContent = 'Redigera recept';
}

export function handleModalOverlayClick(event) {
  if (event.target === document.getElementById('editModal')) closeEditModal();
}

export async function saveRecipe() {
  const saveBtn  = document.getElementById('editSaveBtn');
  const feedback = document.getElementById('editFeedback');
  saveBtn.disabled    = true;
  feedback.textContent = 'Sparar...';
  feedback.style.color = 'var(--text-muted)';

  const isNew    = (window.editingId === null);
  const tagsRaw  = document.getElementById('edit-tags').value;
  const title    = document.getElementById('edit-title').value.trim();
  const ingredients = document.getElementById('edit-ingredients').value.split('\n').map(s => s.trim()).filter(Boolean);

  if (!title) {
    feedback.textContent = 'Receptet behöver en titel.';
    feedback.style.color = 'var(--terracotta)';
    saveBtn.disabled = false;
    return;
  }
  if (!ingredients.length) {
    feedback.textContent = 'Lägg till minst en ingrediens.';
    feedback.style.color = 'var(--terracotta)';
    saveBtn.disabled = false;
    return;
  }

  const formData = {
    title,
    protein:      document.getElementById('edit-protein').value,
    time:         parseInt(document.getElementById('edit-time').value) || null,
    servings:     parseInt(document.getElementById('edit-servings').value) || 4,
    tags:         tagsRaw.split(',').map(t => t.trim()).filter(Boolean),
    ingredients,
    instructions: document.getElementById('edit-instructions').value.split('\n').map(s => s.trim()).filter(Boolean),
    notes:        document.getElementById('edit-notes').value.trim() || null,
  };

  if (isNew) {
    // Steg 1: Spara receptet via API
    let saved;
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', recipe: formData }),
      });
      if (!res.ok) throw new Error();
      saved = (await res.json()).recipe;
    } catch {
      feedback.textContent = 'Kunde inte spara — prova igen.';
      feedback.style.color = 'var(--terracotta)';
      saveBtn.disabled = false;
      return;
    }

    // Steg 2: Receptet är sparat — stäng modal och visa laddning
    closeEditModal();
    window.switchTab('recept');
    const grid = document.getElementById('recipeGrid');
    grid.style.opacity = '0.4';
    const spinner = document.createElement('div');
    spinner.className = 'recipe-grid-loading';
    spinner.innerHTML = '<span class="import-spinner"></span> Laddar receptlistan…';
    grid.parentNode.insertBefore(spinner, grid);

    try {
      // Vänta kort så GitHub hinner uppdatera, sedan hämta med cache-bust
      await new Promise(r => setTimeout(r, 2000));
      let loaded = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const freshRes = await fetch(`recipes.json?t=${Date.now()}`);
        if (freshRes.ok) {
          const freshData = await freshRes.json();
          if (freshData.recipes.some(r => r.id === saved.id)) {
            window.RECIPES     = freshData.recipes;
            window._allRecipes = window.RECIPES;
            grid.innerHTML     = window.RECIPES.map(window.renderCard).join('');
            document.getElementById('countDisplay').textContent = `${window.RECIPES.length} recept`;
            window.initFilters(window.RECIPES);
            loaded = true;
            break;
          }
        }
        await new Promise(r => setTimeout(r, 2000));
      }
      if (!loaded) {
        window.RECIPES.push(saved);
        grid.innerHTML = window.RECIPES.map(window.renderCard).join('');
      }
    } catch {
      // Fallback vid nätverksfel: lägg till lokalt
      window.RECIPES.push(saved);
      grid.innerHTML = window.RECIPES.map(window.renderCard).join('');
    }

    grid.style.opacity = '';
    spinner.remove();

    // Nollställ filter så kortet syns
    window.activeFilters = new Set(['alla']);
    document.getElementById('search').value = '';
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === 'alla');
    });
    window.applyFilters();

    // Hitta det nya kortet, markera och scrolla
    const newCard = document.querySelector(`.recipe-card[data-id="${saved.id}"]`);
    if (newCard) {
      newCard.classList.add('recipe-card-new');
      requestAnimationFrame(() => {
        const hh  = document.querySelector('header').offsetHeight;
        const top = newCard.getBoundingClientRect().top + window.scrollY - hh - 12;
        window.smoothScrollTo(top, 420);
      });
      setTimeout(() => newCard.classList.remove('recipe-card-new'), 3000);
    }
    return;
  }

  const r = window.RECIPES.find(r => r.id === window.editingId);
  if (!r) { saveBtn.disabled = false; return; }

  const updated = { ...r, ...formData };
  try {
    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', recipe: updated }),
    });
    if (!res.ok) throw new Error();
    const idx = window.RECIPES.findIndex(r => r.id === window.editingId);
    window.RECIPES[idx] = updated;

    const card = document.querySelector(`.recipe-card[data-id="${window.editingId}"]`);
    if (card) {
      const t = timeStr(updated);
      card.dataset.title        = updated.title.toLowerCase();
      card.dataset.protein      = updated.protein;
      card.dataset.tags         = updated.tags.join(' ');
      card.dataset.time         = updated.time || 999;
      card.dataset.ingredients  = updated.ingredients.join(' ').toLowerCase();
      card.dataset.instructions = updated.instructions.join(' ').toLowerCase();
      card.querySelector('.card-title').textContent = updated.title;
      card.querySelector('.card-meta').innerHTML = `
        <span class="pill pill-protein">${proteinLabel[updated.protein] || updated.protein}</span>
        ${t ? `<span class="pill pill-time">⏱ ${t}</span>` : ''}
        <span class="pill ${updated.tested ? 'pill-tested' : 'pill-untested'} pill-toggle"
              onclick="toggleTested(event, ${updated.id})">${updated.tested ? '✓ Provat' : 'Ej provat'}</span>`;
      card.querySelector('.detail-inner').innerHTML = renderDetailInner(updated);
    }
    closeEditModal();
  } catch {
    feedback.textContent = 'Kunde inte spara — prova igen.';
    feedback.style.color = 'var(--terracotta)';
    saveBtn.disabled = false;
  }
}

export async function deleteRecipe() {
  if (!confirm('Ta bort receptet permanent? Det går inte att ångra.')) return;
  const delBtn   = document.querySelector('#editModal .btn-delete');
  const feedback = document.getElementById('editFeedback');
  delBtn.disabled      = true;
  feedback.textContent  = 'Tar bort...';
  feedback.style.color  = 'var(--text-muted)';

  try {
    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: window.editingId }),
    });
    if (!res.ok) throw new Error();
    window.RECIPES = window.RECIPES.filter(r => r.id !== window.editingId);
    const card = document.querySelector(`.recipe-card[data-id="${window.editingId}"]`);
    if (card) card.remove();
    delBtn.disabled = false;
    closeEditModal();
  } catch {
    feedback.textContent = 'Kunde inte ta bort — prova igen.';
    feedback.style.color = 'var(--terracotta)';
    delBtn.disabled = false;
  }
}

window.openEditModal         = openEditModal;
window.closeEditModal        = closeEditModal;
window.handleModalOverlayClick = handleModalOverlayClick;
window.saveRecipe            = saveRecipe;
window.deleteRecipe          = deleteRecipe;
