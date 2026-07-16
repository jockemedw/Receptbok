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
  // Ingen aria-live på hosten — varje toast styr själv via role="alert"
  // (fel, assertivt) resp. role="status" (info/success, polite). En permanent
  // polite live-region här skulle annars kapa fel-toasternas assertiva annonsering.
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

    // Spara triggern så fokus kan återlämnas när dialogen stängs.
    const opener = document.activeElement;

    // Lås bakgrunden: inert + aria-hidden på syskonen (döljer dem för
    // skärmläsare och tangentbord, så aria-modal-löftet faktiskt hålls) och
    // frys body-scroll så sidan inte rör sig bakom modalen på mobil.
    const prevOverflow = document.body.style.overflow;
    const backdropKin = [];
    Array.from(document.body.children).forEach((child) => {
      if (child === overlay || child.id === 'toastHost') return;
      backdropKin.push([child, child.hasAttribute('inert'), child.getAttribute('aria-hidden')]);
      child.setAttribute('inert', '');
      child.setAttribute('aria-hidden', 'true');
    });
    document.body.style.overflow = 'hidden';

    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      overlay.classList.remove('show');
      overlay.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      backdropKin.forEach(([child, hadInert, prevHidden]) => {
        if (!hadInert) child.removeAttribute('inert');
        if (prevHidden === null) child.removeAttribute('aria-hidden');
        else child.setAttribute('aria-hidden', prevHidden);
      });
      setTimeout(() => overlay.remove(), 200);
      resolve(val);
      // Återlämna fokus till det element som öppnade dialogen (om det finns kvar).
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        opener.focus();
      }
    };
    // Lyssna på overlayen (inte document) — då hanterar varje dialog bara sina
    // egna tangenttryck, och två samtidigt öppna dialoger krockar inte.
    const onKey = (e) => {
      if (e.key === 'Escape') { finish(false); return; }
      if (e.key === 'Tab') {
        // Fånga Tab inom .confirm-box så fokus inte vandrar ut till bakgrunden.
        const focusable = overlay.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
    overlay.querySelector('.confirm-cancel').addEventListener('click', () => finish(false));
    overlay.querySelector('.confirm-ok').addEventListener('click', () => finish(true));
    overlay.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('show');
      overlay.querySelector('.confirm-cancel').focus();
    });
  });
}

window.showToast     = showToast;
window.confirmDialog = confirmDialog;
