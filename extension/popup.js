// Popup-UI: visar status + tillåter uppdatera shared secret/storeId och manuell refresh.

const $ = (id) => document.getElementById(id);

async function load() {
  const data = await chrome.storage.local.get(["secret", "storeId", "lastRefreshAt", "lastError"]);
  $("secretInput").value = data.secret || "";
  $("storeIdInput").value = data.storeId || "2160";
  renderStatus(data.lastRefreshAt, data.lastError);
}

function renderStatus(lastRefreshAt, lastError) {
  const dot = $("statusDot");
  const label = $("statusLabel");
  const last = $("lastRefresh");
  dot.className = "dot";
  if (lastError) {
    dot.classList.add("red");
    label.textContent = `Fel: ${lastError}`;
    last.textContent = "";
    return;
  }
  if (!lastRefreshAt) {
    dot.classList.add("yellow");
    label.textContent = "Inte uppdaterad än";
    last.textContent = "Logga in på willys.se så fångas cookies automatiskt.";
    return;
  }
  const ageMs = Date.now() - new Date(lastRefreshAt).getTime();
  const ageDays = Math.floor(ageMs / 86_400_000);
  if (ageDays >= 80) {
    dot.classList.add("red");
    label.textContent = "Kritiskt — uppdatera snart";
  } else if (ageDays >= 60) {
    dot.classList.add("yellow");
    label.textContent = "Uppdatera snart";
  } else {
    dot.classList.add("green");
    label.textContent = "Aktuell";
  }
  last.textContent = `Senast uppdaterad: ${new Date(lastRefreshAt).toLocaleString("sv-SE")} (${ageDays}d sedan)`;
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
    await chrome.storage.local.set({ lastError: `Refresh failade: ${err.message}` });
    await load().catch(() => { /* render-failure hanteras nedan */ });
  } finally {
    $("refreshBtn").disabled = false;
    $("refreshBtn").textContent = "Uppdatera nu";
  }
});

load().catch((err) => {
  $("statusLabel").textContent = `Kunde inte läsa inställningar: ${err.message}`;
});
