// Receptimport: modal för URL och fotoimport via Gemini.

export function openImportModal() {
  document.getElementById('importFeedback').textContent  = '';
  document.getElementById('importUrlInput').value        = '';
  document.getElementById('importPhotoInput').value      = '';
  document.getElementById('importUrlBtn').disabled       = false;
  document.getElementById('importPhotoBtn').disabled     = false;
  switchImportTab('url');
  document.getElementById('importModal').style.display   = 'block';
  document.body.style.overflow = 'hidden';
}

export function closeImportModal() {
  document.getElementById('importModal').style.display = 'none';
  document.body.style.overflow = '';
}

export function switchImportTab(tab) {
  document.getElementById('importUrlSection').style.display   = tab === 'url'   ? '' : 'none';
  document.getElementById('importPhotoSection').style.display = tab === 'photo' ? '' : 'none';
  document.getElementById('importTabUrl').classList.toggle('active',   tab === 'url');
  document.getElementById('importTabPhoto').classList.toggle('active', tab === 'photo');
  document.getElementById('importFeedback').textContent = '';
}

export async function importFromUrl() {
  const url = document.getElementById('importUrlInput').value.trim();
  const fb  = document.getElementById('importFeedback');
  const btn = document.getElementById('importUrlBtn');
  if (!url) { fb.textContent = 'Ange en webbadress.'; return; }
  btn.disabled     = true;
  fb.style.color   = 'var(--text-muted)';
  fb.textContent   = 'Hämtar recept…';
  try {
    const res  = await fetch('/api/import-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'url', url }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Fel');
    closeImportModal();
    openImportPreview(data.recipe);
  } catch (e) {
    fb.style.color = 'var(--terracotta)';
    fb.textContent = e.message || 'Kunde inte hämta receptet — kontrollera adressen.';
    btn.disabled   = false;
  }
}

export async function importFromPhoto() {
  const file = document.getElementById('importPhotoInput').files[0];
  const fb   = document.getElementById('importFeedback');
  const btn  = document.getElementById('importPhotoBtn');
  if (!file) { fb.textContent = 'Välj en bild.'; return; }
  btn.disabled = true;

  const messages = ['Analyserar bild…', 'Identifierar ingredienser…', 'Formaterar recept…'];
  let msgIdx = 0;
  fb.style.color = 'var(--text-muted)';
  fb.textContent = messages[0];
  const msgTimer = setInterval(() => {
    msgIdx = (msgIdx + 1) % messages.length;
    fb.textContent = messages[msgIdx];
  }, 2500);

  try {
    const imageBase64 = await resizeAndEncodeImage(file, 1200);
    const res  = await fetch('/api/import-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'photo', imageBase64, mimeType: 'image/jpeg' }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Fel');
    closeImportModal();
    openImportPreview(data.recipe);
  } catch (e) {
    fb.style.color = 'var(--terracotta)';
    fb.textContent = e.message || 'Kunde inte tolka bilden — prova med klarare ljus eller närmre avstånd.';
    btn.disabled   = false;
  } finally {
    clearInterval(msgTimer);
  }
}

export function resizeAndEncodeImage(file, maxPx) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale  = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function openImportPreview(recipe) {
  window.editingId = null;
  document.getElementById('editModalTitle').textContent      = 'Nytt recept';
  document.getElementById('edit-title').value                = recipe.title || '';
  document.getElementById('edit-protein').value              = recipe.protein || 'vegetarisk';
  document.getElementById('edit-time').value                 = recipe.time || '';
  document.getElementById('edit-servings').value             = recipe.servings || 4;
  document.getElementById('edit-tags').value                 = (recipe.tags || []).join(', ');
  document.getElementById('edit-ingredients').value          = (recipe.ingredients || []).join('\n');
  document.getElementById('edit-instructions').value         = (recipe.instructions || []).join('\n');
  document.getElementById('edit-notes').value                = recipe.notes || '';
  document.getElementById('editFeedback').textContent        = '';
  document.getElementById('editSaveBtn').disabled            = false;
  document.getElementById('editModal').style.display         = 'block';
  document.body.style.overflow = 'hidden';
}

window.openImportModal    = openImportModal;
window.closeImportModal   = closeImportModal;
window.switchImportTab    = switchImportTab;
window.importFromUrl      = importFromUrl;
window.importFromPhoto    = importFromPhoto;
window.openImportPreview  = openImportPreview;
