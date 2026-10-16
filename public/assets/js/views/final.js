import { html, render, icon } from '../ui.js';
import { state } from '../store.js';
import { mountQuiz } from '../quiz.js';

export function finalView(root) {
  document.title = 'Қорытынды тест · QAZAQ HANDYǴY';
  const s = state.site;
  const available = state.topics.reduce((a, t) => a + (t.question_count ? 1 : 0), 0);
  render(
    root,
    html`<div class="view wrap">
      <div class="page-title">
        <span class="ornament-mark" aria-hidden="true"></span>
        <h1>ҚАЗАҚ ХАНДЫҒЫ БОЙЫНША ҚОРЫТЫНДЫ ТЕСТ</h1>
        <p>${s.final_intro}</p>
      </div>
      <section class="sec">
        <div class="sec__head"><span class="sec__no"><span>${icon('trophy')}</span></span><h2>Тестке кіретін тақырыптар</h2></div>
        <div class="pcard__meta" style="margin:0 0 22px">
          ${state.topics.map((t, i) => html`<a class="badge" href="#/khan/${t.id}">${i + 1}. ${t.title}</a>`)}
        </div>
        <div class="quiz" data-quiz></div>
      </section>
    </div>`,
  );
  mountQuiz(root.querySelector('[data-quiz]'), {
    kind: 'final',
    questionCount: available ? s.final_question_count : 0,
    intro: `${s.final_question_count} сұраққа дейін, барлық ${state.topics.length} тақырыптан мүмкіндігінше тең бөлінеді. Соңында әр хан бойынша нәтижең мен қайта оқу керек тақырыптар көрсетіледі.`,
  });
}
