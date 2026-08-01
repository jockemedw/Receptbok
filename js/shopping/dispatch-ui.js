// Dispatch-UI: knapp → butiksval → confirm → POST → resultat-modal.
// Läser state: window._shopRecipeItems (för räkning i confirm-dialog)
// Feature-toggled via GET /api/dispatch-to-willys vid tab-load.
//
// Butikerna (Willys/Hemköp) kommer från backend — frontend hårdkodar varken
// namn eller URL:er, så en ny Axfood-butik bara dyker upp i väljaren.

import { initPreferences } from './dispatch-preferences.js';
import { escapeHtml } from '../utils.js';

const ICON_HOURGLASS = '<svg class="icon icon-em-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12 M6 20h12 M6 4l6 8-6 8 M18 4l-6 8 6 8"/></svg>';

// Butikslistan från GET-anropet: [{ id, label, available, connectVia, connectedAs }]
//   connectVia 'password'  → butiken kan kopplas här i appen (Hemköp)
//   connectVia 'extension' → kräver webbläsartillägget (Willys — BankID)
let stores = [];

function storeLabel(id) {
  return stores.find(s => s.id === id)?.label || 'butiken';
}

export async function initDispatchUI() {
  initPreferences();

  const btn = document.getElementById("dispatchToWillysBtn");
  if (!btn) return;
  try {
    const res = await fetch("/api/dispatch-to-willys");
    if (!res.ok) { btn.style.display = "none"; return; }
    const data = await res.json();
    // Äldre backend svarar utan stores[] — behandla det som enbart Willys, så
    // knappen aldrig försvinner för att frontend deployats före backend.
    stores = Array.isArray(data.stores) && data.stores.length
      ? data.stores
      : [{ id: 'willys', label: 'Willys', available: !!data.featureAvailable }];
    btn.style.display = data.featureAvailable ? "" : "none";
  } catch {
    btn.style.display = "none";
  }
}

// Butiksväljaren visar ALLA butiker, även de utan cookies — annars finns ingen
// synlig väg till att koppla den andra butiken.
export function openStorePicker() {
  if (window._opBusy) return;   // dispatch pågår redan (F078)
  const body = document.getElementById("shopStoreBody");
  if (!body) return;

  body.innerHTML = stores.map(storeRowHtml).join("");
  window.openBottomSheet?.('shopStoreSheet');
}

// En rad per butik. Tre lägen:
//   kopplad             → tryckbar, plus en diskret "Ändra"-väg om den kopplades med lösenord
//   okopplad + password → tryckbar, öppnar inloggningsformuläret här i appen
//   okopplad + extension→ död rad med förklaring (Willys kräver BankID i webbläsaren)
function storeRowHtml(s) {
  const id = escapeHtml(s.id);
  const label = escapeHtml(s.label);

  if (s.available) {
    const account = s.connectedAs
      ? `<span class="storepick-account">${escapeHtml(s.connectedAs)}</span>`
      : '';
    const edit = s.connectVia === 'password'
      ? `<button type="button" class="storepick-edit" onclick="event.stopPropagation();openStoreLogin('${id}')"
                 aria-label="Ändra inloggning för ${label}">Ändra</button>`
      : '';
    return `<div class="storepick-line">
      <button type="button" class="storepick-row" onclick="chooseDispatchStore('${id}')">
        <span class="storepick-name">${label}${account}</span>
        <span class="storepick-go" aria-hidden="true">→</span>
      </button>${edit}
    </div>`;
  }

  if (s.connectVia === 'password') {
    return `<button type="button" class="storepick-row is-connect" onclick="openStoreLogin('${id}')">
      <span class="storepick-name">${label}</span>
      <span class="storepick-hint">Koppla med ditt konto hos ${label} →</span>
    </button>`;
  }

  return `<div class="storepick-row is-off">
    <span class="storepick-name">${label}</span>
    <span class="storepick-hint">Behöver kopplas — logga in på butikens sajt i webbläsaren där tillägget är installerat</span>
  </div>`;
}

// ── Koppla butik med eget konto ─────────────────────────────────────────────
// Lösenordet lämnar aldrig fältet annat än i POST:en till vår egen endpoint,
// och skickas aldrig tillbaka därifrån. Formuläret ersätter butikslistan i
// samma sheet — inget nytt lager att stänga sig ur.

export function openStoreLogin(storeId) {
  const s = stores.find(x => x.id === storeId);
  const body = document.getElementById("shopStoreBody");
  if (!s || !body) return;

  const label = escapeHtml(s.label);
  body.innerHTML = `<form class="storelogin" onsubmit="return saveStoreLogin(event, '${escapeHtml(s.id)}')">
    <p class="storelogin-lead">Logga in med ditt vanliga konto hos ${label}. Uppgifterna sparas krypterat och används bara för att fylla din varukorg.</p>
    <label class="storelogin-label" for="storeLoginUser">E-post eller användarnamn</label>
    <input class="storelogin-input" id="storeLoginUser" type="email" inputmode="email"
           autocomplete="username" autocapitalize="none" spellcheck="false"
           value="${escapeHtml(s.connectedAs || '')}" required>
    <label class="storelogin-label" for="storeLoginPass">Lösenord</label>
    <input class="storelogin-input" id="storeLoginPass" type="password"
           autocomplete="current-password" required>
    <p class="storelogin-err" id="storeLoginErr" role="alert"></p>
    <button type="submit" class="daypick-save" id="storeLoginSave">Koppla ${label}</button>
    ${s.connectedAs ? `<button type="button" class="storelogin-remove" onclick="removeStoreLogin('${escapeHtml(s.id)}')">Ta bort uppgifterna</button>` : ''}
    <button type="button" class="daypick-cancel" onclick="openStorePicker()">Tillbaka</button>
  </form>`;
  document.getElementById("storeLoginUser")?.focus();
}

export async function saveStoreLogin(event, storeId) {
  event.preventDefault();
  const btn = document.getElementById("storeLoginSave");
  const err = document.getElementById("storeLoginErr");
  const username = document.getElementById("storeLoginUser")?.value.trim();
  const password = document.getElementById("storeLoginPass")?.value;
  if (!username || !password) return false;

  btn.disabled = true;
  btn.textContent = "Loggar in…";
  if (err) err.textContent = "";
  try {
    const res = await window.apiFetch("/api/dispatch-to-willys?op=save-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store: storeId, username, password }),
    });
    let data = {};
    try { data = await res.json(); } catch { /* ingen JSON */ }
    if (!res.ok) throw new Error(data.error || "");

    await initDispatchUI();          // hämtar om butiksstatus
    openStorePicker();               // tillbaka till listan, butiken nu kopplad
    window.showToast?.(`${storeLabel(storeId)} är kopplad — nu kan listan skickas dit.`, { type: "success" });
  } catch (e) {
    btn.disabled = false;
    btn.textContent = `Koppla ${storeLabel(storeId)}`;
    if (err) err.textContent = e.message || "Kunde inte koppla butiken — prova igen.";
  }
  return false;
}

export async function removeStoreLogin(storeId) {
  const ok = await window.confirmDialog({
    title: "Ta bort uppgifterna?",
    message: `Din inloggning hos ${storeLabel(storeId)} raderas. Du kan koppla butiken igen när du vill.`,
    confirmLabel: "Ta bort",
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await window.apiFetch("/api/dispatch-to-willys?op=clear-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store: storeId }),
    });
    if (!res.ok) throw new Error();
    await initDispatchUI();
    openStorePicker();
    window.showToast?.("Uppgifterna är borttagna.", { type: "success" });
  } catch {
    window.showToast?.("Kunde inte ta bort uppgifterna — prova igen.", { type: "error" });
  }
}

export function chooseDispatchStore(storeId) {
  window.closeBottomSheet?.('shopStoreSheet');
  openDispatchConfirm(storeId);
}

export function openDispatchConfirm(storeId) {
  if (window._opBusy) return;   // dispatch pågår redan — hindra ny bekräftelse (F078)
  const items = window._shopRecipeItems || {};
  const recipeCount = Object.values(items).reduce((sum, arr) => sum + (arr?.length || 0), 0);
  const manualCount = (window._shopManualItems || []).length;
  const totalCount = recipeCount + manualCount;
  if (totalCount === 0) {
    showResult(`
      <p>Inköpslistan är tom — inget att skicka.</p>
      <div class="dispatch-actions"><button onclick="closeDispatchModal()">Stäng</button></div>
    `);
    return;
  }
  const label = storeLabel(storeId);
  setModalTitle(`Skicka till ${label}`);
  showResult(`
    <p>Skicka ${totalCount} ingrediens${totalCount !== 1 ? 'er' : ''} till din ${escapeHtml(label)}-korg?</p>
    <p class="dispatch-note">Matchade produkter läggs in i korgen. Omatchade rapporteras efteråt så du kan lägga till dem själv.</p>
    <div class="dispatch-actions">
      <button class="btn-secondary" onclick="closeDispatchModal()">Avbryt</button>
      <button class="btn-primary" id="dispatchRunBtn" onclick="runDispatch('${escapeHtml(storeId)}')">Skicka</button>
    </div>
  `);
}

export async function runDispatch(storeId) {
  if (window._opBusy) return;   // spärr mot dubbel dispatch (F078)
  window._opBusy = true;
  const label = storeLabel(storeId);
  const mainBtn = document.getElementById("dispatchToWillysBtn");
  if (mainBtn) mainBtn.disabled = true;
  const runBtn = document.getElementById("dispatchRunBtn");
  if (runBtn) { runBtn.disabled = true; runBtn.textContent = "Skickar…"; }
  showResult(`
    <p>Skickar till ${escapeHtml(label)}…</p>
    <div class="dispatch-loader">${ICON_HOURGLASS}</div>
  `);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch("/api/dispatch-to-willys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store: storeId, date: new Date().toISOString().slice(0, 10) }),
      signal: controller.signal,
    });
    const data = await res.json();
    renderResult(data, label);
  } catch (err) {
    const msg = err.name === "AbortError"
      ? `Tog för lång tid — ${label} svarade inte. Prova igen om en stund.`
      : `Kunde inte nå ${label}. Prova igen om en stund.`;
    showResult(`
      <p>${escapeHtml(msg)}</p>
      <div class="dispatch-actions"><button onclick="closeDispatchModal()">Stäng</button></div>
    `);
  } finally {
    clearTimeout(timeoutId);
    window._opBusy = false;
    if (mainBtn) mainBtn.disabled = false;
  }
}

function renderResult(data, fallbackLabel) {
  const label = data.store?.label || fallbackLabel || 'butiken';
  if (data.ok) {
    const missingHtml = (data.missing || []).length
      ? `<p class="dispatch-missing-header">Kunde inte matchas (lägg till själv):</p>
         <ul class="dispatch-missing">${data.missing.map(m => `<li>${escapeHtml(m)}</li>`).join("")}</ul>`
      : "";
    const sources = data.sources || {};
    // Butiker utan rea-flöde (Hemköp) matchar allt via sök — visa då bara den
    // siffran i stället för ett förvirrande "0 från rea".
    const sourceNote = (sources.rea || sources.search)
      ? `<p class="dispatch-sources">${sources.rea
          ? `${sources.rea} från rea, ${sources.search || 0} från sök`
          : `${sources.search || 0} från sök`}</p>`
      : "";
    // Eko/svenskt-preferenser som inte kunde uppfyllas (backlog #20) — varan
    // ligger i korgen men i vanlig variant; byt själv i butiken om viktigt.
    const prefHtml = (data.prefMisses || []).length
      ? `<p class="dispatch-sources">Kunde inte fås som ${
          [...new Set(data.prefMisses.flatMap(p => p.wanted || []))].join("/")
        }: ${data.prefMisses.map(p => escapeHtml(p.canon)).join(", ")} — vanlig variant ligger i korgen.</p>`
      : "";
    // Inköpsrundor: erbjud stämpling — aldrig automatiskt (korgen är fylld men
    // köpet inte genomfört, och omatchade varor kan behöva handlas ändå).
    const markBtn = (window._shopCoverage || []).some((r) => !r.shopped_at)
      ? `<button class="btn-secondary" onclick="closeDispatchModal();markRoundShopped()">Markera som inhandlat</button>`
      : "";
    const cartUrl = data.cartUrl || "https://www.willys.se/";
    setModalTitle(`Skickat till ${label}`);
    showResult(`
      <p>✓ ${data.addedCount} produkt${data.addedCount !== 1 ? 'er' : ''} tillagda i din ${escapeHtml(label)}-korg.</p>
      ${sourceNote}
      ${prefHtml}
      ${missingHtml}
      <div class="dispatch-actions">
        <a class="btn-primary" href="${escapeHtml(cartUrl)}" target="_blank" rel="noopener">Öppna ${escapeHtml(label)} →</a>
        ${markBtn}
        <button class="btn-secondary" onclick="closeDispatchModal()">Stäng</button>
      </div>
    `);
    return;
  }
  showResult(`
    <p>${escapeHtml(data.message || "Något gick fel — prova igen om en stund.")}</p>
    <div class="dispatch-actions"><button onclick="closeDispatchModal()">Stäng</button></div>
  `);
}

function setModalTitle(text) {
  const el = document.getElementById("dispatchModalTitle");
  if (el) el.textContent = text;
}

function showResult(html) {
  const modal = document.getElementById("dispatchModal");
  const body = document.getElementById("dispatchModalBody");
  body.innerHTML = html;
  modal.style.display = "";
  document.body.style.overflow = "hidden";              // lås bakgrundsscroll (Session 121)
}

export function closeDispatchModal() {
  document.getElementById("dispatchModal").style.display = "none";
  document.body.style.overflow = "";                    // släpp bakgrundsscroll
}

export function handleDispatchOverlayClick(event) {
  if (event.target.id === "dispatchModal") closeDispatchModal();
}

// Exponera på window för inline onclick
window.openStorePicker = openStorePicker;
window.chooseDispatchStore = chooseDispatchStore;
window.openDispatchConfirm = openDispatchConfirm;
window.runDispatch = runDispatch;
window.closeDispatchModal = closeDispatchModal;
window.handleDispatchOverlayClick = handleDispatchOverlayClick;
window.initDispatchUI = initDispatchUI;
window.openStoreLogin = openStoreLogin;
window.saveStoreLogin = saveStoreLogin;
window.removeStoreLogin = removeStoreLogin;
