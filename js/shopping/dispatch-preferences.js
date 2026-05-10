// Inköpspreferenser: varumärkesblocklist, eko/svenskt-toggles per kategori.
// Promptgenerator för AI-agent (Claude in Chrome).

const ICON_GEAR = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const ICON_CLIPBOARD = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11v6 M9 14h6"/></svg>';

const DEFAULTS = { blockedBrands: [], preferOrganic: {}, preferSwedish: {} };

let prefs = { ...DEFAULTS };
let prefsLoaded = false;

async function loadPrefs() {
  if (prefsLoaded) return prefs;
  try {
    const res = await fetch("/api/dispatch-preferences");
    if (res.ok) prefs = await res.json();
  } catch { /* använd defaults */ }
  prefsLoaded = true;
  return prefs;
}

async function savePrefs() {
  try {
    await fetch("/api/dispatch-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
  } catch {
    const err = document.getElementById("prefsError");
    if (err) { err.textContent = "Kunde inte spara — försök igen."; err.style.display = ""; }
  }
}

function getShoppingCategories() {
  const items = window._shopRecipeItems || {};
  return Object.keys(items).filter((cat) => items[cat]?.length > 0);
}

function getUncheckedItems() {
  const items = window._shopRecipeItems || {};
  const checked = window._checkedItems || {};
  const result = {};
  for (const [cat, list] of Object.entries(items)) {
    const unchecked = list.filter((_, idx) => !checked[`recipe::${cat}::${idx}`]);
    if (unchecked.length) result[cat] = unchecked;
  }
  return result;
}

function getUncheckedManualItems() {
  const manual = window._shopManualItems || [];
  const checked = window._checkedItems || {};
  return manual.filter((_, idx) => !checked[`manual::${idx}`]);
}

function renderBrandPills() {
  const container = document.getElementById("brandPills");
  if (!container) return;
  container.innerHTML = prefs.blockedBrands
    .map((b) => `<span class="pref-pill">${escapeHtml(b)}<button class="pref-pill-x" onclick="removeBrand('${escapeHtml(b)}')">&times;</button></span>`)
    .join("");
}

function addBrand() {
  const input = document.getElementById("brandInput");
  const val = input.value.trim().toLowerCase();
  if (!val || prefs.blockedBrands.includes(val)) { input.value = ""; return; }
  prefs.blockedBrands.push(val);
  input.value = "";
  renderBrandPills();
  savePrefs();
}

function removeBrand(brand) {
  prefs.blockedBrands = prefs.blockedBrands.filter((b) => b !== brand);
  renderBrandPills();
  savePrefs();
}

function togglePref(type, cat) {
  const obj = type === "organic" ? prefs.preferOrganic : prefs.preferSwedish;
  obj[cat] = !obj[cat];
  savePrefs();
}

export function renderPreferencesUI() {
  const anchor = document.getElementById("prefsSection");
  if (!anchor) return;

  const cats = getShoppingCategories();

  const brandPillsHtml = prefs.blockedBrands
    .map((b) => `<span class="pref-pill">${escapeHtml(b)}<button class="pref-pill-x" onclick="removeBrand('${escapeHtml(b)}')">&times;</button></span>`)
    .join("");

  const organicToggles = cats.map((cat) => {
    const checked = prefs.preferOrganic[cat] ? "checked" : "";
    return `<label class="pref-toggle"><input type="checkbox" ${checked} onchange="togglePref('organic','${escapeHtml(cat)}')"> ${escapeHtml(cat)}</label>`;
  }).join("");

  const swedishToggles = cats.map((cat) => {
    const checked = prefs.preferSwedish[cat] ? "checked" : "";
    return `<label class="pref-toggle"><input type="checkbox" ${checked} onchange="togglePref('swedish','${escapeHtml(cat)}')"> ${escapeHtml(cat)}</label>`;
  }).join("");

  anchor.innerHTML = `
    <button class="prefs-header" onclick="togglePrefsPanel()">
      ${ICON_GEAR} Inköpspreferenser
      <span class="prefs-chevron" id="prefsChevron">›</span>
    </button>
    <div class="prefs-body" id="prefsBody" style="display:none">
      <div class="prefs-group">
        <div class="prefs-label">Blockade varumärken</div>
        <div class="prefs-brand-row">
          <input id="brandInput" type="text" placeholder="Lägg till varumärke..." class="prefs-brand-input"
                 onkeydown="if(event.key==='Enter'){addBrand();event.preventDefault()}">
          <button class="prefs-brand-add" onclick="addBrand()">+</button>
        </div>
        <div id="brandPills" class="prefs-pills">${brandPillsHtml}</div>
      </div>
      ${cats.length ? `
      <div class="prefs-group">
        <div class="prefs-label">Välj ekologiskt</div>
        <div class="prefs-toggles">${organicToggles}</div>
      </div>
      <div class="prefs-group">
        <div class="prefs-label">Välj svenskproducerat</div>
        <div class="prefs-toggles">${swedishToggles}</div>
      </div>` : ""}
      <div id="prefsError" class="prefs-error" style="display:none"></div>
    </div>
  `;
}

function togglePrefsPanel() {
  const body = document.getElementById("prefsBody");
  const chev = document.getElementById("prefsChevron");
  const open = body.style.display === "none";
  body.style.display = open ? "" : "none";
  chev.classList.toggle("open", open);
}

export function buildPrompt() {
  const unchecked = getUncheckedItems();
  const uncheckedManual = getUncheckedManualItems();
  const totalCount = Object.values(unchecked).reduce((s, a) => s + a.length, 0) + uncheckedManual.length;
  if (totalCount === 0) return null;

  const lines = [];
  lines.push("Du ska handla på willys.se åt mig. Gå till willys.se och logga in om det behövs.");
  lines.push("");
  lines.push("Sök efter varje ingrediens i sökfältet, välj den produkt som bäst matchar beskrivningen, och lägg den i varukorgen.");
  lines.push("");
  lines.push("VIKTIGT: Vänta 2 sekunder efter att du lagt en vara i varukorgen innan du går vidare till nästa. Sidan behöver tid att registrera.");

  if (prefs.blockedBrands.length > 0) {
    lines.push("");
    lines.push(`UNDVIK dessa varumärken: ${prefs.blockedBrands.join(", ")}`);
  }

  const orgCats = Object.entries(prefs.preferOrganic).filter(([, v]) => v).map(([k]) => k);
  if (orgCats.length > 0) {
    lines.push("");
    lines.push(`VÄLJ EKOLOGISKT för varor i dessa kategorier: ${orgCats.join(", ")}`);
  }

  const sweCats = Object.entries(prefs.preferSwedish).filter(([, v]) => v).map(([k]) => k);
  if (sweCats.length > 0) {
    lines.push("");
    lines.push(`VÄLJ SVENSKPRODUCERAT för varor i dessa kategorier: ${sweCats.join(", ")}`);
  }

  lines.push("");
  lines.push("Inköpslista:");

  for (const [cat, items] of Object.entries(unchecked)) {
    lines.push("");
    lines.push(`## ${cat}`);
    for (const item of items) lines.push(`- ${item}`);
  }

  if (uncheckedManual.length > 0) {
    lines.push("");
    lines.push("## Övrigt (manuellt tillagda)");
    for (const item of uncheckedManual) lines.push(`- ${item}`);
  }

  return lines.join("\n");
}

export function renderPromptButton() {
  const anchor = document.getElementById("promptBtnSection");
  if (!anchor) return;

  const unchecked = getUncheckedItems();
  const uncheckedManual = getUncheckedManualItems();
  const totalCount = Object.values(unchecked).reduce((s, a) => s + a.length, 0) + uncheckedManual.length;

  anchor.innerHTML = `
    <button class="shop-dispatch-prompt-btn" onclick="copyAIPrompt()" ${totalCount === 0 ? "disabled" : ""}>
      ${ICON_CLIPBOARD} Kopiera AI-inköpsprompt
    </button>
  `;
}

async function copyAIPrompt() {
  const prompt = buildPrompt();
  if (!prompt) return;

  const btn = document.querySelector(".shop-dispatch-prompt-btn");
  try {
    await navigator.clipboard.writeText(prompt);
    btn.textContent = "Kopierat!";
    setTimeout(() => renderPromptButton(), 2000);
  } catch {
    const modal = document.getElementById("dispatchModal");
    const body = document.getElementById("dispatchModalBody");
    body.innerHTML = `
      <p>Markera och kopiera texten (Ctrl+C):</p>
      <textarea class="prompt-textarea" readonly>${escapeHtml(prompt)}</textarea>
      <div class="dispatch-actions"><button onclick="closeDispatchModal()">Stäng</button></div>
    `;
    modal.style.display = "";
    body.querySelector("textarea").select();
  }
}

export async function initPreferences() {
  await loadPrefs();
  renderPreferencesUI();
  renderPromptButton();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

window.addBrand = addBrand;
window.removeBrand = removeBrand;
window.togglePref = togglePref;
window.togglePrefsPanel = togglePrefsPanel;
window.copyAIPrompt = copyAIPrompt;
