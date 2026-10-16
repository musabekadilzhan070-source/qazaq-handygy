import { api } from '../api.js';
import { html, render, icon, ring, bar, formatDate, toast } from '../ui.js';
import { state, topicProgress, overallProgress, bestTopicScore, onChange } from '../store.js';
import { medal } from './parts.js';
import { openAuth } from '../auth.js';

function resultReview(r) {
  return html`<section class="sec" id="result-review">
    <div class="sec__head"><span class="sec__no"><span>${icon('eye')}</span></span>
      <h2>${r.kind === 'final' ? 'Қорытынды тест' : r.review[0]?.topic_title || 'Тақырыптық тест'} · ${formatDate(r.created_at)}</h2></div>
    <div class="result-nums">
      <div class="result-num result-num--ok"><b>${r.correct}</b><span>дұрыс</span></div>
      <div class="result-num result-num--bad"><b>${r.wrong}</b><span>қате</span></div>
      <div class="result-num"><b>${r.percent}%</b><span>нәтиже</span></div>
    </div>
    <div class="review">
      ${r.review.map((x, i) => {
        const opt = new Map(x.options.map((o) => [o.id, o.text]));
        return html`<div class="review-item ${x.is_correct ? '' : 'is-wrong'}">
          <div class="review-item__q">${i + 1}. ${x.text} ${x.is_correct ? html`<span class="badge badge--ok">Дұрыс</span>` : html`<span class="badge badge--bad">Қате</span>`}</div>
          <ul>
            <li>Сенің жауабың:&nbsp;<b>${x.selected.length ? x.selected.map((id) => opt.get(id)).join(x.type === 'order' ? ' → ' : ', ') : 'жоқ'}</b></li>
            <li class="is-correct">${icon('check')}<span>Дұрыс жауап: ${x.correct.map((id) => opt.get(id)).join(x.type === 'order' ? ' → ' : ', ')}</span></li>
          </ul>
        </div>`;
      })}
    </div>
  </section>`;
}

export function progressView(root) {
  document.title = 'Менің прогресім · QAZAQ HANDYǴY';
  function draw() {
    const o = overallProgress();
    const results = state.progress.results;
    render(
      root,
      html`<div class="view wrap">
        <div class="page-title">
          <h1>Менің прогресім</h1>
          <p>${state.user ? html`Сәлем, <b>${state.user.display_name}</b>! Мұнда тек сенің жеке нәтижелерің көрсетіледі.` : 'Сен әзірге аккаунтқа кірмегенсің.'}</p>
        </div>
        ${
          state.user
            ? ''
            : html`<div class="notice">${icon('lock')}<p>Қазір прогресің тек осы құрылғыда сақталып тұр. Аккаунт ашсаң, белгілерің серверге көшіріледі және басқа құрылғыдан да қолжетімді болады.</p>
              <button class="btn btn--gold" data-auth>Кіру / Тіркелу</button></div>`
        }
        <section class="sec">
          <div class="result-top">
            ${ring(o.percent, 132)}
            <div>
              <h2 style="margin:0 0 6px">Жалпы дайындық деңгейі: ${o.percent}%</h2>
              <div class="result-nums">
                <div class="result-num"><b>${o.done} / ${o.total}</b><span>орындалған тапсырма</span></div>
                <div class="result-num result-num--ok"><b>${o.completed} / ${state.topics.length}</b><span>аяқталған тақырып</span></div>
                <div class="result-num"><b>${results.length}</b><span>тапсырылған тест</span></div>
              </div>
            </div>
          </div>
        </section>

        <section class="sec">
          <div class="sec__head"><span class="sec__no"><span>${icon('crown')}</span></span><h2>Хандар бойынша прогресс</h2></div>
          <div class="progress-grid">
            ${state.topics.map((t) => {
              const p = topicProgress(t);
              const best = bestTopicScore(t.id);
              const complete = p.total > 0 && p.done === p.total;
              return html`<a class="pcard" href="#/khan/${t.id}">
                <span class="rail__faces">${t.khans.map((k) => medal(k, 'medal--sm'))}</span>
                <div>
                  <div class="pcard__t">${t.title}</div>
                  ${bar(p.percent, complete ? 'bar--ok' : '')}
                  <div class="pcard__meta">
                    <span class="badge">Чек-лист ${p.percent}%</span>
                    ${best !== null ? html`<span class="badge">Тест ${best}%</span>` : html`<span class="badge badge--warn">Тест тапсырылмаған</span>`}
                    ${complete ? html`<span class="badge badge--ok">Аяқталды</span>` : ''}
                    ${state.progress.reads.has(t.id) ? html`<span class="badge">Оқылды</span>` : ''}
                  </div>
                </div>
              </a>`;
            })}
          </div>
        </section>

        <section class="sec">
          <div class="sec__head"><span class="sec__no"><span>${icon('quiz')}</span></span><h2>Тест нәтижелерінің тарихы</h2></div>
          ${
            results.length
              ? html`<div class="table-wrap"><table class="table">
                  <thead><tr><th>Күні</th><th>Тест</th><th>Дұрыс</th><th>Нәтиже</th><th></th></tr></thead>
                  <tbody>${results.map(
                    (r) => html`<tr>
                      <td>${formatDate(r.created_at)}</td>
                      <td>${r.kind === 'final' ? html`<b>Қорытынды тест</b>` : r.topic_title || 'Тақырыптық тест'}</td>
                      <td>${r.correct} / ${r.total}</td>
                      <td><span class="badge ${r.percent >= (state.site.mastery_threshold || 70) ? 'badge--ok' : 'badge--warn'}">${r.percent}%</span></td>
                      <td style="text-align:right;white-space:nowrap">
                        ${r.id ? html`<button class="btn btn--sm" data-review="${r.id}">Қарау</button>` : ''}
                        <a class="btn btn--sm btn--ghost" href="${r.kind === 'final' ? '#/final' : `#/khan/${r.topic_id}`}">Қайта тапсыру</a>
                      </td>
                    </tr>`,
                  )}</tbody></table></div>`
              : html`<p class="hint">Әзірге тест тапсырылмаған. <a href="#/final">Қорытынды тестті</a> немесе кез келген ханның тақырыптық тестін бастап көр.</p>`
          }
        </section>
        <div data-review-slot></div>
      </div>`,
    );
  }
  draw();
  const off = onChange(() => {
    if (!document.body.contains(root.querySelector('.page-title'))) return off();
    draw();
  });
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-auth]')) return openAuth();
    const b = e.target.closest('[data-review]');
    if (!b) return;
    try {
      const r = await api(`/api/me/results/${b.dataset.review}`);
      const slot = root.querySelector('[data-review-slot]');
      render(slot, resultReview(r));
      slot.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
