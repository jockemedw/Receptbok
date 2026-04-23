// Klient för Willys cart-API.
// Reverse-engineered + verifierad i scripts/willys-cart-poc.mjs (Session 37).
//
// Auth: cookies-sträng (inkl. JSESSIONID + axfoodRememberMe) + x-csrf-token-header.
// Cookies har livslängd ≈ 3 mån (knutna till axfoodRememberMe). CSRF följer med.
//
// Alla operationer kräver båda delarna — preflight misslyckas annars med 401.

const BASE = "https://www.willys.se";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

export function createCartClient({ fetchImpl = fetch, cookies, csrf }) {
  function baseHeaders(extra = {}) {
    return {
      "user-agent": UA,
      "accept": "*/*",
      "accept-language": "sv-SE,sv;q=0.9",
      "cookie": cookies,
      ...extra,
    };
  }

  async function preflight() {
    const res = await fetchImpl(`${BASE}/axfood/rest/cart`, {
      method: "GET",
      headers: baseHeaders(),
    });
    return { ok: res.ok, status: res.status };
  }

  async function addProducts(codes) {
    const body = JSON.stringify({
      products: codes.map(code => ({
        productCodePost: code,
        qty: 1,
        pickUnit: "pieces",
        hideDiscountToolTip: false,
        noReplacementFlag: false,
      })),
    });
    const res = await fetchImpl(`${BASE}/axfood/rest/cart/addProducts`, {
      method: "POST",
      headers: baseHeaders({
        "content-type": "application/json",
        "origin": BASE,
        "referer": `${BASE}/`,
        "x-csrf-token": csrf || "",
      }),
      body,
    });
    let parsed = null;
    try { parsed = await res.json(); } catch { /* body not JSON */ }
    return { ok: res.ok, status: res.status, response: parsed };
  }

  async function verifyCart() {
    const res = await fetchImpl(`${BASE}/axfood/rest/cart`, {
      method: "GET",
      headers: baseHeaders(),
    });
    if (!res.ok) return { ok: false, status: res.status, entries: [] };
    const data = await res.json();
    return { ok: true, status: 200, entries: data.entries || data.products || [] };
  }

  return { preflight, addProducts, verifyCart };
}
