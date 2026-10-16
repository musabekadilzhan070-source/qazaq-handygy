// Тест компоненті: тақырыптық және қорытынды тест үшін ортақ.
// Дұрыс жауаптар клиентке тек тест тапсырылғаннан кейін, сервер бағалаған соң келеді.
import { api } from './api.js';
import { html, raw, render, icon, ring, bar, toast } from './ui.js';
import { state, recordResult } from './store.js';

const TYPE_HINT = {
  single: 'Бір дұрыс жауапты таңдаңыз',
  multi: 'Бірнеше дұрыс жауап болуы мүмкін: барлығын белгілеңіз',
  order: 'Оқиғаларды ерте кезеңнен кейінгіге қарай ретке қойыңыз',
};

export function mountQuiz(root, { kind, topicId, topicTitle, questionCount, intro }) {
  const s = { phase: 'intro', quiz: null, index: 0, answers: {}, result: null, filter: 'wrong', busy: false };

  function answered(q) {
    const a = s.answers[q.id];
    return q.type === 'order' ? true : Array.isArray(a) && a.length > 0;
  }

  function draw() {
    if (s.phase === 'intro') return drawIntro();
    if (s.phase === 'run') return drawQuestion();
    if (s.phase === 'result') return drawResult();
  }

  function drawIntro() {
    const isFinal = kind === 'final';
    render(
      root,
      html`<div class="quiz__intro">
        <div class="quiz__badge">${icon(isFinal ? 'trophy' : 'quiz')}</div>
        <div>
          <h3 style="margin:0 0 4px">${isFinal ? 'Қазақ хандығы бойынша қорытынды тест' : `«${topicTitle}» тақырыбы бойынша тест`}</h3>
          <p style="margin:0;color:var(--text-2)">${
            intro ||
            (questionCount
              ? `${questionCount} сұрақ. Барлық сұраққа жауап берген соң нәтижеңді, қателеріңді және дұрыс жауаптарды көресің.`
              : 'Бұл тақырыпқа әзірге сұрақ қосылмаған.')
          }</p>
          ${state.user ? '' : html`<p class="hint" style="margin:6px 0 0">Нәтиже аккаунтыңда сақталуы үшін жоғарыдағы «Кіру» батырмасы арқылы кір.</p>`}
        </div>
        <button class="btn btn--gold" data-q="start" ${questionCount === 0 || s.busy ? 'disabled' : ''}>${s.busy ? 'Жүктелуде…' : 'Тестті бастау'}</button>
      </div>`,
    );
  }

  function drawQuestion() {
    const qs = s.quiz.questions;
    const q = qs[s.index];
    const total = qs.length;
    const answeredCount = qs.filter(answered).length;
    if (q.type === 'order' && !s.answers[q.id]) s.answers[q.id] = q.options.map((o) => o.id);
    const sel = s.answers[q.id] || [];
    const last = s.index === total - 1;

    let body;
    if (q.type === 'order') {
      const byId = new Map(q.options.map((o) => [o.id, o]));
      body = html`<ol class="order-list">
        ${sel.map(
          (id, i) => html`<li class="order-item">
            <span class="order-item__n">${i + 1}</span>
            <span class="order-item__t">${byId.get(id)?.text}</span>
            <span class="order-item__btns">
              <button class="icon-btn" data-q="up" data-i="${i}" aria-label="Жоғары жылжыту" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
              <button class="icon-btn" data-q="down" data-i="${i}" aria-label="Төмен жылжыту" ${i === sel.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
            </span>
          </li>`,
        )}
      </ol>`;
    } else {
      body = html`<div class="options" role="${q.type === 'single' ? 'radiogroup' : 'group'}">
        ${q.options.map(
          (o) => html`<button class="opt ${q.type === 'multi' ? 'opt--multi' : ''} ${sel.includes(o.id) ? 'is-selected' : ''}"
            role="${q.type === 'single' ? 'radio' : 'checkbox'}" aria-checked="${sel.includes(o.id)}" data-q="pick" data-id="${o.id}">
            <span class="opt__mark"></span><span>${o.text}</span>
          </button>`,
        )}
      </div>`;
    }

    render(
      root,
      html`<div class="quiz__run">
        <div class="quiz__progress"><span>Сұрақ ${s.index + 1} / ${total}</span><span>Жауап берілді: ${answeredCount} / ${total}</span></div>
        ${bar(((s.index + 1) / total) * 100)}
        <div class="quiz__dots" aria-label="Сұрақтар">
          ${qs.map(
            (qq, i) => html`<button data-q="go" data-i="${i}" class="${i === s.index ? 'is-current' : ''} ${answered(qq) && s.answers[qq.id] ? 'is-answered' : ''}" aria-label="${i + 1}-сұрақ">${i + 1}</button>`,
          )}
        </div>
        <div class="quiz__q" aria-live="polite">
          ${kind === 'final' ? html`<div class="quiz__topic">${q.topic_title}</div>` : ''}
          <div class="quiz__text">${q.text}</div>
          <div class="quiz__type">${TYPE_HINT[q.type]}</div>
          ${body}
        </div>
        <div class="quiz__nav">
          <button class="btn btn--ghost" data-q="prev" ${s.index === 0 ? 'disabled' : ''}>${icon('left')} Алдыңғы</button>
          ${
            last
              ? html`<button class="btn btn--gold" data-q="finish" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Тексерілуде…' : 'Тестті аяқтау'}</button>`
              : html`<button class="btn btn--gold" data-q="next" ${answered(q) ? '' : 'disabled'}>Келесі ${icon('right')}</button>`
          }
        </div>
      </div>`,
    );
  }

  function reviewList(r) {
    const items = s.filter === 'wrong' ? r.review.filter((x) => !x.is_correct) : r.review;
    if (!items.length) return html`<p style="color:var(--ok);font-weight:600">${icon('check')} Қате жауап жоқ. Керемет нәтиже!</p>`;
    return html`<div class="review">
      ${items.map((x, i) => {
        const opt = new Map(x.options.map((o) => [o.id, o.text]));
        let lines;
        if (x.type === 'order') {
          lines = html`<li><b>Сенің ретің:</b>&nbsp;${x.selected.length ? x.selected.map((id) => opt.get(id)).join(' → ') : 'жауап берілмеген'}</li>
            <li class="is-correct">${icon('check')} <span><b>Дұрыс рет:</b> ${x.correct.map((id) => opt.get(id)).join(' → ')}</span></li>`;
        } else {
          lines = x.options.map((o) => {
            const picked = x.selected.includes(o.id);
            const ok = x.correct.includes(o.id);
            const cls = ok ? 'is-correct' : picked ? 'is-picked-wrong' : '';
            const mark = ok ? icon('check') : picked ? icon('x') : raw('<span style="width:1.15em;display:inline-block"></span>');
            return html`<li class="${cls}">${mark}<span>${o.text}${picked ? ' — сенің жауабың' : ''}</span></li>`;
          });
        }
        return html`<div class="review-item ${x.is_correct ? '' : 'is-wrong'}">
          ${kind === 'final' ? html`<div class="quiz__topic">${x.topic_title}</div>` : ''}
          <div class="review-item__q">${i + 1}. ${x.text} ${x.is_correct ? html`<span class="badge badge--ok">Дұрыс</span>` : html`<span class="badge badge--bad">Қате</span>`}</div>
          <ul>${lines}</ul>
          ${x.explanation ? html`<div class="review-item__exp">${icon('info')} ${x.explanation}</div>` : ''}
        </div>`;
      })}
    </div>`;
  }

  function drawResult() {
    const r = s.result;
    const good = r.percent >= (r.threshold || 70);
    const mastered = (r.breakdown || []).filter((b) => b.mastered);
    const weak = (r.breakdown || []).filter((b) => !b.mastered);
    render(
      root,
      html`<div class="quiz__result">
        <div class="result-top">
          ${ring(r.percent, 132)}
          <div>
            <h3 style="margin:0 0 4px">${good ? 'Жарайсың! Тақырыпты жақсы меңгергенсің.' : 'Тағы бір рет қайталап көр.'}</h3>
            <div class="result-nums">
              <div class="result-num result-num--ok"><b>${r.correct}</b><span>дұрыс жауап</span></div>
              <div class="result-num result-num--bad"><b>${r.wrong}</b><span>қате жауап</span></div>
              <div class="result-num"><b>${r.percent}%</b><span>жалпы нәтиже</span></div>
            </div>
            <p class="hint" style="margin:0">${
              r.saved ? 'Нәтиже аккаунтыңда сақталды.' : 'Нәтиже осы құрылғыда ғана көрсетілді. Тұрақты сақтау үшін аккаунтқа кір.'
            }</p>
          </div>
        </div>
        ${
          kind === 'final'
            ? html`<h3 style="margin-top:8px">Әр хан бойынша нәтиже</h3>
              <div class="breakdown">
                ${r.breakdown.map(
                  (b) => html`<div class="breakdown__row">
                    <a href="#/khan/${b.topic_id}">${b.title}</a>
                    ${bar(b.percent, b.mastered ? 'bar--ok' : 'bar--bad')}
                    <span><b>${b.correct}/${b.total}</b> ${b.mastered ? html`<span class="badge badge--ok">Меңгерілді</span>` : html`<span class="badge badge--warn">Қайта оқу</span>`}</span>
                  </div>`,
                )}
              </div>
              <div class="verdict">
                <div><h3 style="color:var(--ok)">${icon('check')} Жақсы меңгерілген тақырыптар</h3>
                  ${mastered.length ? html`<ul>${mastered.map((b) => html`<li>${b.title}</li>`)}</ul>` : html`<p class="hint" style="margin:0">Әзірге жоқ.</p>`}</div>
                <div><h3 style="color:var(--warn)">${icon('book')} Қайта оқу керек тақырыптар</h3>
                  ${weak.length ? html`<ul>${weak.map((b) => html`<li><a href="#/khan/${b.topic_id}">${b.title}</a></li>`)}</ul>` : html`<p class="hint" style="margin:0">Барлық тақырып меңгерілген!</p>`}</div>
              </div>`
            : ''
        }
        <div class="check-top" style="margin-top:22px">
          <h3 style="margin:0">Жауаптарды қарау</h3>
          <div class="segmented" role="tablist">
            <button data-q="filter" data-f="wrong" class="${s.filter === 'wrong' ? 'is-active' : ''}">Қате жауаптар (${r.wrong})</button>
            <button data-q="filter" data-f="all" class="${s.filter === 'all' ? 'is-active' : ''}">Барлығы (${r.total})</button>
          </div>
        </div>
        ${reviewList(r)}
        <div class="quiz__nav">
          <button class="btn btn--gold" data-q="restart">${icon('refresh')} Тестті қайта тапсыру</button>
        </div>
      </div>`,
    );
  }

  async function start() {
    s.busy = true;
    draw();
    try {
      s.quiz = await api(kind === 'final' ? '/api/quiz/final/start' : `/api/quiz/topic/${topicId}/start`, { method: 'POST' });
      s.phase = 'run';
      s.index = 0;
      s.answers = {};
      for (const q of s.quiz.questions) if (q.type === 'order') s.answers[q.id] = q.options.map((o) => o.id);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      s.busy = false;
      draw();
    }
  }

  async function finish() {
    const missing = s.quiz.questions.findIndex((q) => !answered(q));
    if (missing >= 0) {
      s.index = missing;
      draw();
      toast(`${missing + 1}-сұраққа жауап берілмеген.`, 'error');
      return;
    }
    s.busy = true;
    draw();
    try {
      s.result = await api('/api/quiz/submit', { method: 'POST', body: { attemptId: s.quiz.attemptId, answers: s.answers } });
      s.phase = 'result';
      s.filter = s.result.wrong ? 'wrong' : 'all';
      await recordResult(s.result, topicTitle);
      toast(s.result.saved ? 'Тест нәтижесі сақталды.' : 'Тест аяқталды.', 'ok');
      root.scrollIntoView({ block: 'start' });
    } catch (err) {
      toast(err.message, 'error');
      if (err.status === 404 || err.status === 409 || err.status === 410) s.phase = 'intro';
    } finally {
      s.busy = false;
      draw();
    }
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (!b || b.disabled) return;
    const act = b.dataset.q;
    const q = s.quiz?.questions[s.index];
    if (act === 'start' || act === 'restart') return start();
    if (act === 'finish') return finish();
    if (act === 'next') s.index = Math.min(s.index + 1, s.quiz.questions.length - 1);
    if (act === 'prev') s.index = Math.max(0, s.index - 1);
    if (act === 'go') s.index = Number(b.dataset.i);
    if (act === 'filter') s.filter = b.dataset.f;
    if (act === 'pick') {
      const id = b.dataset.id;
      if (q.type === 'single') s.answers[q.id] = [id];
      else {
        const cur = new Set(s.answers[q.id] || []);
        cur.has(id) ? cur.delete(id) : cur.add(id);
        s.answers[q.id] = [...cur];
      }
    }
    if (act === 'up' || act === 'down') {
      const arr = [...s.answers[q.id]];
      const i = Number(b.dataset.i);
      const j = act === 'up' ? i - 1 : i + 1;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      s.answers[q.id] = arr;
    }
    draw();
    if (act === 'up' || act === 'down') {
      const i = Number(b.dataset.i) + (act === 'up' ? -1 : 1);
      root.querySelector(`[data-q="${act}"][data-i="${i}"]`)?.focus();
    }
  });

  draw();
  return {
    start,
  };
}
