// OTP-kod login-gate (tvåstegs). requireAuth() returnerar en Promise som löses
// när användaren har en giltig Supabase-session.
// Steg 1: ange e-post → Supabase skickar 6-siffrig kod via mejl.
// Steg 2: ange koden i appen → session skapas i appens kontext.

import { auth } from './supabase-client.js';

let pendingEmail = '';

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
        <button type="button" id="authBack" class="auth-back">&larr; Ändra e-post</button>
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
  document.getElementById('authBack').addEventListener('click', showEmailStep);
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
}

function showGate() {
  ensureGateMarkup();
  document.documentElement.classList.add('auth-required');
}

function hideGate() {
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

async function handleEmailSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const submit = event.target.querySelector('[type=submit]');
  if (!email) return;

  submit.disabled = true;
  submit.textContent = 'Skickar…';
  setStatus('');

  try {
    const { error } = await auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) throw error;
    pendingEmail = email;
    submit.disabled = false;
    submit.textContent = 'Skicka engångskod';
    showCodeStep(email);
  } catch (e) {
    submit.disabled = false;
    submit.textContent = 'Skicka engångskod';
    setStatus('Kunde inte skicka koden — kontrollera att e-posten stämmer och prova igen.', true);
    console.error('OTP send error:', e);
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
      type: 'email',
    });
    if (error) throw error;
    // onAuthStateChange i requireAuth() fångar SIGNED_IN och stänger gaten
  } catch (e) {
    submit.disabled = false;
    submit.textContent = 'Logga in';
    setStatus('Fel kod eller koden har gått ut — prova igen eller klicka "Ändra e-post" för att begära ny.', true);
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
