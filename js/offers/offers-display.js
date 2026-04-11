// Erbjudande-visning: hämtar offer-data och dekorerar receptkort med badges.

export async function loadOffers() {
  try {
    const res = await fetch("offers-cache.json");
    if (!res.ok) { window._offerMatches = null; return; }
    const data = await res.json();

    // Ignorera data äldre än 7 dagar
    const fetchDate = new Date(data.fetchedDate + "T12:00:00");
    const daysDiff = (Date.now() - fetchDate.getTime()) / 864e5;
    if (daysDiff > 7) { window._offerMatches = null; return; }

    window._offerMatches = data.recipeMatches || {};
    decorateRecipeCards();
    if (window.showOfferToggle) window.showOfferToggle();
  } catch {
    window._offerMatches = null;
  }
}

function decorateRecipeCards() {
  if (!window._offerMatches) return;
  document.querySelectorAll(".recipe-card").forEach((card) => {
    const id = card.dataset.id;
    const match = window._offerMatches[id];
    if (!match || match.matchCount === 0) return;

    const meta = card.querySelector(".card-meta");
    if (!meta || meta.querySelector(".pill-offer")) return;

    const pill = document.createElement("span");
    pill.className = "pill pill-offer";
    pill.textContent = `${match.matchCount} på rea`;
    pill.title = match.matches
      .map((m) => `${m.ingredient}: ${m.offerProduct} ${m.discount}`)
      .join("\n");
    meta.appendChild(pill);
  });
}

export function getOfferBadgeHtml(recipeId) {
  if (!window._offerMatches) return "";
  const match = window._offerMatches[String(recipeId)];
  if (!match || match.matchCount === 0) return "";
  return `<span class="pill pill-offer">${match.matchCount} på rea</span>`;
}

export function getOfferDetailHtml(recipeId) {
  if (!window._offerMatches) return "";
  const match = window._offerMatches[String(recipeId)];
  if (!match || match.matchCount === 0) return "";

  const items = match.matches
    .map(
      (m) =>
        `<li class="offer-match-item">` +
        `<span class="offer-ingredient">${m.ingredient}</span>` +
        `<span class="offer-product">${m.offerProduct}</span>` +
        `<span class="offer-discount">${m.discount}</span>` +
        `</li>`
    )
    .join("");

  return (
    `<div class="detail-section offer-section">` +
    `<h3 class="offer-section-title">Extrapriser just nu</h3>` +
    `<ul class="offer-match-list">${items}</ul>` +
    `</div>`
  );
}

window._offerMatches = null;
window.loadOffers = loadOffers;
window.getOfferBadgeHtml = getOfferBadgeHtml;
window.getOfferDetailHtml = getOfferDetailHtml;
