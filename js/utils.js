// Delade hjälpfunktioner och konstanter — ingen sidoeffekt, inga DOM-beroenden.

export const proteinLabel = {
  fisk: 'Fisk/Skaldjur', kyckling: 'Kyckling', kött: 'Kött',
  fläsk: 'Fläsk', vegetarisk: 'Vegetarisk',
};

export const CAT_ICONS = {
  'Mejeri': '🥛', 'Grönsaker': '🥦', 'Fisk & kött': '🥩',
  'Skafferi': '🫙', 'Frukt': '🍎', 'Övrigt': '🛍️',
};

export const PROTEIN_COLOR = {
  fisk: '#5b9bd5', kyckling: '#e8a735', vegetarisk: '#4a7d4e',
  kött: '#b05040', fläsk: '#b05040',
};

export function timeStr(r) {
  if (!r.time) return null;
  const base = r.time < 60 ? r.time + ' min' : (r.time / 60).toFixed(1).replace('.0', '') + ' h';
  return r.timeNote && r.timeNote.startsWith('+') ? base + ' ' + r.timeNote : base;
}

export function renderIngredient(i) {
  if (!i.includes(':')) return `<li>${i}</li>`;
  const colon = i.indexOf(':');
  const label = i.substring(0, colon).trim();
  const val   = i.substring(colon + 1).trim();
  if (!val) return `<li class="group-header">${label}</li>`;
  return `<li><span class="ing-group">${label}:</span> ${val}</li>`;
}

export function fmtIso(date) {
  return date.toISOString().split('T')[0];
}

export function fmtShort(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr + 'T12:00:00');
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

// Exponera på window för inline onclick-attribut och icke-modul-kod
window.timeStr        = timeStr;
window.renderIngredient = renderIngredient;
window.fmtIso         = fmtIso;
window.fmtShort       = fmtShort;
