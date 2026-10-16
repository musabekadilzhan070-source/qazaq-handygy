import { html, render, icon, toast } from './ui.js';
import { login, register } from './store.js';

let dialog;

export function openAuth(tab = 'login') {
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'modal';
    dialog.setAttribute('aria-labelledby', 'auth-title');
    document.body.append(dialog);
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
      const t = e.target.closest('[data-tab]');
      if (t) draw(t.dataset.tab);
    });
    dialog.addEventListener('submit', onSubmit);
  }
  draw(tab);
  dialog.showModal();
  dialog.querySelector('input')?.focus();
}

function draw(tab) {
  dialog.dataset.mode = tab;
  const isLogin = tab === 'login';
  render(
    dialog,
    html`<div class="modal__card">
      <button class="modal__close" data-close aria-label="Жабу">${icon('x')}</button>
      <h2 id="auth-title" style="margin:0 0 4px">${isLogin ? 'Аккаунтқа кіру' : 'Жаңа аккаунт ашу'}</h2>
      <p class="hint" style="margin:0">Чек-лист белгілері мен тест нәтижелерің серверде сақталады.</p>
      <div class="auth-tabs" role="tablist">
        <button type="button" data-tab="login" class="${isLogin ? 'is-active' : ''}">Кіру</button>
        <button type="button" data-tab="register" class="${!isLogin ? 'is-active' : ''}">Тіркелу</button>
      </div>
      <form novalidate>
        ${isLogin ? '' : html`<label class="field"><span>Аты-жөнің</span><input name="displayName" autocomplete="name" maxlength="60" placeholder="Мысалы: Айгерім Сейітқызы"></label>`}
        <label class="field"><span>Логин</span><input name="username" autocomplete="username" required minlength="3" maxlength="32" autocapitalize="off" spellcheck="false"></label>
        <label class="field"><span>Құпиясөз</span><input name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required minlength="6"></label>
        ${isLogin ? '' : html`<p class="hint" style="margin-top:-6px">Логин: 3–32 таңба. Құпиясөз: кемінде 6 таңба.</p>`}
        <p class="form-error" data-error role="alert"></p>
        <button class="btn btn--gold btn--block" type="submit">${isLogin ? 'Кіру' : 'Тіркелу'}</button>
      </form>
    </div>`,
  );
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const err = form.querySelector('[data-error]');
  const btn = form.querySelector('button[type=submit]');
  const data = Object.fromEntries(new FormData(form));
  err.textContent = '';
  if ((data.username || '').trim().length < 3) return (err.textContent = 'Логинді енгізіңіз (кемінде 3 таңба).');
  if ((data.password || '').length < 6) return (err.textContent = 'Құпиясөз кемінде 6 таңбадан тұруы керек.');
  btn.disabled = true;
  try {
    const r = dialog.dataset.mode === "login" ? await login(data.username.trim(), data.password) : await register(data.username.trim(), data.password, (data.displayName || '').trim());
    dialog.close();
    toast(r.imported ? 'Қош келдің! Осы құрылғыдағы белгілерің аккаунтқа көшірілді.' : 'Қош келдің! Прогресің енді аккаунтта сақталады.', 'ok', 4200);
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false;
  }
}
