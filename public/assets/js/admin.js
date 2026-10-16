// Ұйымдастырушы кабинеті. Барлық өзгерістер сервер арқылы дерекқорға сақталады.
import { api } from './api.js';
import { html, raw, render, icon, toast, brandMark, esc, formatDate, bar, fadeImages } from './ui.js';
import { portraitFrame, medal } from './views/parts.js';

const app = document.getElementById('app');
const S = { tab: 'topics', topics: [], topicId: null, contentKind: 'events' };

const TABS = [
  ['topics', 'crown', 'Хандар мен карточкалар'],
  ['portraits', 'image', 'Суреттер'],
  ['content', 'scroll', 'Тарихи мазмұн'],
  ['checklist', 'list', 'Чек-лист'],
  ['questions', 'quiz', 'Тесттер'],
  ['results', 'chart', 'Оқушылардың нәтижелері'],
  ['settings', 'settings', 'Сайт баптаулары'],
];

// ─── Field schemas ─────────────────────────────────────────────────
const TOPIC_FIELDS = [
  { key: 'title', label: 'Карточка атауы', type: 'text', required: true },
  { key: 'reign_label', label: 'Билік жылдары (карточкада)', type: 'text' },
  { key: 'summary', label: 'Қысқаша сипаттама (карточкада)', type: 'textarea', rows: 3 },
  { key: 'place_in_history', label: 'Тарихтағы орны', type: 'textarea', rows: 5 },
  { key: 'era_features', label: 'Кезеңнің негізгі ерекшеліктері', type: 'textarea', rows: 5 },
  { key: 'remember', label: '«Есте сақта!» (әр жол — бір пункт)', type: 'textarea', rows: 7 },
  { key: 'visible', label: 'Басты бетте көрсету', type: 'check' },
];
const KHAN_FIELDS = [
  { key: 'name', label: 'Ханның аты (карточкада)', type: 'text', required: true },
  { key: 'full_name', label: 'Толық аты', type: 'text' },
  { key: 'reign', label: 'Билік құрған жылдары', type: 'text' },
  { key: 'biography', label: 'Өмірбаяны', type: 'textarea', rows: 7 },
  { key: 'internal_policy', label: 'Ішкі саясаты', type: 'textarea', rows: 6 },
  { key: 'external_policy', label: 'Сыртқы саясаты', type: 'textarea', rows: 6 },
  { key: 'contribution', label: 'Тарихи үлесі / хандықтың құрылуына қосқан үлесі', type: 'textarea', rows: 4 },
];
const EVENT_FIELDS = [
  { key: 'year_label', label: 'Жылы / кезеңі', type: 'text' },
  { key: 'title', label: 'Оқиға атауы', type: 'text', required: true },
  { key: 'description', label: 'Сипаттамасы', type: 'textarea', rows: 4 },
  { key: 'disputed', label: 'Деректерде әртүрлі (тексеруді қажет етеді)', type: 'check' },
  { key: 'note', label: 'Ескерту (дереккөздердегі айырмашылық)', type: 'text' },
];
const DATE_FIELDS = [
  { key: 'year_label', label: 'Дата (көрсетілетін мәтін)', type: 'text', required: true },
  { key: 'sort_year', label: 'Сұрыптау жылы (сан)', type: 'number', required: true },
  { key: 'text', label: 'Не болды', type: 'text', required: true },
  { key: 'disputed', label: 'Деректерде әртүрлі', type: 'check' },
  { key: 'note', label: 'Ескерту', type: 'text' },
];
const TERM_FIELDS = [
  {
    key: 'kind',
    label: 'Түрі',
    type: 'select',
    options: [
      ['person', 'Тарихи тұлға'],
      ['place', 'Жер-су атауы'],
      ['term', 'Тарихи ұғым'],
    ],
  },
  { key: 'name', label: 'Атауы', type: 'text', required: true },
  { key: 'description', label: 'Түсіндірмесі', type: 'textarea', rows: 3 },
];
const CHECK_FIELDS = [
  { key: 'text', label: 'Тапсырма мәтіні', type: 'text', required: true },
  {
    key: 'auto',
    label: 'Автоматты белгілеу',
    type: 'select',
    options: [
      ['', 'Жоқ (оқушы өзі белгілейді)'],
      ['quiz', 'Тақырыптық тест тапсырылғанда'],
    ],
  },
];
const TYPE_LABEL = { single: 'Бір дұрыс жауап', multi: 'Бірнеше дұрыс жауап', order: 'Хронологиялық рет' };

function fieldHtml(f, value) {
  const v = value ?? '';
  if (f.type === 'check') {
    return html`<label class="check-inline"><input type="checkbox" name="${f.key}" ${v ? 'checked' : ''}> ${f.label}</label>`;
  }
  let input;
  if (f.type === 'textarea') input = html`<textarea name="${f.key}" rows="${f.rows || 4}">${v}</textarea>`;
  else if (f.type === 'select')
    input = html`<select name="${f.key}">${f.options.map(([val, lab]) => html`<option value="${val}" ${String(v ?? '') === val ? 'selected' : ''}>${lab}</option>`)}</select>`;
  else input = html`<input name="${f.key}" type="${f.type === 'number' ? 'number' : 'text'}" value="${v}" ${f.required ? 'required' : ''}>`;
  return html`<label class="field"><span>${f.label}${f.required ? ' *' : ''}</span>${input}</label>`;
}

function readFields(el, fields) {
  const out = {};
  for (const f of fields) {
    const input = el.querySelector(`[name="${f.key}"]`);
    if (!input) continue;
    if (f.type === 'check') out[f.key] = input.checked;
    else if (f.type === 'number') out[f.key] = input.value === '' ? '' : Number(input.value);
    else if (f.type === 'select' && f.key === 'auto') out[f.key] = input.value || null;
    else out[f.key] = input.value;
  }
  for (const f of fields) {
    if (f.required && (out[f.key] === '' || out[f.key] === undefined)) throw new Error(`«${f.label}» өрісін толтырыңыз.`);
  }
  return out;
}

// ─── Question option editor ────────────────────────────────────────
function optsEditor(q) {
  const type = q.type || 'single';
  const options = q.options?.length ? q.options : [{ id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }, { id: 'd', text: '' }];
  const correct = new Set(q.correct || []);
  return html`<div data-opts data-type="${type}">
    <span class="hint" style="display:block;margin-bottom:8px">${
      type === 'order' ? 'Нұсқаларды ДҰРЫС хронологиялық ретпен жазыңыз — тест кезінде олар араластырылып көрсетіледі.' : type === 'single' ? 'Дұрыс жауапты белгілеңіз (біреуі).' : 'Барлық дұрыс жауапты белгілеңіз.'
    }</span>
    ${options.map(
      (o, i) => html`<div class="opt-edit" data-opt="${o.id}">
        ${
          type === 'order'
            ? html`<span class="num">${i + 1}</span>`
            : html`<input type="${type === 'single' ? 'radio' : 'checkbox'}" name="correct-${q._key}" value="${o.id}" ${correct.has(o.id) ? 'checked' : ''} title="Дұрыс жауап">`
        }
        <input class="input" data-opt-text value="${o.text}" placeholder="${i + 1}-нұсқа">
        <span class="row__btns">
          ${type === 'order' ? html`<button type="button" class="icon-btn" data-oact="up" ${i === 0 ? 'disabled' : ''} aria-label="Жоғары">${icon('up')}</button><button type="button" class="icon-btn" data-oact="down" ${i === options.length - 1 ? 'disabled' : ''} aria-label="Төмен">${icon('down')}</button>` : ''}
          <button type="button" class="icon-btn" data-oact="del" aria-label="Нұсқаны өшіру">${icon('trash')}</button>
        </span>
      </div>`,
    )}
    <button type="button" class="btn btn--sm" data-oact="add" ${options.length >= 8 ? 'disabled' : ''}>${icon('plus')} Нұсқа қосу</button>
  </div>`;
}

function readOpts(rowEl) {
  const box = rowEl.querySelector('[data-opts]');
  const options = [...box.querySelectorAll('[data-opt]')].map((d) => ({ id: d.dataset.opt, text: d.querySelector('[data-opt-text]').value }));
  const correct = [...box.querySelectorAll('input[type=radio]:checked, input[type=checkbox]:checked')].map((i) => i.value);
  return { options, correct };
}

const QUESTION_FIELDS_TOP = [
  {
    key: 'type',
    label: 'Сұрақ түрі',
    type: 'select',
    options: Object.entries(TYPE_LABEL),
  },
  { key: 'text', label: 'Сұрақ мәтіні', type: 'textarea', rows: 2, required: true },
];
const QUESTION_FIELDS_BOTTOM = [
  { key: 'explanation', label: 'Түсіндірме (нәтижеде көрсетіледі)', type: 'text' },
  { key: 'in_final', label: 'Қорытынды тестке қосу', type: 'check' },
  { key: 'active', label: 'Белсенді (тестте көрсетіледі)', type: 'check' },
];

// ─── Generic list editor ───────────────────────────────────────────
let leSeq = 0;
function listEditor(host, cfg) {
  const id = `le${++leSeq}`;
  host.classList.add('le');
  host.dataset.le = id;
  let rows = [];
  const open = new Set();
  let newSeq = 0;

  const url = () => `/api/admin/${cfg.entity}${cfg.scope ? `?${new URLSearchParams(cfg.scope)}` : ''}`;

  async function load() {
    render(host, html`<div class="state" style="padding:30px"><div class="spinner"></div></div>`);
    try {
      rows = await api(url());
      draw();
    } catch (err) {
      render(host, html`<p class="form-error">${err.message}</p>`);
    }
  }

  function body(r) {
    if (cfg.entity === 'questions') {
      const q = { ...r, _key: r.id ?? r._key };
      return html`${QUESTION_FIELDS_TOP.map((f) => fieldHtml(f, r[f.key]))}
        <div class="field"><span>Жауап нұсқалары</span>${optsEditor(q)}</div>
        ${QUESTION_FIELDS_BOTTOM.map((f) => fieldHtml(f, r[f.key]))}`;
    }
    return html`<div class="${cfg.wide ? '' : 'grid2'}">${cfg.fields.map((f) => fieldHtml(f, r[f.key]))}</div>`;
  }

  function draw() {
    render(
      host,
      html`<div class="rows">
        ${rows.length ? '' : html`<p class="hint">Әзірге жазба жоқ.</p>`}
        ${rows.map((r, i) => {
          const key = r.id ? String(r.id) : r._key;
          const isOpen = open.has(key);
          return html`<div class="row ${isOpen ? 'is-open' : ''} ${r.id ? '' : 'is-new'}" data-key="${key}">
            <div class="row__head">
              <div class="row__title" data-act="toggle">${raw(cfg.title(r, i))}</div>
              <span class="row__btns">
                ${cfg.reorder !== false && r.id ? html`<button class="icon-btn" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Жоғары">${icon('up')}</button><button class="icon-btn" data-act="down" ${i === rows.length - 1 || !rows[i + 1]?.id ? 'disabled' : ''} aria-label="Төмен">${icon('down')}</button>` : ''}
                <button class="icon-btn" data-act="toggle" aria-label="Өңдеу">${icon(isOpen ? 'up' : 'edit')}</button>
                <button class="icon-btn" data-act="delete" aria-label="Өшіру">${icon('trash')}</button>
              </span>
            </div>
            ${
              isOpen
                ? html`<div class="row__body">
                  ${body(r)}
                  <div class="toolbar" style="margin:6px 0 0"><button class="btn btn--gold btn--sm" data-act="save">${icon('save')} Сақтау</button>
                  ${r.id ? '' : html`<span class="hint">Жаңа жазба әлі сақталмаған</span>`}</div>
                  ${cfg.extra && r.id ? html`<div data-extra></div>` : ''}
                </div>`
                : ''
            }
          </div>`;
        })}
      </div>
      <div class="toolbar" style="margin-top:12px"><button class="btn btn--sm" data-act="add">${icon('plus')} ${cfg.addLabel || 'Жаңа жазба қосу'}</button></div>`,
    );
    if (cfg.extra) {
      host.querySelectorAll(':scope > .rows > .row.is-open [data-extra]').forEach((el) => {
        const key = el.closest('.row').dataset.key;
        cfg.extra(el, rows.find((r) => String(r.id) === key));
      });
    }
  }

  host.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act], [data-oact]');
    if (!btn || btn.closest('.le') !== host || btn.disabled) return;
    const rowEl = btn.closest('.row');
    const key = rowEl?.dataset.key;
    const idx = rows.findIndex((r) => (r.id ? String(r.id) : r._key) === key);
    const r = rows[idx];

    if (btn.dataset.oact) {
      // option editor actions (questions)
      const cur = readOpts(rowEl);
      const type = rowEl.querySelector('[name=type]').value;
      const optEl = btn.closest('[data-opt]');
      const oi = optEl ? cur.options.findIndex((o) => o.id === optEl.dataset.opt) : -1;
      if (btn.dataset.oact === 'add') {
        const used = new Set(cur.options.map((o) => o.id));
        cur.options.push({ id: [...'abcdefgh'].find((c) => !used.has(c)), text: '' });
      }
      if (btn.dataset.oact === 'del') {
        if (cur.options.length <= 2) return toast('Кемінде 2 нұсқа болуы керек.', 'error');
        cur.options.splice(oi, 1);
      }
      if (btn.dataset.oact === 'up' || btn.dataset.oact === 'down') {
        const j = btn.dataset.oact === 'up' ? oi - 1 : oi + 1;
        [cur.options[oi], cur.options[j]] = [cur.options[j], cur.options[oi]];
      }
      rowEl.querySelector('[data-opts]').outerHTML = optsEditor({ type, options: cur.options, correct: cur.correct, _key: key }).s;
      return;
    }

    const act = btn.dataset.act;
    if (act === 'add') {
      const k = `new${++newSeq}`;
      rows.push({ _key: k, ...(cfg.defaults ? cfg.defaults() : {}) });
      open.add(k);
      draw();
      host.querySelector(`[data-key="${k}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (act === 'toggle') {
      open.has(key) ? open.delete(key) : open.add(key);
      return draw();
    }
    if (act === 'delete') {
      if (!r.id) {
        rows.splice(idx, 1);
        return draw();
      }
      if (!confirm(cfg.confirmDelete ? cfg.confirmDelete(r) : 'Бұл жазбаны өшіресіз бе? Әрекетті қайтару мүмкін емес.')) return;
      try {
        await api(`/api/admin/${cfg.entity}/${r.id}`, { method: 'DELETE' });
        rows.splice(idx, 1);
        toast('Өшірілді.', 'ok');
        draw();
        cfg.onChange?.();
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    if (act === 'up' || act === 'down') {
      const j = act === 'up' ? idx - 1 : idx + 1;
      const order = rows.filter((x) => x.id);
      const a = order.indexOf(r);
      const b = order.indexOf(rows[j]);
      [order[a], order[b]] = [order[b], order[a]];
      try {
        await api(`/api/admin/${cfg.entity}/reorder`, { method: 'POST', body: { ids: order.map((x) => x.id) } });
        [rows[idx], rows[j]] = [rows[j], rows[idx]];
        toast('Рет сақталды.', 'ok', 1800);
        draw();
        cfg.onChange?.();
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    if (act === 'save') {
      try {
        let values;
        if (cfg.entity === 'questions') {
          values = readFields(rowEl, [...QUESTION_FIELDS_TOP, ...QUESTION_FIELDS_BOTTOM]);
          const o = readOpts(rowEl);
          values.options = o.options.filter((x) => x.text.trim());
          values.correct = o.correct.filter((c) => values.options.some((x) => x.id === c));
        } else values = readFields(rowEl, cfg.fields);
        Object.assign(values, cfg.scope || {});
        if (cfg.scope?.topic_id) values.topic_id = Number(cfg.scope.topic_id);
        const saved = r.id
          ? await api(`/api/admin/${cfg.entity}/${r.id}`, { method: 'PUT', body: values })
          : await api(`/api/admin/${cfg.entity}`, { method: 'POST', body: values });
        if (cfg.entity === 'questions') {
          saved.options = typeof saved.options === 'string' ? JSON.parse(saved.options) : saved.options;
          saved.correct = typeof saved.correct === 'string' ? JSON.parse(saved.correct) : saved.correct;
        }
        open.delete(key);
        open.add(String(saved.id));
        rows[idx] = saved;
        if (cfg.entity === 'dates') rows.sort((a, b) => (a.sort_year ?? 0) - (b.sort_year ?? 0));
        toast('Сәтті сақталды. Өзгеріс сайтта бірден көрінеді.', 'ok');
        draw();
        cfg.onChange?.();
      } catch (err) {
        toast(err.message, 'error', 5000);
      }
    }
  });

  host.addEventListener('change', (e) => {
    // switching the question type redraws the option editor
    if (e.target.name !== 'type' || e.target.closest('.le') !== host) return;
    const rowEl = e.target.closest('.row');
    const cur = readOpts(rowEl);
    rowEl.querySelector('[data-opts]').outerHTML = optsEditor({ type: e.target.value, options: cur.options, correct: cur.correct, _key: rowEl.dataset.key }).s;
  });

  load();
  return { reload: load };
}

// ─── Shell ─────────────────────────────────────────────────────────
async function loadOverview() {
  const o = await api('/api/admin/overview');
  S.topics = o.topics;
  if (!S.topicId || !S.topics.some((t) => t.id === S.topicId)) S.topicId = S.topics[0]?.id ?? null;
}

function topicSelect() {
  return html`<label class="field" style="margin:0;min-width:260px"><span>Тақырып (хан)</span>
    <select data-topic-select>${S.topics.map((t, i) => html`<option value="${t.id}" ${t.id === S.topicId ? 'selected' : ''}>${i + 1}. ${t.title}</option>`)}</select></label>`;
}

function shell() {
  render(
    app,
    html`<div class="adm">
      <aside class="adm__side">
        <a class="brand" href="/" target="_blank" rel="noopener">${brandMark}<span class="brand__name">QAZAQ HANDYǴY</span></a>
        <div class="adm__role">Ұйымдастырушы кабинеті</div>
        ${TABS.map(([key, ic, label]) => html`<button class="adm__tab ${S.tab === key ? 'is-active' : ''}" data-tab="${key}">${icon(ic)} ${label}</button>`)}
        <div class="adm__side-foot">
          <a class="btn btn--sm" href="/" target="_blank" rel="noopener">${icon('eye')} Сайтты ашу</a>
          <button class="btn btn--sm btn--danger" data-logout>${icon('logout')} Шығу</button>
        </div>
      </aside>
      <main class="adm__main" id="adm-main"></main>
    </div>`,
  );
}

const main = () => document.getElementById('adm-main');

function head(title, text, extra = '') {
  return html`<div class="adm__head"><div>
    <button class="btn btn--sm adm__mtoggle" data-menu style="margin-bottom:10px">${icon('list')} Мәзір</button>
    <h1>${title}</h1>${text ? html`<p>${text}</p>` : ''}</div>${extra}</div>`;
}

// ─── Tabs ──────────────────────────────────────────────────────────
function topicsTab() {
  render(
    main(),
    html`${head('Хандар мен карточкалар', 'Карточкалардың ретін, көрінуін және хандар туралы негізгі ақпаратты басқару. Керей мен Жәнібек — бір карточкадағы екі хан.')}
      <div class="panel"><h2>Басты беттегі көрініс</h2><div class="preview-cards" data-preview></div></div>
      <div data-list></div>`,
  );
  const drawPreview = () =>
    render(
      main().querySelector('[data-preview]'),
      html`${S.topics.map(
        (t, i) => html`<div class="preview-card ${t.visible ? '' : 'is-hidden'}"><div class="rail__faces">${t.khans.map((k) => medal(k, 'medal--sm'))}</div>${i + 1}. ${t.title}${t.visible ? '' : html`<br><span class="badge badge--warn">Жасырын</span>`}</div>`,
      )}`,
    );
  drawPreview();
  const refresh = async () => {
    await loadOverview();
    drawPreview();
  };
  listEditor(main().querySelector('[data-list]'), {
    entity: 'topics',
    fields: TOPIC_FIELDS,
    wide: true,
    addLabel: 'Жаңа карточка (хан) қосу',
    defaults: () => ({ title: '', visible: 1 }),
    title: (r, i) =>
      `<small>${i + 1}.</small>${esc(r.title || 'Жаңа карточка')} <small>${esc(r.reign_label || '')}</small> ${r.visible === 0 ? '<span class="badge badge--warn">Жасырын</span>' : ''}`,
    confirmDelete: (r) => `«${r.title}» карточкасын толық өшіресіз бе? Оның хандары, оқиғалары, даталары, чек-листі мен тест сұрақтары да өшіріледі.`,
    onChange: refresh,
    extra: (el, topic) => {
      render(el, html`<h3 style="margin:18px 0 10px;color:var(--gold-hi)">Осы карточкадағы хандар</h3><p class="hint">Бір карточкада бірнеше хан болса (мысалы, Керей мен Жәнібек), басты бетте олар қатар, тең өлшемде көрсетіледі. Ретін жебелермен өзгертіңіз.</p><div data-khans></div>`);
      listEditor(el.querySelector('[data-khans]'), {
        entity: 'khans',
        scope: { topic_id: topic.id },
        fields: KHAN_FIELDS,
        wide: true,
        addLabel: 'Осы карточкаға хан қосу',
        title: (r, i) => `<small>${i + 1}.</small>${esc(r.name || 'Жаңа хан')} <small>${esc(r.reign || '')}</small>`,
        confirmDelete: (r) => `«${r.name}» ханын өшіресіз бе? Оның портреті кітапханада қалады.`,
        onChange: refresh,
      });
    },
  });
}

async function portraitsTab() {
  freshMain();
  render(main(), html`${head('Суреттер', 'Әр ханның портретін жүктеу, ауыстыру, алып тастау. Сурет тек өлшемі кішірейтіліп сақталады, мазмұны өзгертілмейді.')}<div data-slots></div>`);
  await loadOverview();
  let library = [];
  try {
    library = await api('/api/admin/portraits');
  } catch (err) {
    toast(err.message, 'error');
  }
  const allKhans = S.topics.flatMap((t, ti) => t.khans.map((k) => ({ ...k, topicTitle: t.title, ti })));
  render(
    main().querySelector('[data-slots]'),
    html`${S.topics.map(
      (t, ti) => html`<div class="panel">
        <h2>${ti + 1}. ${t.title} ${t.khans.length > 1 ? html`<span class="badge">Бір карточкада ${t.khans.length} портрет: ${t.khans.map((k) => k.name).join(' (сол) · ')} (оң)</span>` : ''}</h2>
        <div class="portrait-grid">
          ${t.khans.map(
            (k) => html`<div class="pslot" data-khan="${k.id}">
              ${portraitFrame(k)}
              <div class="pslot__name">${k.name}<small>${k.portrait ? 'Портрет тіркелген' : 'Портрет жоқ'}</small></div>
              <div class="pslot__btns">
                <label class="btn btn--sm btn--gold">${icon('upload')} ${k.portrait ? 'Ауыстыру' : 'Жүктеу'}<input type="file" accept="image/png,image/jpeg,image/webp" data-upload hidden></label>
                ${k.portrait ? html`<button class="btn btn--sm btn--danger" data-unassign>${icon('x')} Алып тастау</button>` : ''}
              </div>
            </div>`,
          )}
          ${t.khans.length ? '' : html`<p class="hint">Бұл карточкада хан жоқ. Алдымен «Хандар мен карточкалар» бөлімінде хан қосыңыз.</p>`}
        </div>
      </div>`,
    )}
    <div class="panel">
      <h2>Суреттер кітапханасы</h2>
      <p class="hint">Барлық жүктелген суреттер. Суретті басқа ханға тіркеуге немесе толық өшіруге болады.</p>
      <div class="lib">
        ${library.map(
          (p) => html`<div class="lib__item" data-portrait="${p.id}">
            <img src="${p.urls.card}" alt="" loading="lazy">
            <div>${p.active_count ? html`<span class="badge badge--ok">Карточкада</span>` : html`<span class="badge badge--warn">Қолданылмайды</span>`}</div>
            <select class="input" data-assign>
              <option value="">— ханға тіркеу —</option>
              ${allKhans.map((k) => html`<option value="${k.id}" ${p.active_count && p.khan_id === k.id ? 'selected' : ''}>${k.ti + 1}. ${k.name}</option>`)}
            </select>
            <button class="btn btn--sm btn--danger" data-delete-portrait>${icon('trash')} Өшіру</button>
          </div>`,
        )}
      </div>
    </div>`,
  );
  const host = main();
  fadeImages(host);
  host.addEventListener('change', async (e) => {
    if (e.target.matches('[data-upload]')) {
      const file = e.target.files[0];
      if (!file) return;
      const khanId = e.target.closest('[data-khan]').dataset.khan;
      if (file.size > 12 * 1024 * 1024) return toast('Файл тым үлкен (ең көбі 12 МБ).', 'error');
      try {
        await api(`/api/admin/khans/${khanId}/portrait`, {
          method: 'POST',
          raw: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
        });
        toast('Портрет жүктелді және тиісті карточкаға тіркелді.', 'ok');
        portraitsTab();
      } catch (err) {
        toast(err.message, 'error', 5000);
      }
    }
    if (e.target.matches('[data-assign]')) {
      const pid = Number(e.target.closest('[data-portrait]').dataset.portrait);
      const khanId = e.target.value;
      if (!khanId) return;
      const k = allKhans.find((x) => String(x.id) === khanId);
      if (!confirm(`Бұл суретті «${k.name}» ханының карточкасына тіркейсіз бе?`)) return portraitsTab();
      try {
        await api(`/api/admin/khans/${khanId}/portrait`, { method: 'PUT', body: { portrait_id: pid } });
        toast('Сурет тіркелді.', 'ok');
        portraitsTab();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  }, { once: false });
  host.addEventListener('click', async (e) => {
    if (e.target.closest('[data-unassign]')) {
      const khanId = e.target.closest('[data-khan]').dataset.khan;
      if (!confirm('Портретті карточкадан алып тастайсыз ба? Сурет кітапханада қалады.')) return;
      try {
        await api(`/api/admin/khans/${khanId}/portrait`, { method: 'PUT', body: { portrait_id: null } });
        toast('Портрет алынды.', 'ok');
        portraitsTab();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
    if (e.target.closest('[data-delete-portrait]')) {
      const pid = e.target.closest('[data-portrait]').dataset.portrait;
      if (!confirm('Суретті толық өшіресіз бе? Файл серверден жойылады.')) return;
      try {
        await api(`/api/admin/portraits/${pid}`, { method: 'DELETE' });
        toast('Сурет өшірілді.', 'ok');
        portraitsTab();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });
}

function scopedTab(title, text, mount) {
  render(main(), html`${head(title, text)}<div class="toolbar">${topicSelect()}</div><div data-sub></div>`);
  const draw = () => {
    // a fresh container per topic, so listeners of the previous list are dropped
    const old = main().querySelector('[data-sub]');
    const el = old.cloneNode(false);
    el.className = '';
    old.replaceWith(el);
    mount(el);
  };
  main()
    .querySelector('[data-topic-select]')
    .addEventListener('change', (e) => {
      S.topicId = Number(e.target.value);
      draw();
    });
  draw();
}

function contentTab() {
  const KINDS = [
    ['events', 'Тарихи оқиғалар'],
    ['dates', 'Маңызды даталар'],
    ['terms', 'Тұлғалар мен ұғымдар'],
  ];
  scopedTab('Тарихи мазмұн', 'Оқиғалар, даталар, тұлғалар мен ұғымдар. Өмірбаян, ішкі/сыртқы саясат және «Есте сақта!» «Хандар мен карточкалар» бөлімінде өңделеді.', (el) => {
    render(
      el,
      html`<div class="segmented" style="margin-bottom:16px">${KINDS.map(([k, l]) => html`<button data-kind="${k}" class="${S.contentKind === k ? 'is-active' : ''}">${l}</button>`)}</div><div data-kind-list></div>`,
    );
    el.querySelectorAll('[data-kind]').forEach((b) =>
      b.addEventListener('click', () => {
        S.contentKind = b.dataset.kind;
        contentTab();
      }),
    );
    const list = el.querySelector('[data-kind-list]');
    const scope = { topic_id: S.topicId };
    if (S.contentKind === 'events')
      listEditor(list, { entity: 'events', scope, fields: EVENT_FIELDS, addLabel: 'Оқиға қосу', title: (r) => `<small>${esc(r.year_label || '')}</small>${esc(r.title || 'Жаңа оқиға')} ${r.disputed ? '<span class="badge badge--warn">Тексеру</span>' : ''}` });
    if (S.contentKind === 'dates')
      listEditor(list, { entity: 'dates', scope, fields: DATE_FIELDS, reorder: false, addLabel: 'Дата қосу', title: (r) => `<small>${esc(r.year_label || '')}</small>${esc(r.text || 'Жаңа дата')} ${r.disputed ? '<span class="badge badge--warn">Тексеру</span>' : ''}` });
    if (S.contentKind === 'terms')
      listEditor(list, {
        entity: 'terms',
        scope,
        fields: TERM_FIELDS,
        defaults: () => ({ kind: 'term' }),
        addLabel: 'Тұлға / ұғым қосу',
        title: (r) => `<small>${{ person: 'Тұлға', place: 'Жер-су', term: 'Ұғым' }[r.kind] || ''}</small>${esc(r.name || 'Жаңа жазба')}`,
      });
  });
}

function checklistTab() {
  scopedTab('Чек-лист', 'Әр ханның тарихи ерекшеліктеріне сәйкес тапсырмалар. Ретін жебелермен өзгертіңіз.', (el) =>
    listEditor(el, {
      entity: 'checklist',
      scope: { topic_id: S.topicId },
      fields: CHECK_FIELDS,
      addLabel: 'Тапсырма қосу',
      title: (r, i) => `<small>${i + 1}.</small>${esc(r.text || 'Жаңа тапсырма')} ${r.auto === 'quiz' ? '<span class="badge">Авто</span>' : ''}`,
    }),
  );
}

function questionsTab() {
  scopedTab('Тесттер', 'Сұрақтарды қосу, өзгерту, дұрыс жауапты белгілеу. «Қорытынды тестке қосу» белгісі бар сұрақтар қорытынды тестке кіреді.', (el) =>
    listEditor(el, {
      entity: 'questions',
      scope: { topic_id: S.topicId },
      addLabel: 'Сұрақ қосу',
      defaults: () => ({ type: 'single', in_final: 1, active: 1 }),
      title: (r, i) =>
        `<small>${i + 1}.</small>${esc(r.text || 'Жаңа сұрақ')} <span class="badge">${TYPE_LABEL[r.type] || ''}</span> ${r.in_final ? '<span class="badge badge--ok">Қорытынды</span>' : ''} ${r.active === 0 ? '<span class="badge badge--warn">Өшік</span>' : ''}`,
    }),
  );
}

async function resultsTab() {
  freshMain();
  render(main(), html`${head('Оқушылардың нәтижелері', 'Бұл деректер тек ұйымдастырушыға көрінеді.', html`<a class="btn btn--sm" href="/api/admin/stats/students.csv">${icon('download')} CSV жүктеу</a>`)}<div data-stats><div class="state"><div class="spinner"></div></div></div>`);
  let st;
  try {
    st = await api('/api/admin/stats');
  } catch (err) {
    return render(main().querySelector('[data-stats]'), html`<p class="form-error">${err.message}</p>`);
  }
  const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
  render(
    main().querySelector('[data-stats]'),
    html`<div class="kpis">
      <div class="kpi"><b>${st.totals.students}</b><span>тіркелген оқушы</span></div>
      <div class="kpi"><b>${st.totals.avg_progress}%</b><span>орташа чек-лист прогресі</span></div>
      <div class="kpi"><b>${st.totals.topic_tests}</b><span>тақырыптық тест тапсырылды</span></div>
      <div class="kpi"><b>${st.totals.final_tests}</b><span>қорытынды тест тапсырылды</span></div>
      <div class="kpi"><b>${pct(st.totals.avg_percent)}</b><span>тесттердің орташа нәтижесі</span></div>
    </div>
    <div class="panel"><h2>Тақырыптар бойынша статистика</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Тақырып</th><th>Тест саны</th><th>Оқушы</th><th>Орташа</th><th>Ең жоғары</th><th>Қорытынды тестте</th><th>Чек-лист (орташа)</th></tr></thead>
        <tbody>${st.perTopic.map(
          (t) => html`<tr><td><b>${t.title}</b></td><td>${t.attempts}</td><td>${t.students}</td><td>${pct(t.avg_percent)}</td><td>${pct(t.best)}</td><td>${pct(t.final_percent)}</td><td style="min-width:140px">${bar(t.checklist_avg)} <small>${t.checklist_avg}%</small></td></tr>`,
        )}</tbody></table></div></div>
    <div class="panel"><h2>Оқушылар</h2>
      ${
        st.students.length
          ? html`<div class="table-wrap"><table class="table">
            <thead><tr><th>Оқушы</th><th>Логин</th><th>Тіркелген</th><th>Соңғы кіру</th><th>Чек-лист</th><th>Тақырыптық тест</th><th>Қорытынды (ең жоғары)</th><th></th></tr></thead>
            <tbody>${st.students.map(
              (s) => html`<tr><td><b>${s.display_name}</b></td><td>${s.username}</td><td>${formatDate(s.created_at)}</td><td>${formatDate(s.last_login)}</td>
                <td>${s.progress}% <small class="hint">(${s.checklist_done}/${s.checklist_total})</small></td><td>${s.topic_tests} · орт. ${pct(s.topic_avg)}</td><td>${s.final_tests} · ${pct(s.final_best)}</td>
                <td><button class="btn btn--sm" data-student="${s.id}">Толығырақ</button></td></tr>`,
            )}</tbody></table></div>`
          : html`<p class="hint">Әзірге тіркелген оқушы жоқ.</p>`
      }
    </div>
    <div data-student-detail></div>`,
  );
  main().addEventListener('click', async (e) => {
    const b = e.target.closest('[data-student]');
    if (!b) return;
    try {
      const d = await api(`/api/admin/students/${b.dataset.student}`);
      const slot = main().querySelector('[data-student-detail]');
      render(
        slot,
        html`<div class="panel"><h2>${d.student.display_name} (${d.student.username})</h2>
          <div class="table-wrap"><table class="table"><thead><tr><th>Тақырып</th><th>Чек-лист</th><th>Тест саны</th><th>Ең жоғары</th></tr></thead>
          <tbody>${d.topics.map((t) => html`<tr><td>${t.title}</td><td>${t.done}/${t.total} (${t.progress}%)</td><td>${t.tests}</td><td>${pct(t.best)}</td></tr>`)}</tbody></table></div>
          <h3 style="margin-top:16px">Тест тарихы</h3>
          ${d.results.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Күні</th><th>Тест</th><th>Нәтиже</th></tr></thead>
          <tbody>${d.results.map((r) => html`<tr><td>${formatDate(r.created_at)}</td><td>${r.kind === 'final' ? 'Қорытынды тест' : r.topic_title}</td><td>${r.correct}/${r.total} · ${r.percent}%</td></tr>`)}</tbody></table></div>` : html`<p class="hint">Тест тапсырылмаған.</p>`}
        </div>`,
      );
      slot.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function settingsTab() {
  render(main(), html`${head('Сайт баптаулары', 'Басты беттегі мәтіндер мен визуалды параметрлер. Сайт атауы QAZAQ HANDYǴY өзгермейді.')}<div data-settings></div>`);
  const s = await api('/api/admin/settings');
  const FIELDS = [
    { key: 'slogan', label: 'Басты беттегі ұран', type: 'text' },
    { key: 'hero_intro', label: 'Басты беттегі кіріспе мәтін', type: 'textarea', rows: 3 },
    { key: 'cards_heading', label: 'Карточкалар бөлімінің тақырыбы', type: 'text' },
    { key: 'cards_intro', label: 'Карточкалар бөлімінің сипаттамасы', type: 'text' },
    { key: 'final_intro', label: 'Қорытынды тест сипаттамасы', type: 'textarea', rows: 3 },
    { key: 'footer_text', label: 'Төменгі бөліктегі мәтін', type: 'text' },
    { key: 'final_question_count', label: 'Қорытынды тесттегі сұрақ саны (4–80)', type: 'number' },
    { key: 'mastery_threshold', label: 'Тақырып «меңгерілді» деп саналатын шек, %', type: 'number' },
    {
      key: 'gold_tone',
      label: 'Алтын түстің реңкі',
      type: 'select',
      options: [
        ['classic', 'Классикалық алтын'],
        ['bright', 'Ашық алтын'],
        ['antique', 'Көне алтын'],
      ],
    },
    {
      key: 'effects',
      label: 'Анимациялар (әдепкі)',
      type: 'select',
      options: [
        ['full', 'Толық (жеңіл қозғалыс, тұман, алтын тозаң)'],
        ['calm', 'Азайтылған (қозғалыссыз)'],
      ],
    },
  ];
  const el = main().querySelector('[data-settings]');
  render(el, html`<div class="panel"><form data-form><div class="grid2">${FIELDS.map((f) => fieldHtml(f, s[f.key]))}</div><button class="btn btn--gold">${icon('save')} Сақтау</button></form></div>
    <div class="panel"><h2>Карточкалардың реті</h2><p class="hint" style="margin:0">Карточкалардың реті мен көрінуі «Хандар мен карточкалар» бөлімінде жебелер мен «Басты бетте көрсету» белгісі арқылы басқарылады.</p></div>`);
  el.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const vals = {};
    FIELDS.forEach((f) => (vals[f.key] = e.target.querySelector(`[name=${f.key}]`).value));
    try {
      await api('/api/admin/settings', { method: 'PUT', body: vals });
      toast('Баптаулар сақталды.', 'ok');
      settingsTab();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function openTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.adm__tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
  document.querySelector('.adm')?.classList.remove('is-menu');
  try {
    await loadOverview();
    ({ topics: topicsTab, portraits: portraitsTab, content: contentTab, checklist: checklistTab, questions: questionsTab, results: resultsTab, settings: settingsTab })[tab]();
    // replace the main element to drop listeners from the previous tab
  } catch (err) {
    if (err.status === 401) return pinScreen('Сессия аяқталды. PIN-кодты қайта енгізіңіз.');
    toast(err.message, 'error');
  }
}

// Each tab attaches listeners to #adm-main; a fresh element per tab avoids duplicates.
function freshMain() {
  const old = main();
  const n = old.cloneNode(false);
  old.replaceWith(n);
}

function pinScreen(message = '') {
  render(
    app,
    html`<div class="pin-screen"><form class="pin-card" data-pin>
      ${brandMark}
      <h1>Ұйымдастырушы кабинеті</h1>
      <p class="hint" style="margin:0">QAZAQ HANDYǴY басқару панеліне кіру үшін PIN-кодты енгізіңіз.</p>
      <input class="pin-input" name="pin" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required aria-label="PIN-код" autofocus>
      <p class="form-error" data-err role="alert">${message}</p>
      <button class="btn btn--gold btn--block">${icon('lock')} Кіру</button>
      <p style="margin:16px 0 0"><a href="/">← Сайтқа оралу</a></p>
    </form></div>`,
  );
  const form = app.querySelector('[data-pin]');
  form.pin.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('[data-err]');
    err.textContent = '';
    try {
      await api('/api/admin/login', { method: 'POST', body: { pin: form.pin.value.trim() } });
      start();
    } catch (ex) {
      err.textContent = ex.message;
      form.pin.select();
    }
  });
}

async function start() {
  shell();
  freshMain();
  await openTab(S.tab);
}

app.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-tab]');
  if (t && t.classList.contains('adm__tab')) {
    freshMain();
    return openTab(t.dataset.tab);
  }
  if (e.target.closest('[data-menu]')) document.querySelector('.adm').classList.toggle('is-menu');
  if (e.target.closest('[data-logout]')) {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    pinScreen('Сіз кабинеттен шықтыңыз.');
  }
});

(async () => {
  try {
    const me = await api('/api/admin/me', { quiet: true });
    if (!me.pinConfigured) return pinScreen('Серверде ADMIN_PIN баптауы орнатылмаған. README нұсқаулығын қараңыз.');
    if (me.admin) start();
    else pinScreen();
  } catch (err) {
    pinScreen(err.message);
  }
})();
