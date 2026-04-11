// ─── Erbjudande-adapter — hämtar erbjudanden från konfigurerad källa ────────
import { readFileRaw } from "./github.js";

export async function fetchOffers() {
  const source = process.env.OFFER_SOURCE || "mock";

  switch (source) {
    case "tjek":  return fetchTjek();
    case "ica":   return fetchIca();
    case "mock":
    default:      return fetchMock();
  }
}

// ── Mock — läser offers.json från repot ─────────────────────────────────────
async function fetchMock() {
  try {
    const data = await readFileRaw("offers.json");
    return { offers: data.offers || [], source: "mock" };
  } catch {
    return { offers: [], source: "mock" };
  }
}

// ── Tjek/eTilbudsavis — stub (kräver TJEK_API_KEY) ─────────────────────────
async function fetchTjek() {
  const apiKey = process.env.TJEK_API_KEY;
  if (!apiKey) return { offers: [], source: "tjek-no-key" };

  const lat = process.env.TJEK_LAT || "58.41";
  const lng = process.env.TJEK_LNG || "15.62";
  const radius = process.env.TJEK_RADIUS || "5000";

  try {
    const res = await fetch(
      `https://api.etilbudsavis.dk/v2/offers/search?r_lat=${lat}&r_lng=${lng}&r_radius=${radius}&limit=100`,
      { headers: { "X-Api-Key": apiKey } }
    );
    if (!res.ok) return { offers: [], source: "tjek-error" };
    const raw = await res.json();
    const offers = (raw || []).map((o) => ({
      id: o.id,
      product: o.heading || "",
      price: o.pricing?.price ?? null,
      originalPrice: o.pricing?.pre_price ?? null,
      discount: o.pricing?.percent ? `-${Math.round(o.pricing.percent)}%` : null,
      validUntil: o.run_till || null,
    }));
    return { offers, source: "tjek" };
  } catch {
    return { offers: [], source: "tjek-error" };
  }
}

// ── ICA inofficiellt API — stub (kräver ICA_USERNAME + ICA_PASSWORD) ────────
async function fetchIca() {
  const user = process.env.ICA_USERNAME;
  const pass = process.env.ICA_PASSWORD;
  if (!user || !pass) return { offers: [], source: "ica-no-key" };

  // TODO: Implementera vid behov
  // 1. POST https://handla.api.ica.se/api/login (Basic auth) → AuthenticationTicket
  // 2. GET https://handla.api.ica.se/api/offers?Stores=XXXX
  return { offers: [], source: "ica-stub" };
}
