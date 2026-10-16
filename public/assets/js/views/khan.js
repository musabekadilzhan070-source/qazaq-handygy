import { api } from '../api.js';
import { html, render, raw, icon, bar, paragraphs, toast, stateBlock, fadeImages, observeReveal } from '../ui.js';
import { state, topicProgress, toggleChecklist, setRead, onChange, bestTopicScore } from '../store.js';
import { mountQuiz } from '../quiz.js';
import { portraitFrame, medal, pad2 } from './parts.js';

const SECTIONS = [
  ['info', 'Негізгі мәліметтер'],
  ['bio', 'Өмірбаяны'],
  ['inner', 'Ішкі саясаты'],
  ['outer', 'Сыртқы саясаты'],
  ['events', 'Маңызды оқиғалар'],
  ['dates', 'Маңызды даталар'],
  ['terms', 'Тұлғалар мен ұғымдар'],
  ['remember', 'Есте сақта!'],
  ['test', 'Тақырыптық тест'],
  ['check', 'Чек-лист'],
];
const KIND_TITLE = { person: 'Тарихи тұлғалар', place: 'Жер-су атаулары', term: 'Тарихи ұғымдар' };

function sectionShell(key, no, extraCls, body) {
  const title = SECTIONS.find((s) => s[0] === key)[1];
  return html`<section class="sec reveal ${extraCls}" id="sec-${key}" aria-labelledby="h-${key}">
    <header class="sec__head"><span class="sec__no"><span>${no}</span></span><h2 id="h-${key}">${title}</h2></header>
    ${body}
  </section>`;
}

/** Per-khan blocks (for Kerei & Zhanibek every khan gets his own sub-section). */
function perKhan(topic, field, emptyText) {
  const list = topic.khans.filter((k) => (k[field] || '').trim());
  if (!list.length) return html`<p class="hint">${emptyText}</p>`;
  const pair = topic.khans.length > 1;
  return list.map(
    (k) => html`<div class="sub">
      ${pair ? medal(k) : ''}
      <div class="sec__text">${pair ? html`<h3>${k.name}</h3>` : ''}${paragraphs(k[field])}</div>
    </div>`,
  );
}

function disputeNote(item) {
  if (!item.disputed && !item.note) return '';
  return html`<div class="dispute">${icon('alert')}<span>${item.disputed ? 'Деректерде әртүрлі. ' : ''}${item.note}</span></div>`;
}

function checklistBlock(topic, filter) {
  const items = topic.checklist;
  const done = state.progress.checklist;
  const p = topicProgress({ checklist_ids: items.map((i) => i.id) });
  const shown = items.filter((i) => (filter === 'done' ? done.has(i.id) : filter === 'todo' ? !done.has(i.id) : true));
  return html`<div class="check-top">
      <div class="meter" style="flex:1;min-width:220px;margin:0">
        <div class="meter__top"><span>Орындалды: ${p.done} / ${p.total}</span><b>${p.percent}%</b></div>
        ${bar(p.percent, p.total && p.done === p.total ? 'bar--ok' : '')}
      </div>
      <div class="segmented" role="tablist" aria-label="Сүзгі">
        <button data-filter="all" class="${filter === 'all' ? 'is-active' : ''}">Барлығы</button>
        <button data-filter="done" class="${filter === 'done' ? 'is-active' : ''}">Орындалған</button>
        <button data-filter="todo" class="${filter === 'todo' ? 'is-active' : ''}">Орындалмаған</button>
      </div>
    </div>
    ${
      shown.length
        ? html`<ul class="checklist">
          ${shown.map(
            (i) => html`<li><label class="check ${done.has(i.id) ? 'is-done' : ''}">
              <input type="checkbox" data-item="${i.id}" ${done.has(i.id) ? 'checked' : ''}>
              <span class="check__box"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span>
              <span class="check__text">${i.text}${i.auto === 'quiz' ? html`<small>Тақырыптық тестті тапсырғанда автоматты түрде белгіленеді</small>` : ''}</span>
            </label></li>`,
          )}
        </ul>`
        : html`<p class="hint">${filter === 'done' ? 'Әзірге орындалған тапсырма жоқ.' : filter === 'todo' ? 'Барлық тапсырма орындалды!' : 'Тапсырмалар әлі қосылмаған.'}</p>`
    }
    <p class="check-note" data-save-note>${state.user ? 'Белгілер аккаунтыңда сақталады.' : 'Белгілер осы құрылғыда сақталады. Басқа құрылғыдан да көру үшін аккаунтқа кір.'}</p>`;
}

export async function khanView(root, id) {
  render(root, stateBlock({ spinner: true, text: 'Тақырып жүктелуде…' }));
  let topic;
  try {
    topic = await api(`/api/topics/${id}`);
  } catch (err) {
    render(
      root,
      stateBlock({
        iconName: 'alert',
        title: err.status === 404 ? 'Тақырып табылмады' : 'Жүктеу мүмкін болмады',
        text: err.message,
        action: html`<a class="btn btn--gold" href="#/">Басты бетке оралу</a>`,
      }),
    );
    return;
  }
  // remember checklist ids + auto items for progress calculations
  const listed = state.topics.find((t) => t.id === topic.id);
  if (listed) {
    listed.checklist_ids = topic.checklist.map((c) => c.id);
    listed._autoIds = topic.checklist.filter((c) => c.auto === 'quiz').map((c) => c.id);
  }
  document.title = `${topic.title} · QAZAQ HANDYǴY`;

  const pair = topic.khans.length > 1;
  const total = state.topics.length;
  const read = () => state.progress.reads.has(topic.id);
  let filter = 'all';

  const termsByKind = ['person', 'place', 'term']
    .map((kind) => [kind, topic.terms.filter((t) => t.kind === kind)])
    .filter(([, list]) => list.length);

  render(
    root,
    html`<div class="view wrap">
      <nav class="crumbs" aria-label="Жол"><a href="#/">Басты бет</a><span>/</span><a href="#/khans">Хандар</a><span>/</span><span>${topic.title}</span></nav>

      <section class="khan-hero">
        <div class="khan-hero__portraits ${pair ? 'is-pair' : ''}">
          ${topic.khans.map((k) => portraitFrame(k, { variant: 'large', caption: pair, eager: true }))}
        </div>
        <div>
          <div class="khan-hero__num">${pad2(topic.number)} / ${pad2(total)}</div>
          <h1>${topic.title}</h1>
          ${topic.reign_label ? html`<div class="khan-hero__reign">${topic.reign_label}</div>` : ''}
          <p class="khan-hero__lead">${topic.summary}</p>
          <div class="khan-hero__actions">
            <a class="btn btn--gold" href="#sec-check" data-jump="check">${icon('list')} Чек-лист</a>
            <a class="btn" href="#sec-test" data-jump="test">${icon('quiz')} Тест</a>
            <button class="btn btn--ghost" data-read>${read() ? html`${icon('check')} Оқылды` : html`${icon('eye')} Оқылды деп белгілеу`}</button>
          </div>
          <div class="meter" data-hero-meter></div>
        </div>
      </section>

      <nav class="toc" aria-label="Бөлімдер">
        ${SECTIONS.map(([key, title]) => html`<a href="#sec-${key}" data-jump="${key}">${title}</a>`)}
      </nav>

      ${sectionShell(
        'info',
        1,
        '',
        html`<div class="facts">
            ${topic.khans.map(
              (k) => html`<div class="fact"><div class="fact__k">Толық аты</div><div class="fact__v">${k.full_name || k.name}</div></div>
                <div class="fact"><div class="fact__k">Билік құрған жылдары${pair ? ` · ${k.name}` : ''}</div><div class="fact__v">${k.reign || 'Деректерде көрсетілмеген'}</div></div>`,
            )}
          </div>
          <div class="sub"><div class="sec__text"><h4>Тарихтағы орны</h4>${paragraphs(topic.place_in_history)}</div></div>
          <div class="sub"><div class="sec__text"><h4>Кезеңнің негізгі ерекшеліктері</h4>${paragraphs(topic.era_features)}</div></div>
          ${topic.khans.some((k) => k.contribution)
            ? html`<div class="sub"><div class="sec__text"><h4>${pair ? 'Қазақ хандығының құрылуына қосқан үлесі' : 'Тарихи үлесі'}</h4>
              ${topic.khans.filter((k) => k.contribution).map((k) => html`<p>${pair ? html`<b style="color:var(--gold-hi)">${k.name}:</b> ` : ''}${k.contribution}</p>`)}</div></div>`
            : ''}`,
      )}
      ${sectionShell('bio', 2, '', perKhan(topic, 'biography', 'Өмірбаян әлі толтырылмаған.'))}
      ${sectionShell('inner', 3, '', perKhan(topic, 'internal_policy', 'Бұл бөлім әлі толтырылмаған.'))}
      ${sectionShell('outer', 4, '', perKhan(topic, 'external_policy', 'Бұл бөлім әлі толтырылмаған.'))}
      ${sectionShell(
        'events',
        5,
        '',
        topic.events.length
          ? html`<div class="events">${topic.events.map(
              (e) => html`<article class="event">${e.year_label ? html`<span class="event__year">${e.year_label}</span>` : ''}<h3>${e.title}</h3><p>${e.description}</p>${disputeNote(e)}</article>`,
            )}</div>`
          : html`<p class="hint">Оқиғалар әлі қосылмаған.</p>`,
      )}
      ${sectionShell(
        'dates',
        6,
        '',
        topic.dates.length
          ? html`<ol class="timeline">${topic.dates.map(
              (d) => html`<li><span class="timeline__y">${d.year_label}</span><span>${d.text}${disputeNote(d)}</span></li>`,
            )}</ol>`
          : html`<p class="hint">Даталар әлі қосылмаған.</p>`,
      )}
      ${sectionShell(
        'terms',
        7,
        '',
        termsByKind.length
          ? html`<div class="terms">${termsByKind.map(
              ([kind, list]) => html`<div><h3>${icon(kind === 'person' ? 'user' : kind === 'place' ? 'scroll' : 'book')} ${KIND_TITLE[kind]}</h3>
                <dl>${list.map((t) => html`<dt>${t.name}</dt><dd>${t.description}</dd>`)}</dl></div>`,
            )}</div>`
          : html`<p class="hint">Әлі қосылмаған.</p>`,
      )}
      ${sectionShell(
        'remember',
        8,
        'remember',
        topic.remember.length ? html`<ul>${topic.remember.map((r) => html`<li>${r}</li>`)}</ul>` : html`<p class="hint">Әлі толтырылмаған.</p>`,
      )}
      ${sectionShell('test', 9, '', html`<div class="quiz" data-quiz></div>`)}
      ${sectionShell('check', 10, '', html`<div data-checklist></div>`)}

      <nav class="pager" aria-label="Тақырыптар">
        ${topic.prev ? html`<a class="prev" href="#/khan/${topic.prev.id}"><small>${icon('left')} Алдыңғы тақырыпқа қайту</small>${topic.prev.title}</a>` : html`<a class="prev" href="#/"><small>${icon('left')} Басты бет</small>Хандар тізімі</a>`}
        ${topic.next ? html`<a class="next" href="#/khan/${topic.next.id}"><small>Келесі ханға өту ${icon('right')}</small>${topic.next.title}</a>` : html`<a class="next" href="#/final"><small>Соңғы тақырып ${icon('right')}</small>Қорытынды тестке өту</a>`}
      </nav>
    </div>`,
  );
  fadeImages(root);
  observeReveal(root);

  const checkEl = root.querySelector('[data-checklist]');
  const heroMeter = root.querySelector('[data-hero-meter]');
  const readBtn = root.querySelector('[data-read]');
  function drawProgress() {
    render(checkEl, checklistBlock(topic, filter));
    const p = topicProgress({ checklist_ids: topic.checklist.map((c) => c.id) });
    const best = bestTopicScore(topic.id);
    render(
      heroMeter,
      html`<div class="meter__top"><span>Тақырыпты меңгеру: ${p.done} / ${p.total}${best !== null ? ` · Тест: ${best}%` : ''}</span><b>${p.percent}%</b></div>${bar(p.percent, p.total && p.done === p.total ? 'bar--ok' : '')}`,
    );
    render(readBtn, read() ? html`${icon('check')} Оқылды` : html`${icon('eye')} Оқылды деп белгілеу`);
  }
  drawProgress();
  const off = onChange(() => {
    if (!document.body.contains(checkEl)) return off();
    drawProgress();
  });

  checkEl.addEventListener('change', async (e) => {
    const input = e.target.closest('input[data-item]');
    if (!input) return;
    try {
      const r = await toggleChecklist(Number(input.dataset.item), input.checked);
      const note = checkEl.querySelector('[data-save-note]');
      if (note) note.innerHTML = `${icon('check')} ${r.saved === 'server' ? 'Сақталды (аккаунтта)' : 'Сақталды (осы құрылғыда)'}`;
    } catch (err) {
      toast(err.message || 'Белгіні сақтау мүмкін болмады.', 'error');
    }
  });
  checkEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter;
    drawProgress();
  });
  readBtn.addEventListener('click', async () => {
    try {
      await setRead(topic.id, !read());
      toast(read() ? 'Тақырып оқылды деп белгіленді.' : 'Белгі алынды.', 'ok', 2200);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  root.querySelectorAll('[data-jump]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(`sec-${a.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }),
  );

  // highlight the active section chip
  const toc = root.querySelector('.toc');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          const key = en.target.id.replace('sec-', '');
          toc.querySelectorAll('a').forEach((a) => a.classList.toggle('is-active', a.dataset.jump === key));
          toc.querySelector(`a[data-jump="${key}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
        }
      },
      { rootMargin: '-40% 0px -55% 0px' },
    );
    root.querySelectorAll('.sec').forEach((s) => io.observe(s));
  }

  mountQuiz(root.querySelector('[data-quiz]'), { kind: 'topic', topicId: topic.id, topicTitle: topic.title, questionCount: topic.question_count });

  return raw('');
}
