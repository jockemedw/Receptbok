import { auth, isDbUnreachable, DB_RESTING_MESSAGE } from './supabase-client.js';

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
      <button type="button" class="auth-forgot" id="authForgot">Glömt lösenord?</button>
      <p class="auth-status" id="authStatus" role="status" aria-live="polite"></p>
    </div>
  </div>
`;

// Supabase Auth svarar på engelska — översätt till begriplig svenska
// (CLAUDE.md-regeln: alltid svenska + handlingsorienterad uppmaning).
function friendlyAuthError(error, fallback) {
  if (isDbUnreachable(error)) return DB_RESTING_MESSAGE;
  const msg = String(error?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Fel e-post eller lösenord — prova igen.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'För många försök — vänta en stund och prova igen.';
  return fallback;
}

function ensureGateMarkup() {
  if (document.getElementById('authGate')) return;
  document.body.insertAdjacentHTML('beforeend', GATE_HTML);
  document.getElementById('authForm').addEventListener('submit', handleSubmit);
  document.getElementById('authForgot').addEventListener('click', handleForgotPassword);
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

function setGateStatus(message, isError) {
  const status = document.getElementById('authStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('auth-status-error', !!isError);
}

async function handleSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const submit = event.target.querySelector('[type=submit]');
  if (!email || !password) return;

  submit.disabled = true;
  submit.textContent = 'Loggar in…';
  setGateStatus('', false);

  const { error } = await auth.signInWithPassword({ email, password });
  if (error) {
    submit.disabled = false;
    submit.textContent = 'Logga in';
    setGateStatus(friendlyAuthError(error, 'Kunde inte logga in — prova igen om en stund.'), true);
  }
  // vid lyckat login: onAuthStateChange i requireAuth() fångar SIGNED_IN → hideGate()
}

// ── Glömt lösenord ───────────────────────────────────────────────────────────
// Skickar en återställningslänk via Supabase (självbetjäning i stället för att
// Joakim byter lösenord i dashboarden). Länken leder tillbaka hit; supabase-js
// fångar recovery-sessionen (detectSessionInUrl) och PASSWORD_RECOVERY-lyssnaren
// nedan visar formuläret för nytt lösenord. Registrering är fortsatt avstängd.
async function handleForgotPassword() {
  const email = document.getElementById('authEmail').value.trim();
  if (!email) {
    setGateStatus('Fyll i din e-postadress först, tryck sedan på "Glömt lösenord?" igen.', true);
    document.getElementById('authEmail').focus();
    return;
  }
  const btn = document.getElementById('authForgot');
  btn.disabled = true;
  const { error } = await auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  btn.disabled = false;
  if (error) {
    setGateStatus(friendlyAuthError(error, 'Kunde inte skicka återställningsmejlet — prova igen om en stund.'), true);
    return;
  }
  setGateStatus(`Ett mejl med återställningslänk är skickat till ${email} — öppna länken på den här enheten.`, false);
}

const RECOVERY_HTML = `
  <div id="recoveryGate" class="auth-gate" role="dialog" aria-modal="true" aria-labelledby="recoveryTitle">
    <div class="auth-card">
      <h1 class="auth-title" id="recoveryTitle">Nytt <em>lösenord</em></h1>
      <p class="auth-tagline">Välj ett nytt lösenord för ditt konto.</p>
      <form id="recoveryForm">
        <div class="auth-field">
          <label class="auth-label" for="recoveryPassword">Nytt lösenord</label>
          <input type="password" id="recoveryPassword" class="auth-input" required
                 minlength="8" placeholder="Minst 8 tecken" autocomplete="new-password">
        </div>
        <button type="submit" class="auth-submit">Spara lösenord</button>
      </form>
      <p class="auth-status" id="recoveryStatus" role="status" aria-live="polite"></p>
    </div>
  </div>
`;

function showRecoveryForm() {
  if (document.getElementById('recoveryGate')) return;
  document.body.insertAdjacentHTML('beforeend', RECOVERY_HTML);
  document.getElementById('recoveryForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('recoveryPassword').value;
    const submit = event.target.querySelector('[type=submit]');
    const status = document.getElementById('recoveryStatus');
    submit.disabled = true;
    submit.textContent = 'Sparar…';
    status.classList.remove('auth-status-error');
    const { error } = await auth.updateUser({ password });
    if (error) {
      submit.disabled = false;
      submit.textContent = 'Spara lösenord';
      status.textContent = friendlyAuthError(error, 'Kunde inte byta lösenordet — prova igen.');
      status.classList.add('auth-status-error');
      return;
    }
    document.getElementById('recoveryGate').remove();
    window.showToast?.('Lösenordet är bytt — du är inloggad.', { type: 'success' });
  });
  requestAnimationFrame(() => document.getElementById('recoveryPassword').focus());
}

auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') showRecoveryForm();
});

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
