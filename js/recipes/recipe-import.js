// Receptimport: bottom-sheet modal för URL och fotoimport via Gemini.

let selectedPhotoFile = null;

export function openImportModal() {
  document.getElementById('importFeedback').textContent  = '';
  document.getElementById('importUrlInput').value        = '';
  document.getElementById('importCameraInput').value     = '';
  document.getElementById('importFileInput').value       = '';
  document.getElementById('importUrlBtn').disabled       = false;
  document.getElementById('importPhotoBtn').disabled     = true;
  selectedPhotoFile = null;
  document.querySelectorAll('.import-photo-btn').forEach(b => b.classList.remove('selected'));
  switchImportTab('url');
  const modal = document.getElementById('importModal');
  modal.style.display = '';
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeImportModal() {
  const modal = document.getElementById('importModal');
  modal.classList.remove('open');
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

export function switchImportTab(tab) {
  document.getElementById('importUrlSection').style.display   = tab === 'url'   ? '' : 'none';
  document.getElementById('importPhotoSection').style.display = tab === 'photo' ? '' : 'none';
  document.getElementById('importTabUrl').classList.toggle('active',   tab === 'url');
  document.getElementById('importTabPhoto').classList.toggle('active', tab === 'photo');
  document.getElementById('importFeedback').textContent = '';
}

// Hantera bildval från kamera eller filväljare
function handlePhotoSelect(input) {
  const file = input.files[0];
  if (!file) return;
  selectedPhotoFile = file;
  document.getElementById('importPhotoBtn').disabled = false;
  // Markera vald källa
  document.querySelectorAll('.import-photo-btn').forEach(b => b.classList.remove('selected'));
  input.closest('.import-photo-btn').classList.add('selected');
  const fb = document.getElementById('importFeedback');
  fb.style.color   = 'var(--text-muted)';
  fb.textContent   = `Vald: ${file.name.length > 25 ? file.name.slice(0, 22) + '…' : file.name}`;
}

export async function importFromUrl() {
  const url = document.getElementById('importUrlInput').value.trim();
  const fb  = document.getElementById('importFeedback');
  const btn = document.getElementById('importUrlBtn');
  if (!url) { fb.textContent = 'Ange en webbadress.'; return; }
  btn.disabled     = true;
  fb.style.color   = 'var(--text-muted)';
  fb.innerHTML     = '<span class="import-spinner"></span>Hämtar recept…';
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
  const fb   = document.getElementById('importFeedback');
  const btn  = document.getElementById('importPhotoBtn');
  if (!selectedPhotoFile) { fb.textContent = 'Välj en bild först.'; return; }
  btn.disabled = true;

  const messages = ['Analyserar bild…', 'Identifierar ingredienser…', 'Formaterar recept…'];
  let msgIdx = 0;
  fb.style.color = 'var(--text-muted)';
  fb.innerHTML   = `<span class="import-spinner"></span>${messages[0]}`;
  const msgTimer = setInterval(() => {
    msgIdx = (msgIdx + 1) % messages.length;
    fb.innerHTML = `<span class="import-spinner"></span>${messages[msgIdx]}`;
  }, 2500);

  try {
    const imageBase64 = await resizeAndEncodeImage(selectedPhotoFile, 1200);
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
      URL.revokeObjectURL(img.src);
      const scale  = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
    };
    img.onerror = (e) => { URL.revokeObjectURL(img.src); reject(e); };
    img.src = URL.createObjectURL(file);
  });
}

function toSentenceCase(str) {
  if (!str) return '';
  const letters = str.replace(/[^a-zA-ZåäöÅÄÖ]/g, '');
  const upper   = letters.replace(/[^A-ZÅÄÖ]/g, '').length;
  if (letters.length > 0 && upper / letters.length > 0.5) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
  return str;
}

export function openImportPreview(recipe) {
  window.editingId = null;
  document.getElementById('editModalTitle').textContent      = 'Nytt recept';
  document.getElementById('edit-title').value                = toSentenceCase(recipe.title);
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

// Event listeners för kamera/fil-inputs
document.getElementById('importCameraInput').addEventListener('change', function() { handlePhotoSelect(this); });
document.getElementById('importFileInput').addEventListener('change', function() { handlePhotoSelect(this); });

window.openImportModal    = openImportModal;
window.closeImportModal   = closeImportModal;
window.switchImportTab    = switchImportTab;
window.importFromUrl      = importFromUrl;
window.importFromPhoto    = importFromPhoto;
window.openImportPreview  = openImportPreview;
