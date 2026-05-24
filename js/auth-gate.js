import { auth } from './supabase-client.js';

const GATE_HTML = `
  <div id="authGate" class="auth-gate" role="dialog" aria-modal="true" aria-labelledby="authGateTitle">
    <div class="auth-card">
      <h1 class="auth-title" id="authGateTitle">Recept<em>boken</em></h1>
      <p class="auth-tagline">Logga in för att se familjens matsedel.</p>
      <form id="authForm" autocomplete="on">
        <div class="auth-field">
          <label class="auth-label" for="authEmail">E-postadress</label>
          <input type="email" id="authEmail" class="auth-input" required
                 placeholder="namn@exempel.se" autocomplete="email" inputmode="email">
        </div>
        <div class="auth-field">
          <label class="auth-label" for="authPassword">Lösenord</label>
          <input type="password" id="authPassword" class="auth-input" required
                 placeholder="••••••••" autocomplete="current-password">
        </div>
        <button type="submit" class="auth-submit">Logga in</button>
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
  const password = document.getElementById('authPassword').value;
  const submit = event.target.querySelector('[type=submit]');
  const status = document.getElementById('authStatus');
  if (!email || !password) return;

  submit.disabled = true;
  submit.textContent = 'Loggar in…';
  status.textContent = '';
  status.classList.remove('auth-status-error');

  const { error } = await auth.signInWithPassword({ email, password });
  if (error) {
    submit.disabled = false;
    submit.textContent = 'Logga in';
    status.textContent = 'Fel e-post eller lösenord — prova igen.';
    status.classList.add('auth-status-error');
  }
  // vid lyckat login: onAuthStateChange i requireAuth() fångar SIGNED_IN → hideGate()
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
