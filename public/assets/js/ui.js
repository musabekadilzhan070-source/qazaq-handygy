// Ортақ UI көмекшілері: қауіпсіз HTML шаблоны, иконкалар, тосттар, жүктелу индикаторы.

class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}
export const raw = (s) => new Raw(String(s));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function fmt(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  return esc(v);
}

/** Tagged template: every interpolated value is escaped unless wrapped in raw()/html``. */
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += fmt(vals[i]);
  });
  return new Raw(out);
}

export function render(el, tpl) {
  el.innerHTML = tpl instanceof Raw ? tpl.s : esc(tpl);
}

/** Plain text with blank-line paragraphs → <p> blocks (escaped). */
export function paragraphs(text) {
  const parts = String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return html`${parts.map((p) => html`<p>${p}</p>`)}`;
}

const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z"/>',
  scroll: '<path d="M8 3h11a2 2 0 0 1 2 2v2h-4"/><path d="M17 7v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1h10v1"/><path d="M8 3a2 2 0 0 0-2 2v13"/><path d="M10 8h4M10 12h4"/>',
  quiz: '<path d="M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V14"/><circle cx="12" cy="17.5" r=".6"/><rect x="3" y="3" width="18" height="18" rx="4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  alert: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  motion: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4"/><path d="M12 13v4M8 21h8M9 17h6"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h8V3M8 21v-7h8v7"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 9"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
};

export function icon(name, cls = '') {
  return raw(`<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`);
}

/** Шаңырақ — logo mark. */
export const brandMark = raw(`<svg class="brand__mark" viewBox="0 0 48 48" aria-hidden="true">
  <defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3dc8f"/><stop offset=".55" stop-color="#d4af37"/><stop offset="1" stop-color="#9c7a24"/></linearGradient></defs>
  <circle cx="24" cy="24" r="21" fill="none" stroke="url(#bm)" stroke-width="2.4"/>
  <circle cx="24" cy="24" r="15.5" fill="none" stroke="url(#bm)" stroke-width="1.2" stroke-opacity=".6"/>
  <path d="M14 9.5 C20 18 20 30 14 38.5 M24 3 V45 M34 9.5 C28 18 28 30 34 38.5 M9.5 14 C18 20 30 20 38.5 14 M3 24 H45 M9.5 34 C18 28 30 28 38.5 34" fill="none" stroke="url(#bm)" stroke-width="1.8" stroke-linecap="round"/>
</svg>`);

export function ring(percent, size = 64, label = true) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const off = c * (1 - p / 100);
  return raw(`<svg class="ring" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${p}%">
    <circle class="ring__bg" cx="32" cy="32" r="${r}"/>
    <circle class="ring__fg" cx="32" cy="32" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/>
    ${label ? `<text x="32" y="33" font-size="${size > 90 ? 15 : 15}">${p}%</text>` : ''}
  </svg>`);
}

export function bar(percent, cls = '') {
  const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
  return raw(`<div class="bar ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><i style="width:${p}%"></i></div>`);
}

// ─── Toasts ────────────────────────────────────────────────────────
let toastHost;
export function toast(message, type = 'ok', ms = 3200) {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toasts';
    toastHost.setAttribute('role', 'status');
    toastHost.setAttribute('aria-live', 'polite');
    document.body.append(toastHost);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert' : type === 'info' ? 'info' : 'check')}<div>${esc(message)}</div>`;
  toastHost.append(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 320);
  }, ms);
}

// ─── Top loading bar ───────────────────────────────────────────────
let loadEl;
let pending = 0;
export function loading(on) {
  if (!loadEl) {
    loadEl = document.createElement('div');
    loadEl.className = 'loadbar';
    document.body.append(loadEl);
  }
  pending = Math.max(0, pending + (on ? 1 : -1));
  if (pending > 0) {
    loadEl.classList.remove('is-done');
    void loadEl.offsetWidth;
    loadEl.classList.add('is-active');
  } else {
    loadEl.classList.remove('is-active');
    loadEl.classList.add('is-done');
  }
}

export function stateBlock({ spinner = false, iconName, title, text, action }) {
  return html`<div class="state">
    ${spinner ? raw('<div class="spinner" aria-hidden="true"></div>') : ''}
    ${iconName ? icon(iconName) : ''}
    ${title ? html`<h2>${title}</h2>` : ''}
    ${text ? html`<p>${text}</p>` : ''}
    ${action || ''}
  </div>`;
}

/** Fade-in for <img> once decoded, so portraits appear smoothly. */
export function fadeImages(root) {
  root.querySelectorAll('img[data-fade]').forEach((img) => {
    const done = () => img.classList.add('is-loaded');
    if (img.complete && img.naturalWidth) done();
    else {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
  });
}

/** Reveal-on-scroll for elements with .reveal */
let io;
export function observeReveal(root) {
  const els = root.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach((e) => e.classList.add('is-in'));
    return;
  }
  io ||= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  );
  els.forEach((e) => io.observe(e));
}

export function formatDate(sqlDate) {
  if (!sqlDate) return '—';
  const d = new Date(sqlDate.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return sqlDate;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Motion preference: 'full' | 'calm' | '' (follow the system setting). */
export function applyMotion(siteDefault) {
  let pref = '';
  try {
    pref = localStorage.getItem('qh_motion') || '';
  } catch {
    /* storage unavailable */
  }
  const value = pref || (siteDefault === 'calm' ? 'calm' : '');
  if (value) document.documentElement.dataset.motion = value;
  else delete document.documentElement.dataset.motion;
  return value;
}
export function setMotion(value) {
  try {
    localStorage.setItem('qh_motion', value);
  } catch {
    /* ignore */
  }
  applyMotion();
}
export function motionReduced() {
  const m = document.documentElement.dataset.motion;
  if (m === 'calm') return true;
  if (m === 'full') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
