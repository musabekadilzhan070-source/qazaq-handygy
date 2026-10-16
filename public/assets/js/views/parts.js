// Портреттер, медальондар және карточкаларға ортақ бөліктер.
import { html, raw } from '../ui.js';

/** Arch-framed portrait. The picture itself is never altered: only framing, light and shadow via CSS. */
export function portraitFrame(khan, { variant = 'card', caption = false, eager = false } = {}) {
  const src = khan.portrait ? (variant === 'large' ? khan.portrait.large : khan.portrait.card) : null;
  return html`<figure class="frame">
    <div class="frame__arch">
      ${
        src
          ? html`<img src="${src}" alt="${khan.name} портреті" data-fade ${raw(eager ? 'fetchpriority="high"' : 'loading="lazy"')} decoding="async">`
          : html`<div class="frame__empty">Портрет әлі жүктелмеген</div>`
      }
    </div>
    ${caption ? html`<figcaption class="frame__cap">${khan.name}${khan.reign ? html`<small>${khan.reign}</small>` : ''}</figcaption>` : ''}
  </figure>`;
}

export function medal(khan, cls = '') {
  return html`<span class="medal ${cls}">${khan.portrait ? html`<img src="${khan.portrait.card}" alt="" decoding="async">` : ''}</span>`;
}

export const pad2 = (n) => String(n).padStart(2, '0');

/** Card tilt + light follow, skipped on touch screens and when motion is reduced. */
export function attachTilt(root, reduced) {
  if (reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  root.querySelectorAll('.card').forEach((card) => {
    let frame = 0;
    card.addEventListener('pointermove', (e) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        const k = card.classList.contains('card--pair') ? 3 : 5;
        card.style.setProperty('--ry', `${(x - 0.5) * k}deg`);
        card.style.setProperty('--rx', `${(0.5 - y) * k}deg`);
        card.style.setProperty('--mx', `${x * 100}%`);
        card.style.setProperty('--my', `${y * 100}%`);
      });
    });
    card.addEventListener('pointerleave', () => {
      cancelAnimationFrame(frame);
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  });
}
