// Receptredigering: öppna/stänga modal, spara, ta bort.
// Läser state: RECIPES, editingId
// Skriver state: RECIPES, editingId

import { proteinLabel, timeStr, renderIngredient, renderDetailInner, escapeHtml, jsStringAttr } from '../utils.js';
import { recipeToRow } from '../data-mapper.js';

// ── Taggväljare ───────────────────────────────────────────────────────────────
// Knappen vid taggfältet fäller ut alla taggar som redan används i receptboken
// (vanligast först). Fältet är fortfarande fritext — väljaren skriver bara i
// det, så en helt ny tagg kan skrivas för hand som förut.
let _tagPickerOpen = false;

function tagsInField() {
  return (document.getElementById('edit-tags')?.value || '')
    .split(',').map(t => t.trim()).filter(Boolean);
}

function knownTags() {
  const counts = new Map();
  for (const r of window.RECIPES || []) {
    for (const t of r.tags || []) {
      const low = String(t).trim().toLowerCase();
      if (!low) continue;
      counts.set(low, (counts.get(low) || 0) + 1);
    }
  }
  // Mest använda först — det är de man nästan alltid vill ha. Lika många
  // användningar → bokstavsordning (svensk sortering).
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'sv'));
}

function renderTagPicker() {
  const panel = document.getElementById('editTagsPicker');
  const btn   = document.getElementById('editTagsPickBtn');
  if (!panel || !btn) return;
  panel.hidden = !_tagPickerOpen;
  btn.setAttribute('aria-expanded', _tagPickerOpen ? 'true' : 'false');
  btn.classList.toggle('open', _tagPickerOpen);
  if (!_tagPickerOpen) { panel.innerHTML = ''; return; }

  const tags = knownTags();
  if (!tags.length) {
    panel.innerHTML = '<p class="tagpick-empty">Inga taggar används ännu — skriv en egen i fältet ovanför.</p>';
    return;
  }
  const chosen = new Set(tagsInField().map(t => t.toLowerCase()));
  panel.innerHTML = tags.map(([tag, count]) => {
    const active = chosen.has(tag);
    return `<button type="button" class="tagpick-chip${active ? ' active' : ''}"
      aria-pressed="${active ? 'true' : 'false'}"
      onclick="pickTag('${jsStringAttr(tag)}')">${escapeHtml(tag)}<span class="tagpick-count">${count}</span></button>`;
  }).join('');
}

export function toggleTagPicker() {
  _tagPickerOpen = !_tagPickerOpen;
  renderTagPicker();
}

export function closeTagPicker() {
  _tagPickerOpen = false;
  renderTagPicker();
}

// Klick på en tagg lägger till den — eller tar bort den om den redan står i
// fältet (så väljaren också går att ångra med).
export function pickTag(tag) {
  const field = document.getElementById('edit-tags');
  if (!field) return;
  const low = tag.toLowerCase();
  const current = tagsInField();
  const next = current.some(t => t.toLowerCase() === low)
    ? current.filter(t => t.toLowerCase() !== low)
    : current.concat(tag);
  field.value = next.join(', ');
  renderTagPicker();
}

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
  closeTagPicker();                                       // väljaren startar alltid ihopfälld
  const m = document.getElementById('editModal');
  m.style.display = 'block';
  requestAnimationFrame(() => m.classList.add('open'));   // mjuk fade-in (Session 120)
  document.body.style.overflow = 'hidden';
}

export function closeEditModal() {
  const m = document.getElementById('editModal');
  m.classList.remove('open');                             // fade-out, sedan display:none
  setTimeout(() => { if (!m.classList.contains('open')) m.style.display = 'none'; }, 200);
  document.body.style.overflow = '';
  window.editingId = null;
  window._importSeasons = null;
  closeTagPicker();
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
    feedback.style.color = 'var(--rust)';
    saveBtn.disabled = false;
    return;
  }
  if (!ingredients.length) {
    feedback.textContent = 'Lägg till minst en ingrediens.';
    feedback.style.color = 'var(--rust)';
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
    // Steg 1: Spara receptet via Supabase
    let saved;
    try {
      const householdId = await window.getHouseholdId();
      const nextId = Math.max(...window.RECIPES.map(r => r.id), 0) + 1;
      const newRecipe = { ...formData, id: nextId, tested: false, seasons: window._importSeasons || [] };
      const { data, error } = await window.db
        .from('recipes')
        .insert(recipeToRow(newRecipe, householdId))
        .select()
        .single();
      if (error) throw error;
      saved = newRecipe;
    } catch {
      feedback.textContent = 'Kunde inte spara — prova igen.';
      feedback.style.color = 'var(--rust)';
      saveBtn.disabled = false;
      return;
    }

    // Steg 2: Receptet är sparat — uppdatera lokalt state och rendera
    closeEditModal();
    window.switchTab('recept');
    window.RECIPES.push(saved);
    window._allRecipes = window.RECIPES;

    // Nollställ sökning så det nya kortet syns
    document.getElementById('search').value = '';
    window.renderRecipeBrowser();

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
    const householdId = await window.getHouseholdId();
    const { error } = await window.db
      .from('recipes')
      .update(recipeToRow(updated, householdId))
      .eq('id', updated.id)
      .eq('household_id', householdId);
    if (error) throw error;
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
        <span class="pill ${updated.tested ? 'pill-tested' : 'pill-untested'} pill-toggle" role="button" tabindex="0"
              onclick="toggleTested(event, ${updated.id})"
              onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleTested(event, ${updated.id})}">${updated.tested ? '✓ Provat' : 'Oprövat'}</span>`;
      const inner = card.querySelector('.detail-inner');
      inner.innerHTML = renderDetailInner(updated);
      inner.dataset.rendered = '1';
    }
    closeEditModal();
  } catch {
    feedback.textContent = 'Kunde inte spara — prova igen.';
    feedback.style.color = 'var(--rust)';
    saveBtn.disabled = false;
  }
}

export async function deleteRecipe() {
  const ok = await window.confirmDialog({
    title: 'Ta bort receptet?',
    message: 'Receptet tas bort permanent ur familjens receptbok. Det går inte att ångra.',
    confirmLabel: 'Ta bort',
    danger: true,
  });
  if (!ok) return;
  const delBtn   = document.querySelector('#editModal .btn-delete');
  const feedback = document.getElementById('editFeedback');
  delBtn.disabled      = true;
  feedback.textContent  = 'Tar bort...';
  feedback.style.color  = 'var(--text-muted)';

  try {
    const householdId = await window.getHouseholdId();
    const { error } = await window.db
      .from('recipes')
      .delete()
      .eq('id', window.editingId)
      .eq('household_id', householdId);
    if (error) throw error;
    window.RECIPES = window.RECIPES.filter(r => r.id !== window.editingId);
    const card = document.querySelector(`.recipe-card[data-id="${window.editingId}"]`);
    if (card) card.remove();
    delBtn.disabled = false;
    closeEditModal();
  } catch {
    feedback.textContent = 'Kunde inte ta bort — prova igen.';
    feedback.style.color = 'var(--rust)';
    delBtn.disabled = false;
  }
}

window.toggleTagPicker       = toggleTagPicker;
window.pickTag               = pickTag;
window.openEditModal         = openEditModal;
window.closeEditModal        = closeEditModal;
window.handleModalOverlayClick = handleModalOverlayClick;
window.saveRecipe            = saveRecipe;
window.deleteRecipe          = deleteRecipe;
