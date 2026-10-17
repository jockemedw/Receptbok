// Valfritt larm-pling till en webhook (t.ex. en gratis ntfy.sh-topic) när något
// degraderar tyst: när Willys-feeden slutar ge erbjudanden (generate.js), vilket
// annars ser ut som "inga reor denna vecka" i stället för "integrationen är bruten",
// och när butikskopplingen för varukorgsexporten har gått ut (dispatch-to-willys.js).
//
// HELT INERT utan env: returnerar direkt om ALERT_WEBHOOK saknas, så det är säkert
// att anropa överallt. Sätt ALERT_WEBHOOK i Vercel (t.ex. https://ntfy.sh/<din-topic>)
// för att aktivera. Sväljer alla fel — ett larm får aldrig fälla anropet det larmar om.
export async function notifyAlert(message) {
  const url = process.env.ALERT_WEBHOOK;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: String(message).slice(0, 500),
      signal: AbortSignal.timeout(3000),
    });
    // F138: fetch() kastar inte vid HTTP-fel (4xx/5xx) — en död/felkonfig-topic
    // (borttagen ntfy-topic → 404, fel token → 403) rapporterades förut som lyckat
    // larm. Kontrollera res.ok så tyst-larm-detektionen faktiskt blir meningsfull.
    if (!res.ok) {
      console.warn(`notifyAlert: webhook svarade ${res.status}`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
