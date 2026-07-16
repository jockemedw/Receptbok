// Delade hjälpfunktioner och konstanter — ingen sidoeffekt, inga DOM-beroenden.

export const proteinLabel = {
  fisk: 'Fisk/Skaldjur', kyckling: 'Kyckling', kött: 'Kött',
  fläsk: 'Fläsk', vegetarisk: 'Vegetarisk',
};

export const CAT_ICONS = {
  'Mejeri': '🥛', 'Grönsaker': '🥦', 'Fisk & kött': '🥩',
  'Skafferi': '🫙', 'Frukt': '🍎', 'Övrigt': '🛍️',
};

// CSS-variabler (definierade i styles.css :root) i stället för hex — mörka ytor
// som hero-kortet ljusar upp dem lokalt, och mörkt tema kan justera centralt.
// Kött och fläsk har numera egna färger (roströd resp. lera).
export const PROTEIN_COLOR = {
  fisk: 'var(--p-fisk)', kyckling: 'var(--p-kyckling)', vegetarisk: 'var(--p-veg)',
  kött: 'var(--p-kott)', fläsk: 'var(--p-flask)',
};

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Säker inbäddning av en sträng som JS-strängliteral inuti ett dubbelciterat
// HTML-attribut (t.ex. onclick="fn('...')"). JS-escapa först, HTML-escapa sedan
// &<>" — men INTE ' (som annars blir &#39;, avkodas tillbaka av webbläsaren och
// bryter ut ur JS-strängen). Utan detta gör en apostrof i en titel knappen trasig
// och en riggad titel kör godtycklig JS.
export function jsStringAttr(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r').replace(/\n/g, '\\n')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function timeStr(r) {
  if (!r.time) return null;
  const base = r.time < 60 ? r.time + ' min' : (r.time / 60).toFixed(1).replace('.0', '').replace('.', ',') + ' h';
  return r.timeNote && r.timeNote.startsWith('+') ? base + ' ' + r.timeNote : base;
}

export function renderIngredient(i) {
  if (!i.includes(':')) return `<li>${escapeHtml(i)}</li>`;
  const colon = i.indexOf(':');
  const label = i.substring(0, colon).trim();
  const val   = i.substring(colon + 1).trim();
  if (!val) return `<li class="group-header">${escapeHtml(label)}</li>`;
  return `<li><span class="ing-group">${escapeHtml(label)}:</span> ${escapeHtml(val)}</li>`;
}

export function fmtIso(date) {
  // Lokala datumkomponenter, inte UTC — annars visar "Idag"/"Ikväll" gårdagens
  // middag mellan lokal midnatt och 01:00/02:00 (svensk offset UTC+1/+2).
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

// ISO-veckans måndag för ett datum. T12:00 + lokal fmtIso = DST-säkert
// (samma mönster som diffDaysIso i plan-viewer.js).
export function weekStartOf(dateIso) {
  const d = new Date(dateIso + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return fmtIso(d);
}

export function addDaysIso(dateIso, n) {
  const d = new Date(dateIso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return fmtIso(d);
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
    `<li onclick="toggleStep(this)"><span>${escapeHtml(s)}</span></li>`
  ).join('');
  const notesHtml = r.notes
    ? `<div class="detail-section"><h3>Noteringar</h3><div class="notes-box">💡 ${escapeHtml(r.notes)}</div></div>` : '';
  return `
    <div class="detail-section">
      <h3>Ingredienser · ${r.servings || 4} portioner</h3>
      <ul class="ingredients-list">${ingHtml}</ul>
    </div>
    <div class="detail-section">
      <h3>Tillagning</h3>
      <ol class="steps-list">${stepsHtml}</ol>
    </div>
    ${notesHtml}
    <button class="cook-mode-btn" onclick="event.stopPropagation();openCookMode(${r.id})">
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13c0-3.5 3.5-6 8-6s8 2.5 8 6"/><path d="M3 13h18"/><path d="M5.5 13v2c0 1.5 1 2.5 2.5 2.5h8c1.5 0 2.5-1 2.5-2.5v-2"/><path d="M11 4.5c0-.8.5-1.5 1-1.5s1 .7 1 1.5"/></svg>
      Börja laga
    </button>
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
window.escapeHtml       = escapeHtml;
window.jsStringAttr     = jsStringAttr;
window.timeStr          = timeStr;
window.renderIngredient = renderIngredient;
window.fmtIso           = fmtIso;
window.fmtShort         = fmtShort;
window.getHolidayName   = getHolidayName;
