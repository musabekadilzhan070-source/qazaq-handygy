import { html, render, icon, ring, brandMark, stateBlock, applyMotion, setMotion, motionReduced, toast } from './ui.js';
import { state, boot, onChange, overallProgress, logout } from './store.js';
import { openAuth } from './auth.js';
import { homeView } from './views/home.js';
import { khanView } from './views/khan.js';
import { finalView } from './views/final.js';
import { progressView } from './views/progress.js';

const main = document.getElementById('main');
const header = document.getElementById('header');
const tabbar = document.getElementById('tabbar');
const footer = document.getElementById('footer');

function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  if (h.startsWith('sec-')) return null; // in-page anchors handled by views
  const m = h.match(/^\/khan\/(\d+)/);
  if (m) return { name: 'khan', id: Number(m[1]) };
  if (h === '/khans') return { name: 'home', scrollTo: 'khans' };
  if (h === '/final') return { name: 'final' };
  if (h === '/progress') return { name: 'progress' };
  return { name: 'home' };
}

function drawHeader(r) {
  const o = overallProgress();
  const active = (name) => (r?.name === name ? 'is-active' : '');
  render(
    header,
    html`<div class="wrap header__in">
      <a class="brand" href="#/" aria-label="QAZAQ HANDYǴY — басты бет">${brandMark}<span class="brand__name">QAZAQ HANDYǴY</span></a>
      <nav class="nav" aria-label="Негізгі мәзір">
        <a href="#/" class="${active('home') && !r.scrollTo ? 'is-active' : ''}">Басты бет</a>
        <a href="#/khans" class="${r?.scrollTo === 'khans' || r?.name === 'khan' ? 'is-active' : ''}">Хандар</a>
        <a href="#/final" class="${active('final')}">Қорытынды тест</a>
        <a href="#/progress" class="${active('progress')}">Прогресс</a>
      </nav>
      <a class="header__progress" href="#/progress" title="Жалпы дайындық деңгейі">${ring(o.percent, 32, false)}<span>${o.percent}%</span><span class="header__progress-label">дайындық</span></a>
      ${
        state.user
          ? html`<button class="btn btn--sm user-btn" data-logout title="Шығу">${icon('user')}<span>${state.user.display_name}</span>${icon('logout')}</button>`
          : html`<button class="btn btn--sm btn--gold" data-login>${icon('user')}<span>Кіру</span></button>`
      }
    </div>`,
  );
  render(
    tabbar,
    html`<a href="#/" class="${active('home') && !r.scrollTo ? 'is-active' : ''}">${icon('home')}Басты</a>
      <a href="#/khans" class="${r?.scrollTo === 'khans' || r?.name === 'khan' ? 'is-active' : ''}">${icon('crown')}Хандар</a>
      <a href="#/final" class="${active('final')}">${icon('trophy')}Тест</a>
      <a href="#/progress" class="${active('progress')}">${icon('chart')}Прогресс</a>`,
  );
}

function drawFooter() {
  const reduced = motionReduced();
  render(
    footer,
    html`<div class="wrap footer__in">
      <div><b style="color:var(--gold-hi);letter-spacing:.12em">QAZAQ HANDYǴY</b><br>${state.site?.footer_text || ''}</div>
      <button data-motion aria-pressed="${reduced}">${icon('motion')} Анимация: ${reduced ? 'азайтылған' : 'қосулы'}</button>
    </div>`,
  );
}

let current = null;
async function navigate() {
  const r = route();
  if (!r) return;
  current = r;
  drawHeader(r);
  if (r.name !== 'khan') document.title = 'QAZAQ HANDYǴY — Қазақ хандығының тарихын зертте';
  window.scrollTo({ top: 0, behavior: 'auto' });
  try {
    if (r.name === 'home') homeView(main, r);
    else if (r.name === 'khan') await khanView(main, r.id);
    else if (r.name === 'final') finalView(main);
    else if (r.name === 'progress') progressView(main);
  } catch (err) {
    console.error(err);
    render(main, stateBlock({ iconName: 'alert', title: 'Бетті көрсету мүмкін болмады', text: err.message, action: html`<a class="btn btn--gold" href="#/">Басты бет</a>` }));
  }
  main.focus({ preventScroll: true });
}

function backdropDust() {
  const host = document.querySelector('.backdrop__dust');
  if (!host || host.childElementCount) return;
  const n = window.innerWidth < 700 ? 10 : 22;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDuration = `${14 + Math.random() * 18}s`;
    s.style.animationDelay = `${-Math.random() * 30}s`;
    s.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
    const size = 1.5 + Math.random() * 2.5;
    s.style.width = s.style.height = `${size}px`;
    host.append(s);
  }
}

document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-login]')) return openAuth('login');
  if (e.target.closest('[data-logout]')) {
    if (!confirm('Аккаунттан шығасыз ба?')) return;
    try {
      await logout();
      toast('Сіз аккаунттан шықтыңыз.', 'info');
    } catch (err) {
      toast(err.message, 'error');
    }
    return;
  }
  if (e.target.closest('[data-motion]')) {
    setMotion(motionReduced() ? 'full' : 'calm');
    drawFooter();
    if (!motionReduced()) backdropDust();
  }
});

(async function start() {
  render(main, stateBlock({ spinner: true, text: 'QAZAQ HANDYǴY жүктелуде…' }));
  try {
    await boot();
  } catch (err) {
    render(main, stateBlock({ iconName: 'alert', title: 'Сайтты жүктеу мүмкін болмады', text: err.message, action: html`<button class="btn btn--gold">Қайта жүктеу</button>` }));
    main.querySelector('button')?.addEventListener('click', () => location.reload());
    return;
  }
  document.documentElement.dataset.gold = state.site.gold_tone || 'classic';
  applyMotion(state.site.effects);
  backdropDust();
  drawFooter();
  let lastUser = state.user?.id ?? null;
  onChange(() => {
    drawHeader(current);
    const u = state.user?.id ?? null;
    if (u !== lastUser) {
      lastUser = u;
      // account switched: redraw the page so it shows this student's own data
      navigate();
    }
  });
  window.addEventListener('hashchange', navigate);
  navigate();
})();
