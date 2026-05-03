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
  fisk: '#5b9bd5', kyckling: '#e8a735', vegetarisk: '#5e7a68',
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

export function daysBetween(startIso, endIso) {
  return Math.round(
    (new Date(endIso + 'T12:00:00') - new Date(startIso + 'T12:00:00')) / 864e5
  ) + 1;
}

// ISO 8601 veckonummer — måndag som första veckodag, v.1 innehåller 4 jan.
export function isoWeekNumber(dateIso) {
  if (!dateIso) return null;
  const [y, m, d] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

export function renderDetailInner(r) {
  const ingHtml   = (r.ingredients || []).map(renderIngredient).join('');
  const stepsHtml = (r.instructions || []).map(s =>
    `<li onclick="toggleStep(this)"><span>${s}</span></li>`
  ).join('');
  const notesHtml = r.notes
    ? `<div class="detail-section"><h3>Noteringar</h3><div class="notes-box">💡 ${r.notes}</div></div>` : '';
  return `
    <div class="detail-section">
      <h3>Ingredienser · ${r.servings} portioner</h3>
      <ul class="ingredients-list">${ingHtml}</ul>
    </div>
    <div class="detail-section">
      <h3>Tillagning</h3>
      <ol class="steps-list">${stepsHtml}</ol>
    </div>
    ${notesHtml}
    <button class="edit-recipe-btn" onclick="openEditModal(event, ${r.id})">✏️ Redigera recept</button>`;
}

// ── Svenska helgdagar ────────────────────────────────────────────────────────

// Gauss algoritm — returnerar påskdagens datum för ett år som ISO-string.
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = mars, 4 = april
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

// Hittar lördagen mellan två datum (UTC).
function saturdayBetween(startIso, endIso) {
  const start = new Date(startIso + 'T12:00:00Z');
  const end = new Date(endIso + 'T12:00:00Z');
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 6) return toIso(d);
  }
  return null;
}

const _holidayCache = new Map();

// Returnerar Map<iso, name> med svenska röda dagar + halv-helgdagar (julafton etc).
export function getSwedishHolidays(year) {
  if (_holidayCache.has(year)) return _holidayCache.get(year);
  const easter = easterSunday(year);
  const map = new Map([
    [`${year}-01-01`, 'Nyårsdagen'],
    [`${year}-01-06`, 'Trettondedag jul'],
    [toIso(addDays(easter, -2)), 'Långfredagen'],
    [toIso(addDays(easter, 0)),  'Påskdagen'],
    [toIso(addDays(easter, 1)),  'Annandag påsk'],
    [`${year}-05-01`, 'Första maj'],
    [toIso(addDays(easter, 39)), 'Kristi himmelsfärds dag'],
    [toIso(addDays(easter, 49)), 'Pingstdagen'],
    [`${year}-06-06`, 'Sveriges nationaldag'],
    [`${year}-12-24`, 'Julafton'],
    [`${year}-12-25`, 'Juldagen'],
    [`${year}-12-26`, 'Annandag jul'],
    [`${year}-12-31`, 'Nyårsafton'],
  ]);
  // Midsommarafton: fredag mellan 19–25 juni. Midsommardagen: lördag 20–26 juni.
  const midsummerSat = saturdayBetween(`${year}-06-20`, `${year}-06-26`);
  if (midsummerSat) {
    map.set(toIso(addDays(new Date(midsummerSat + 'T12:00:00Z'), -1)), 'Midsommarafton');
    map.set(midsummerSat, 'Midsommardagen');
  }
  // Alla helgons dag: lördag 31 okt – 6 nov.
  const allSaints = saturdayBetween(`${year}-10-31`, `${year}-11-06`);
  if (allSaints) map.set(allSaints, 'Alla helgons dag');
  _holidayCache.set(year, map);
  return map;
}

// Returnerar helgdagsnamn eller null. Accepterar ISO-string eller Date.
export function getHolidayName(dateIso) {
  if (!dateIso) return null;
  const year = parseInt(dateIso.slice(0, 4), 10);
  if (!year) return null;
  return getSwedishHolidays(year).get(dateIso) || null;
}

// Exponera på window för inline onclick-attribut och icke-modul-kod
window.timeStr          = timeStr;
window.renderIngredient = renderIngredient;
window.fmtIso           = fmtIso;
window.fmtShort         = fmtShort;
window.getHolidayName   = getHolidayName;
