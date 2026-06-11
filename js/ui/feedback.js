// Feedback-primitiver: toast-notiser + bekräftelsedialog.
// Ersätter native alert()/confirm() som är blockerande och störande på mobil.
// Inga beroenden — bygger sin egen DOM vid behov och städar efter sig.

// ── Toast ────────────────────────────────────────────────────────────────────
// showToast('Vara borttagen', { type: 'success', action: { label: 'Ångra', onClick } })
// type: 'info' | 'success' | 'error'. Fel ligger kvar längre.

let _host = null;
function toastHost() {
  if (_host && document.body.contains(_host)) return _host;
  _host = document.createElement('div');
  _host.id = 'toastHost';
  _host.setAttribute('aria-live', 'polite');
  document.body.appendChild(_host);
  return _host;
}

export function showToast(message, { type = 'info', duration, action = null } = {}) {
  const host = toastHost();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;
  el.appendChild(text);

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  };

  if (action && action.label) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.type = 'button';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { dismiss(); action.onClick?.(); });
    el.appendChild(btn);
  }

  // Max 2 toasts samtidigt — äldsta åker ut
  while (host.children.length >= 2) host.firstChild.remove();
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));

  const ms = duration ?? (type === 'error' ? 5000 : action ? 5000 : 3000);
  setTimeout(dismiss, ms);
  return dismiss;
}

// ── Bekräftelsedialog ────────────────────────────────────────────────────────
// const ok = await confirmDialog({ title, message, confirmLabel, danger });
// Promise<boolean>. Escape/backdrop = avbryt. Fokus hamnar på avbryt-knappen
// (säkraste valet) — bekräfta kräver ett aktivt tryck.

export function confirmDialog({
  title = 'Är du säker?',
  message = '',
  confirmLabel = 'OK',
  cancelLabel = 'Avbryt',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-box" role="alertdialog" aria-modal="true" aria-label="">
        <h3 class="confirm-title"></h3>
        <p class="confirm-msg"></p>
        <div class="confirm-actions">
          <button type="button" class="confirm-cancel"></button>
          <button type="button" class="confirm-ok${danger ? ' danger' : ''}"></button>
        </div>
      </div>`;
    overlay.querySelector('.confirm-title').textContent = title;
    overlay.querySelector('[aria-label]').setAttribute('aria-label', title);
    const msgEl = overlay.querySelector('.confirm-msg');
    if (message) msgEl.textContent = message; else msgEl.remove();
    overlay.querySelector('.confirm-cancel').textContent = cancelLabel;
    overlay.querySelector('.confirm-ok').textContent = confirmLabel;

    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      overlay.classList.remove('show');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => overlay.remove(), 200);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape') finish(false); };

    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
    overlay.querySelector('.confirm-cancel').addEventListener('click', () => finish(false));
    overlay.querySelector('.confirm-ok').addEventListener('click', () => finish(true));
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('show');
      overlay.querySelector('.confirm-cancel').focus();
    });
  });
}

window.showToast     = showToast;
window.confirmDialog = confirmDialog;
