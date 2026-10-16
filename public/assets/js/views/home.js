import { html, render, icon, ring, bar, fadeImages, observeReveal, motionReduced } from '../ui.js';
import { state, topicProgress, overallProgress, bestTopicScore } from '../store.js';
import { portraitFrame, medal, pad2, attachTilt } from './parts.js';

function rail() {
  return html`<nav class="rail" aria-label="Хандар тізіміне жылдам өту">
    <div class="rail__line" aria-hidden="true"></div>
    ${state.topics.map(
      (t) => html`<a class="rail__item" href="#/khan/${t.id}">
        <span class="rail__faces">${t.khans.map((k) => medal(k))}</span>
        <span class="rail__name">${t.title}</span>
        <span class="rail__year">${t.reign_label}</span>
      </a>`,
    )}
  </nav>`;
}

function card(t) {
  const p = topicProgress(t);
  const pair = t.khans.length > 1;
  const best = bestTopicScore(t.id);
  const read = state.progress.reads.has(t.id);
  const complete = p.total > 0 && p.done === p.total;
  return html`<article class="card ${pair ? 'card--pair' : ''} reveal" data-topic="${t.id}">
    <div class="card__in">
      <span class="card__num">${pad2(t.number)}</span>
      <div class="card__badges">
        ${complete ? html`<span class="badge badge--ok">${icon('check')} Аяқталды</span>` : read ? html`<span class="badge">${icon('eye')} Оқылды</span>` : ''}
        ${best !== null ? html`<span class="badge">${icon('quiz')} Тест: ${best}%</span>` : ''}
      </div>
      <div class="card__portraits">
        ${t.khans.length ? t.khans.map((k) => portraitFrame(k, { caption: pair })) : portraitFrame({ name: t.title })}
      </div>
      <div class="card__body">
        <h3 class="card__title">${t.title}</h3>
        ${t.reign_label ? html`<div class="card__reign">${t.reign_label}</div>` : ''}
        <p class="card__summary">${t.summary}</p>
        <div class="meter">
          <div class="meter__top"><span>Чек-лист: ${p.done} / ${p.total}</span><b>${p.percent}%</b></div>
          ${bar(p.percent, complete ? 'bar--ok' : '')}
        </div>
        <a class="btn btn--gold card__cta" href="#/khan/${t.id}">ХАН ТАРИХЫН ЗЕРТТЕУ ${icon('right')}</a>
      </div>
    </div>
  </article>`;
}

export function homeView(root, { scrollTo } = {}) {
  const s = state.site;
  const o = overallProgress();
  const tests = state.progress.results.length;
  render(
    root,
    html`<div class="view">
      <section class="hero wrap">
        <div class="hero__over">Қазақ хандығы · XV–XVIII ғасырлар</div>
        <h1 class="hero__title">QAZAQ HANDYǴY</h1>
        <p class="hero__slogan">${s.slogan}</p>
        <div class="ornament-rule" aria-hidden="true"></div>
        <p class="hero__intro">${s.hero_intro}</p>
        <div class="hero__actions">
          <a class="btn btn--ghost" href="#/khans">${icon('crown')} Хандар тізіміне өту</a>
          <a class="btn btn--gold" href="#/final">${icon('trophy')} ҚАЗАҚ ХАНДЫҒЫ БОЙЫНША ҚОРЫТЫНДЫ ТЕСТ</a>
        </div>
        <div class="hero__stats">
          <a class="stat" href="#/progress" style="text-decoration:none;color:inherit">${ring(o.percent, 64)}<div><div class="stat__num">${o.percent}%</div><div class="stat__label">Жалпы дайындық деңгейі</div></div></a>
          <div class="stat"><div><div class="stat__num">${o.completed} / ${state.topics.length}</div><div class="stat__label">Аяқталған тақырып</div></div></div>
          <div class="stat"><div><div class="stat__num">${tests}</div><div class="stat__label">Тапсырылған тест</div></div></div>
        </div>
        ${rail()}
      </section>

      <section class="wrap" id="khans">
        <header class="section-head">
          <span class="ornament-mark" aria-hidden="true"></span>
          <h2>${s.cards_heading}</h2>
          <p>${s.cards_intro}</p>
        </header>
        <div class="cards">${state.topics.map(card)}</div>
      </section>

      <section class="wrap">
        <div class="final-banner reveal">
          <div>
            <h2>ҚАЗАҚ ХАНДЫҒЫ БОЙЫНША ҚОРЫТЫНДЫ ТЕСТ</h2>
            <p>${s.final_intro}</p>
          </div>
          <a class="btn btn--gold" href="#/final">${icon('trophy')} Тестті бастау</a>
        </div>
      </section>
    </div>`,
  );
  fadeImages(root);
  observeReveal(root);
  attachTilt(root, motionReduced());
  if (scrollTo === 'khans') {
    requestAnimationFrame(() => document.getElementById('khans')?.scrollIntoView({ behavior: motionReduced() ? 'auto' : 'smooth' }));
  }
}
