// Valfritt larm-pling till en webhook (t.ex. en gratis ntfy.sh-topic) när något
// degraderar tyst — i första hand när Willys-feeden slutar ge erbjudanden, vilket
// annars ser ut som "inga reor denna vecka" i stället för "integrationen är bruten".
//
// HELT INERT utan env: returnerar direkt om ALERT_WEBHOOK saknas, så det är säkert
// att anropa överallt. Sätt ALERT_WEBHOOK i Vercel (t.ex. https://ntfy.sh/<din-topic>)
// för att aktivera. Sväljer alla fel — ett larm får aldrig fälla anropet det larmar om.
export async function notifyAlert(message) {
  const url = process.env.ALERT_WEBHOOK;
  if (!url) return false;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: String(message).slice(0, 500),
      signal: AbortSignal.timeout(3000),
    });
    return true;
  } catch {
    return false;
  }
}
