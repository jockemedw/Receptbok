// Butiksregister för Axfood-plattformen (Willys + Hemköp).
//
// Willys och Hemköp kör samma e-handelsmotor: /axfood/rest/cart, /search och
// produktkoder i formatet <id>_ST / <id>_KG är identiska. Skillnaden mellan
// butikerna är bas-URL:en och vilken cookie-uppsättning som används — därför
// samlas allt butiksspecifikt här i stället för att spridas ut i klienterna.
// Verifierat skarpt mot hemkop.se i scripts/hemkop-cart-poc.mjs (2026-06-23).
//
// hasOffers: bara Willys har ett rea-/campaigns-flöde inkopplat (api/willys-offers.js).
//   Hemköp matchas uteslutande via produktsök. Det är ett medvetet avgränsningsbeslut
//   — Hemköps campaigns-endpoint kräver ett butiks-ID vi inte har, och prisoptimeringen
//   läser Willys.
// hasEnvFallback: bara Willys har legacy-env-vars (WILLYS_COOKIE/WILLYS_CSRF) från
//   tiden före secret gist. Hemköp har aldrig haft några och ska inte tyst ärva Willys.

export const STORES = {
  willys: {
    id: "willys",
    label: "Willys",
    baseUrl: "https://www.willys.se",
    // Startsidan, INTE /cart — den 404:ar. Butiken kommer ihåg både vald butik
    // och korgen via sessionscookien, så användaren landar rätt ändå.
    cartUrl: "https://www.willys.se/",
    cookieDomain: "willys.se",
    hasOffers: true,
    hasEnvFallback: true,
  },
  hemkop: {
    id: "hemkop",
    label: "Hemköp",
    baseUrl: "https://www.hemkop.se",
    cartUrl: "https://www.hemkop.se/",
    cookieDomain: "hemkop.se",
    hasOffers: false,
    hasEnvFallback: false,
  },
};

// Willys är default överallt där butik inte anges — gammal frontend och gammal
// extension fortsätter därmed fungera oförändrat efter den här ändringen.
export const DEFAULT_STORE = "willys";

export const STORE_IDS = Object.keys(STORES);

// Okänt id ger null (→ 400 uppåt), aldrig en tyst Willys-fallback: att skicka
// varor till fel butik är värre än ett tydligt fel.
export function resolveStore(id) {
  if (id === undefined || id === null || id === "") return STORES[DEFAULT_STORE];
  return STORES[String(id).toLowerCase()] || null;
}
