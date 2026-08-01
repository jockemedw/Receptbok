// Popup-UI: status per butik + shared secret/storeId + manuell refresh.

const $ = (id) => document.getElementById(id);

const STORES = [
  { id: "willys", label: "Willys", domain: "willys.se" },
  { id: "hemkop", label: "Hemköp", domain: "hemkop.se" },
];

const lastRefreshKey = (store) => `lastRefreshAt_${store}`;
const lastErrorKey = (store) => `lastError_${store}`;

async function load() {
  const keys = ["secret", "storeId", ...STORES.flatMap(s => [lastRefreshKey(s.id), lastErrorKey(s.id)])];
  const data = await chrome.storage.local.get(keys);
  $("secretInput").value = data.secret || "";
  $("storeIdInput").value = data.storeId || "2160";
  renderAll(data);
}

function renderAll(data) {
  $("storeStatuses").innerHTML = STORES.map(s => {
    const { cls, label, detail } = statusFor(s, data[lastRefreshKey(s.id)], data[lastErrorKey(s.id)]);
    return `
      <section class="status">
        <span class="dot ${cls}"></span>
        <span class="label"><strong>${s.label}</strong> — ${escapeHtml(label)}</span>
      </section>
      <p class="last">${escapeHtml(detail)}</p>`;
  }).join("");
}

function statusFor(store, lastRefreshAt, lastError) {
  if (lastError) return { cls: "red", label: `Fel: ${lastError}`, detail: "" };
  if (!lastRefreshAt) {
    return {
      cls: "yellow",
      label: "Inte uppdaterad än",
      detail: `Logga in på ${store.domain} så fångas cookies automatiskt.`,
    };
  }
  const ageDays = Math.floor((Date.now() - new Date(lastRefreshAt).getTime()) / 86_400_000);
  const cls = ageDays >= 80 ? "red" : ageDays >= 60 ? "yellow" : "green";
  const label = ageDays >= 80 ? "Kritiskt — uppdatera snart"
    : ageDays >= 60 ? "Uppdatera snart"
    : "Aktuell";
  return {
    cls,
    label,
    detail: `Senast uppdaterad: ${new Date(lastRefreshAt).toLocaleString("sv-SE")} (${ageDays}d sedan)`,
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

$("settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await chrome.storage.local.set({
    secret: $("secretInput").value.trim(),
    storeId: $("storeIdInput").value.trim() || "2160",
  });
  $("savedMsg").textContent = "Sparat ✓";
  setTimeout(() => { $("savedMsg").textContent = ""; }, 2000);
});

$("refreshBtn").addEventListener("click", async () => {
  $("refreshBtn").disabled = true;
  $("refreshBtn").textContent = "Uppdaterar…";
  try {
    await chrome.runtime.sendMessage({ type: "manual-refresh" });
    await load();
  } catch (err) {
    // Skriv felet på båda butikerna — vi vet inte vilken som fallerade här.
    const patch = {};
    for (const s of STORES) patch[lastErrorKey(s.id)] = `Refresh failade: ${err.message}`;
    await chrome.storage.local.set(patch);
    await load().catch(() => { /* render-failure hanteras nedan */ });
  } finally {
    $("refreshBtn").disabled = false;
    $("refreshBtn").textContent = "Uppdatera nu";
  }
});

load().catch((err) => {
  $("storeStatuses").textContent = `Kunde inte läsa inställningar: ${err.message}`;
});
