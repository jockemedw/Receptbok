// OTP-kod login-gate (tvåstegs). requireAuth() returnerar en Promise som löses
// när användaren har en giltig Supabase-session.
// Steg 1: ange e-post → Supabase skickar engångskod via mejl (max 1/min).
// Steg 2: ange koden i appen → session skapas i appens kontext.

import { auth } from './supabase-client.js';

let pendingEmail = '';
let cooldownTimer = null;
let cooldownEnd = 0;
const COOLDOWN_MS = 60_000;

const GATE_HTML = `
  <div id="authGate" class="auth-gate" role="dialog" aria-modal="true" aria-labelledby="authGateTitle">
    <div class="auth-card">
      <h1 class="auth-title" id="authGateTitle">Recept<em>boken</em></h1>

      <div id="authStepEmail">
        <p class="auth-tagline">Logga in för att se familjens matsedel.</p>
        <form id="authEmailForm" autocomplete="on">
          <label class="auth-label" for="authEmail">E-postadress</label>
          <input type="email" id="authEmail" class="auth-input" required
                 placeholder="namn@exempel.se" autocomplete="email" inputmode="email">
          <button type="submit" class="auth-submit">Skicka engångskod</button>
        </form>
      </div>

      <div id="authStepCode" hidden>
        <p class="auth-tagline" id="authCodeTagline"></p>
        <form id="authCodeForm" autocomplete="off">
          <label class="auth-label" for="authCode">Engångskod</label>
          <input type="text" id="authCode" class="auth-input auth-code-input" required
                 placeholder="12345678" inputmode="numeric" maxlength="8" autocomplete="one-time-code">
          <button type="submit" class="auth-submit">Logga in</button>
        </form>
        <div class="auth-back-row">
          <button type="button" id="authResend" class="auth-back" disabled>Skicka ny kod (60s)</button>
          <button type="button" id="authBack" class="auth-back">&larr; Ändra e-post</button>
        </div>
      </div>

      <p class="auth-status" id="authStatus" role="status" aria-live="polite"></p>
    </div>
  </div>
`;

function ensureGateMarkup() {
  if (document.getElementById('authGate')) return;
  document.body.insertAdjacentHTML('beforeend', GATE_HTML);
  document.getElementById('authEmailForm').addEventListener('submit', handleEmailSubmit);
  document.getElementById('authCodeForm').addEventListener('submit', handleCodeSubmit);
  document.getElementById('authResend').addEventListener('click', handleResend);
  document.getElementById('authBack').addEventListener('click', showEmailStep);
}

function startCooldown() {
  cooldownEnd = Date.now() + COOLDOWN_MS;
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = setInterval(tickCooldown, 1000);
  tickCooldown();
}

function tickCooldown() {
  const btn = document.getElementById('authResend');
  if (!btn) { clearInterval(cooldownTimer); return; }
  const remaining = Math.ceil((cooldownEnd - Date.now()) / 1000);
  if (remaining <= 0) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
    btn.disabled = false;
    btn.textContent = 'Skicka ny kod';
  } else {
    btn.disabled = true;
    btn.textContent = `Skicka ny kod (${remaining}s)`;
  }
}

function showEmailStep() {
  document.getElementById('authStepEmail').hidden = false;
  document.getElementById('authStepCode').hidden = true;
  setStatus('');
}

function showCodeStep(email) {
  document.getElementById('authStepEmail').hidden = true;
  document.getElementById('authStepCode').hidden = false;
  document.getElementById('authCodeTagline').textContent =
    `Vi har skickat en kod till ${email}. Ange den här.`;
  const codeInput = document.getElementById('authCode');
  codeInput.value = '';
  codeInput.focus();
  startCooldown();
}

function showGate() {
  ensureGateMarkup();
  document.documentElement.classList.add('auth-required');
}

function hideGate() {
  if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
  const gate = document.getElementById('authGate');
  if (gate) gate.remove();
  document.documentElement.classList.remove('auth-required');
}

function setStatus(msg, isError = false) {
  const status = document.getElementById('authStatus');
  if (!status) return;
  status.textContent = msg;
  status.classList.toggle('auth-status-error', isError);
}

function isRateLimitError(e) {
  return e?.status === 429 || /rate.limit|too many/i.test(e?.message || '');
}

async function sendOtp(email) {
  const { error } = await auth.signInWithOtp({ email });
  if (error) throw error;
}

async function handleEmailSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const submit = event.target.querySelector('[type=submit]');
  if (!email) return;

  submit.disabled = true;
  submit.textContent = 'Skickar…';
  setStatus('');

  try {
    await sendOtp(email);
    pendingEmail = email;
    submit.disabled = false;
    submit.textContent = 'Skicka engångskod';
    showCodeStep(email);
  } catch (e) {
    submit.disabled = false;
    submit.textContent = 'Skicka engångskod';
    const msg = isRateLimitError(e)
      ? 'Du kan bara begära en kod per minut — vänta en stund och prova igen.'
      : 'Kunde inte skicka koden — kontrollera att e-posten stämmer och prova igen.';
    setStatus(msg, true);
    console.error('OTP send error:', e);
  }
}

async function handleResend() {
  if (!pendingEmail) return;
  setStatus('');
  try {
    await sendOtp(pendingEmail);
    startCooldown();
    document.getElementById('authCode').value = '';
    document.getElementById('authCode').focus();
    setStatus('Ny kod skickad.');
  } catch (e) {
    const msg = isRateLimitError(e)
      ? 'Vänta lite till innan du begär en ny kod.'
      : 'Kunde inte skicka ny kod — prova igen.';
    setStatus(msg, true);
    console.error('OTP resend error:', e);
  }
}

async function handleCodeSubmit(event) {
  event.preventDefault();
  const code = document.getElementById('authCode').value.trim();
  const submit = event.target.querySelector('[type=submit]');
  if (!code || !pendingEmail) return;

  submit.disabled = true;
  submit.textContent = 'Verifierar…';
  setStatus('');

  try {
    const { error } = await auth.verifyOtp({
      email: pendingEmail,
      token: code,
      type: 'magiclink',
    });
    if (error) throw error;
    // onAuthStateChange i requireAuth() fångar SIGNED_IN → hideGate()
  } catch (e) {
    submit.disabled = false;
    submit.textContent = 'Logga in';
    setStatus('Fel kod eller koden har gått ut — prova igen eller begär en ny kod.', true);
    console.error('OTP verify error:', e);
  }
}

export async function requireAuth() {
  const { data: { session } } = await auth.getSession();
  if (session) return session;

  showGate();
  return new Promise((resolve) => {
    const { data: sub } = auth.onAuthStateChange((event, sess) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && sess) {
        sub.subscription.unsubscribe();
        hideGate();
        resolve(sess);
      }
    });
  });
}

export async function signOut() {
  await auth.signOut();
  window.location.reload();
}

window.requireAuth = requireAuth;
window.signOut = signOut;
