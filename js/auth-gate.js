// Magic-link login-gate. requireAuth() returnerar en Promise som löses
// först när användaren har en giltig Supabase-session.

import { auth } from './supabase-client.js';

const GATE_HTML = `
  <div id="authGate" class="auth-gate" role="dialog" aria-modal="true" aria-labelledby="authGateTitle">
    <div class="auth-card">
      <h1 class="auth-title" id="authGateTitle">Recept<em>boken</em></h1>
      <p class="auth-tagline">Logga in med din e-post för att se familjens matsedel.</p>
      <form id="authForm" autocomplete="on">
        <label class="auth-label" for="authEmail">E-postadress</label>
        <input type="email" id="authEmail" class="auth-input" required
               placeholder="namn@exempel.se" autocomplete="email" inputmode="email">
        <button type="submit" id="authSubmit" class="auth-submit">Skicka inloggningslänk</button>
      </form>
      <p class="auth-status" id="authStatus" role="status" aria-live="polite"></p>
    </div>
  </div>
`;

function ensureGateMarkup() {
  if (document.getElementById('authGate')) return;
  document.body.insertAdjacentHTML('beforeend', GATE_HTML);
  document.getElementById('authForm').addEventListener('submit', handleSubmit);
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

async function handleSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const submit = document.getElementById('authSubmit');
  const status = document.getElementById('authStatus');
  if (!email) return;

  submit.disabled = true;
  submit.textContent = 'Skickar…';
  status.textContent = '';
  status.classList.remove('auth-status-error');

  try {
    const { error } = await auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (error) throw error;
    status.textContent = `Vi har skickat en länk till ${email}. Öppna mailet på samma enhet för att logga in.`;
    submit.textContent = 'Länk skickad';
  } catch (e) {
    submit.disabled = false;
    submit.textContent = 'Skicka inloggningslänk';
    status.textContent = 'Kunde inte skicka länken — kontrollera att e-posten stämmer och prova igen.';
    status.classList.add('auth-status-error');
    console.error('Magic-link error:', e);
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
