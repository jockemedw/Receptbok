// Dispatch-UI: knapp → confirm → POST → resultat-modal.
// Läser state: window._shopRecipeItems (för räkning i confirm-dialog)
// Feature-toggled via GET /api/dispatch-to-willys vid tab-load.

const CART_URL = "https://www.willys.se/cart";

export async function initDispatchUI() {
  const btn = document.getElementById("dispatchToWillysBtn");
  if (!btn) return;
  try {
    const res = await fetch("/api/dispatch-to-willys");
    if (!res.ok) { btn.style.display = "none"; return; }
    const data = await res.json();
    btn.style.display = data.featureAvailable ? "" : "none";
  } catch {
    btn.style.display = "none";
  }
}

export function openDispatchConfirm() {
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
  showResult(`
    <p>Skicka ${totalCount} ingredienser till din Willys-korg?</p>
    <p class="dispatch-note">Matchade produkter (rea och söknings-träffar) läggs in i korgen. Omatchade rapporteras efteråt så du kan lägga till dem själv.</p>
    <div class="dispatch-actions">
      <button class="btn-secondary" onclick="closeDispatchModal()">Avbryt</button>
      <button class="btn-primary" id="dispatchRunBtn" onclick="runDispatch()">Skicka</button>
    </div>
  `);
}

export async function runDispatch() {
  const runBtn = document.getElementById("dispatchRunBtn");
  if (runBtn) { runBtn.disabled = true; runBtn.textContent = "Skickar…"; }
  showResult(`
    <p>Skickar till Willys…</p>
    <div class="dispatch-loader">⏳</div>
  `);
  try {
    const res = await fetch("/api/dispatch-to-willys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: new Date().toISOString().slice(0, 10) }),
    });
    const data = await res.json();
    renderResult(data);
  } catch {
    showResult(`
      <p>Kunde inte nå Willys. Prova igen om en stund.</p>
      <div class="dispatch-actions"><button onclick="closeDispatchModal()">Stäng</button></div>
    `);
  }
}

function renderResult(data) {
  if (data.ok) {
    const missingHtml = (data.missing || []).length
      ? `<p class="dispatch-missing-header">Kunde inte matchas (lägg till själv):</p>
         <ul class="dispatch-missing">${data.missing.map(m => `<li>${escapeHtml(m)}</li>`).join("")}</ul>`
      : "";
    const sources = data.sources || {};
    const sourceNote = (sources.rea || sources.search)
      ? `<p class="dispatch-sources">${sources.rea || 0} från rea, ${sources.search || 0} från sök</p>`
      : "";
    showResult(`
      <p>✓ ${data.addedCount} produkter tillagda i din Willys-korg.</p>
      ${sourceNote}
      ${missingHtml}
      <div class="dispatch-actions">
        <a class="btn-primary" href="${CART_URL}" target="_blank" rel="noopener">Öppna din korg på willys.se →</a>
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

function showResult(html) {
  const modal = document.getElementById("dispatchModal");
  const body = document.getElementById("dispatchModalBody");
  body.innerHTML = html;
  modal.style.display = "";
}

export function closeDispatchModal() {
  document.getElementById("dispatchModal").style.display = "none";
}

export function handleDispatchOverlayClick(event) {
  if (event.target.id === "dispatchModal") closeDispatchModal();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Exponera på window för inline onclick
window.openDispatchConfirm = openDispatchConfirm;
window.runDispatch = runDispatch;
window.closeDispatchModal = closeDispatchModal;
window.handleDispatchOverlayClick = handleDispatchOverlayClick;
window.initDispatchUI = initDispatchUI;
