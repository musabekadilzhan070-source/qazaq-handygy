// Серверлік функцияларды тексеру: npm test
// Уақытша дерекқормен жеке сервер іске қосылады, сондықтан негізгі деректерге әсер етпейді.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const PIN = '552603';
let server;
let dataDir;

const jar = () => ({ cookie: '' });
async function call(j, method, url, body, extra = {}) {
  const headers = { ...(extra.headers || {}) };
  if (j?.cookie) headers.cookie = j.cookie;
  if (method !== 'GET' && !extra.noCsrf) headers['X-QH'] = '1';
  let payload;
  if (extra.raw) payload = extra.raw;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + url, { method, headers, body: payload });
  const set = res.headers.getSetCookie?.() || [];
  if (j && set.length) {
    const map = new Map(j.cookie.split('; ').filter(Boolean).map((c) => c.split('=')));
    for (const c of set) {
      const [kv] = c.split(';');
      const [k, v] = kv.split('=');
      if (v) map.set(k, v);
      else map.delete(k);
    }
    j.cookie = [...map].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, data };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qh-test-'));
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dataDir, ADMIN_PIN: PIN },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 20000);
    server.stdout.on('data', (d) => {
      if (String(d).includes('іске қосылды')) {
        clearTimeout(t);
        resolve();
      }
    });
    server.stderr.on('data', (d) => process.stderr.write(d));
  });
});
after(() => {
  server?.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const ORDER = ['Керей хан мен Жәнібек хан', 'Бұрындық хан', 'Қасым хан', 'Хақназар хан', 'Тәуекел хан', 'Есім хан', 'Жәңгір хан', 'Тәуке хан'];

test('басты бетте 8 карточка дұрыс ретпен тұр', async () => {
  const { data } = await call(null, 'GET', '/api/topics');
  assert.equal(data.length, 8);
  assert.deepEqual(
    data.map((t) => t.title),
    ORDER,
  );
});

test('Керей мен Жәнібек бір карточкада, портреттері дұрыс ретпен (1-сурет Керей, 2-сурет Жәнібек)', async () => {
  const { data } = await call(null, 'GET', '/api/topics');
  const first = data[0];
  assert.deepEqual(
    first.khans.map((k) => k.name),
    ['Керей хан', 'Жәнібек хан'],
  );
  assert.ok(first.khans.every((k) => k.portrait?.original));
  // Әр портрет дерекқорда бастапқы файл атымен (p01…p09) байланысқан
  const admin = jar();
  await call(admin, 'POST', '/api/admin/login', { pin: PIN });
  const { data: lib } = await call(admin, 'GET', '/api/admin/portraits');
  const byKhan = Object.fromEntries(lib.map((p) => [p.khan_name, p.original_name]));
  assert.deepEqual(byKhan, {
    'Керей хан': 'p01.png',
    'Жәнібек хан': 'p02.png',
    'Бұрындық хан': 'p03.png',
    'Қасым хан': 'p04.png',
    'Хақназар хан': 'p05.png',
    'Тәуекел хан': 'p06.png',
    'Есім хан': 'p07.png',
    'Жәңгір хан': 'p08.png',
    'Тәуке хан': 'p09.png',
  });
  // қалған жеті карточкада бір-бір хан
  assert.ok(data.slice(1).every((t) => t.khans.length === 1));
});

test('әр ханның жеке беті ашылады және барлық бөлімдері бар', async () => {
  const { data: topics } = await call(null, 'GET', '/api/topics');
  for (const t of topics) {
    const { status, data } = await call(null, 'GET', `/api/topics/${t.id}`);
    assert.equal(status, 200);
    assert.ok(data.place_in_history && data.era_features);
    assert.ok(data.khans.every((k) => k.biography && k.internal_policy && k.external_policy));
    assert.ok(data.events.length && data.dates.length && data.terms.length && data.remember.length && data.checklist.length);
    assert.ok(data.question_count >= 6);
  }
  const last = await call(null, 'GET', `/api/topics/${topics.at(-1).id}`);
  assert.equal(last.data.next, null);
  assert.equal(last.data.prev.id, topics.at(-2).id);
});

test('тест сұрақтары дұрыс жауапсыз беріледі және сервер дұрыс бағалайды', async () => {
  const student = jar();
  const reg = await call(student, 'POST', '/api/auth/register', { username: 'aigerim', password: 'qwerty1', displayName: 'Айгерім' });
  assert.equal(reg.status, 201);
  const { data: topics } = await call(null, 'GET', '/api/topics');
  const t = topics[2]; // Қасым хан
  const start = await call(student, 'POST', `/api/quiz/topic/${t.id}/start`);
  assert.equal(start.status, 200);
  for (const q of start.data.questions) {
    assert.equal(q.correct, undefined);
    assert.equal(q.explanation, undefined);
  }
  // admin reads the key to build a fully correct answer set
  const admin = jar();
  await call(admin, 'POST', '/api/admin/login', { pin: PIN });
  const { data: key } = await call(admin, 'GET', `/api/admin/questions?topic_id=${t.id}`);
  const keyMap = new Map(key.map((q) => [q.id, q.correct]));
  const answers = {};
  start.data.questions.forEach((q, i) => {
    answers[q.id] = i === 0 ? ['zzz'] : keyMap.get(q.id); // first one wrong on purpose
  });
  const res = await call(student, 'POST', '/api/quiz/submit', { attemptId: start.data.attemptId, answers });
  assert.equal(res.status, 200);
  const total = start.data.questions.length;
  assert.equal(res.data.total, total);
  assert.equal(res.data.correct, total - 1);
  assert.equal(res.data.wrong, 1);
  assert.equal(res.data.percent, Math.round(((total - 1) / total) * 100));
  assert.equal(res.data.saved, true);
  const wrong = res.data.review.filter((r) => !r.is_correct);
  assert.equal(wrong.length, 1);
  assert.ok(wrong[0].correct.length > 0);
  // same attempt cannot be submitted twice
  const again = await call(student, 'POST', '/api/quiz/submit', { attemptId: start.data.attemptId, answers });
  assert.equal(again.status, 409);
  // result is stored and auto checklist item ticked
  const me = await call(student, 'GET', '/api/me');
  assert.equal(me.data.progress.results.length, 1);
  assert.equal(me.data.progress.results[0].percent, res.data.percent);
  const { data: detail } = await call(null, 'GET', `/api/topics/${t.id}`);
  const auto = detail.checklist.find((c) => c.auto === 'quiz');
  assert.ok(me.data.progress.checklist.includes(auto.id));
});

test('хронологиялық рет сұрағы дұрыс тексеріледі', async () => {
  const { data: topics } = await call(null, 'GET', '/api/topics');
  const start = await call(null, 'POST', `/api/quiz/topic/${topics[0].id}/start`);
  const order = start.data.questions.find((q) => q.type === 'order');
  const admin = jar();
  await call(admin, 'POST', '/api/admin/login', { pin: PIN });
  const { data: key } = await call(admin, 'GET', `/api/admin/questions?topic_id=${topics[0].id}`);
  const correct = key.find((q) => q.id === order.id).correct;
  const res = await call(null, 'POST', '/api/quiz/submit', { attemptId: start.data.attemptId, answers: { [order.id]: correct } });
  const r = res.data.review.find((x) => x.id === order.id);
  assert.equal(r.is_correct, true);
  assert.equal(res.data.saved, false); // қонақ: серверде сақталмайды
  const start2 = await call(null, 'POST', `/api/quiz/topic/${topics[0].id}/start`);
  const res2 = await call(null, 'POST', '/api/quiz/submit', { attemptId: start2.data.attemptId, answers: { [order.id]: [...correct].reverse() } });
  assert.equal(res2.data.review.find((x) => x.id === order.id).is_correct, false);
});

test('қорытынды тест 8 тақырыптың бәрінен тең бөлінеді және хан бойынша нәтиже береді', async () => {
  const start = await call(null, 'POST', '/api/quiz/final/start');
  assert.equal(start.status, 200);
  assert.equal(start.data.questions.length, 16);
  const perTopic = new Map();
  for (const q of start.data.questions) perTopic.set(q.topic_id, (perTopic.get(q.topic_id) || 0) + 1);
  assert.equal(perTopic.size, 8);
  assert.ok([...perTopic.values()].every((n) => n === 2));
  const res = await call(null, 'POST', '/api/quiz/submit', { attemptId: start.data.attemptId, answers: {} });
  assert.equal(res.data.breakdown.length, 8);
  assert.ok(res.data.breakdown.every((b) => b.total === 2 && b.correct === 0 && b.mastered === false));
});

test('чек-лист прогресі есептеледі және сақталады, басқа оқушыға көрінбейді', async () => {
  const a = jar();
  await call(a, 'POST', '/api/auth/register', { username: 'bolat', password: 'secret12' });
  const { data: topic } = await call(null, 'GET', '/api/topics/2');
  const items = topic.checklist.slice(0, 3);
  for (const it of items) assert.equal((await call(a, 'PUT', `/api/me/checklist/${it.id}`, { done: true })).status, 200);
  await call(a, 'PUT', `/api/me/checklist/${items[2].id}`, { done: false });
  // жаңа сессиямен қайта кіргенде сақталған
  const a2 = jar();
  await call(a2, 'POST', '/api/auth/login', { username: 'bolat', password: 'secret12' });
  const me = await call(a2, 'GET', '/api/me');
  const done = me.data.progress.checklist.filter((id) => topic.checklist.some((c) => c.id === id));
  assert.equal(done.length, 2);
  assert.equal(Math.round((done.length / topic.checklist.length) * 100), Math.round((2 / topic.checklist.length) * 100));
  // басқа оқушы
  const b = jar();
  await call(b, 'POST', '/api/auth/register', { username: 'dana', password: 'secret12' });
  const meB = await call(b, 'GET', '/api/me');
  assert.equal(meB.data.progress.checklist.length, 0);
  assert.equal(meB.data.progress.results.length, 0);
  // басқа оқушының нәтижесін ID арқылы да ашуға болмайды
  const other = await call(b, 'GET', '/api/me/results/1');
  assert.equal(other.status, 404);
});

test('PIN-код сервер жағында тексеріледі, кабинет онсыз жабық', async () => {
  const anon = jar();
  assert.equal((await call(anon, 'GET', '/api/admin/stats')).status, 401);
  assert.equal((await call(anon, 'POST', '/api/admin/login', { pin: '000000' })).status, 401);
  assert.equal((await call(anon, 'GET', '/api/admin/stats')).status, 401);
  // CSRF: тақырыпсыз сұраныс қабылданбайды
  assert.equal((await call(anon, 'POST', '/api/admin/login', { pin: PIN }, { noCsrf: true })).status, 403);
  const ok = await call(anon, 'POST', '/api/admin/login', { pin: PIN });
  assert.equal(ok.status, 200);
  assert.equal((await call(anon, 'GET', '/api/admin/stats')).status, 200);
  // PIN клиенттік кодта жоқ
  for (const f of ['public/index.html', 'public/admin.html', 'public/assets/js/admin.js', 'public/assets/js/app.js']) {
    assert.ok(!fs.readFileSync(path.join(ROOT, f), 'utf8').includes(PIN), `${f} ішінде PIN бар`);
  }
});

test('ұйымдастырушы өзгерістері оқушы интерфейсінде көрінеді', async () => {
  const admin = jar();
  assert.equal((await call(admin, 'POST', '/api/admin/login', { pin: PIN })).status, 200);
  const { data: topics } = await call(null, 'GET', '/api/topics');
  const qasymTopic = topics.find((t) => t.title === 'Қасым хан');
  const qasym = qasymTopic.khans[0];

  // өмірбаянды өзгерту
  const bio = 'Жаңартылған өмірбаян мәтіні — тексеру.';
  assert.equal((await call(admin, 'PUT', `/api/admin/khans/${qasym.id}`, { biography: bio })).status, 200);
  const { data: page } = await call(null, 'GET', `/api/topics/${qasymTopic.id}`);
  assert.equal(page.khans[0].biography, bio);

  // жаңа тест сұрағы тиісті тестте пайда болады
  const created = await call(admin, 'POST', '/api/admin/questions', {
    topic_id: qasymTopic.id,
    type: 'single',
    text: 'Тексеру сұрағы: Қасым ханның әкесі кім?',
    options: [{ text: 'Жәнібек' }, { text: 'Керей' }],
    correct: ['a'],
    in_final: true,
  });
  assert.equal(created.status, 201);
  const q = await call(null, 'POST', `/api/quiz/topic/${qasymTopic.id}/start`);
  assert.ok(q.data.questions.some((x) => x.id === created.data.id));
  // бір дұрыс жауапты сұраққа екі дұрыс жауап белгілеуге болмайды
  const bad = await call(admin, 'POST', '/api/admin/questions', { topic_id: qasymTopic.id, type: 'single', text: 'x', options: [{ text: 'a' }, { text: 'b' }], correct: ['a', 'b'] });
  assert.equal(bad.status, 400);

  // суретті ауыстыру тек тиісті карточкада көрінеді
  const png = fs.readFileSync(path.join(ROOT, 'server/seed/portraits/p04.png'));
  const up = await call(admin, 'POST', `/api/admin/khans/${qasym.id}/portrait`, undefined, { raw: png, headers: { 'Content-Type': 'image/png', 'X-File-Name': 'new.png' } });
  assert.equal(up.status, 201);
  const { data: after } = await call(null, 'GET', '/api/topics');
  const before = new Map(topics.flatMap((t) => t.khans.map((k) => [k.id, k.portrait.original])));
  for (const t of after)
    for (const k of t.khans) {
      if (k.id === qasym.id) assert.notEqual(k.portrait.original, before.get(k.id));
      else assert.equal(k.portrait.original, before.get(k.id));
    }
  // сурет емес файл қабылданбайды
  const notImg = await call(admin, 'POST', `/api/admin/khans/${qasym.id}/portrait`, undefined, { raw: Buffer.from('hello world, not an image'), headers: { 'Content-Type': 'image/png' } });
  assert.equal(notImg.status, 415);

  // карточкаларды жасыру және ретін өзгерту тек ұйымдастырушы әрекетімен
  await call(admin, 'PUT', `/api/admin/topics/${qasymTopic.id}`, { visible: false });
  assert.equal((await call(null, 'GET', '/api/topics')).data.length, 7);
  await call(admin, 'PUT', `/api/admin/topics/${qasymTopic.id}`, { visible: true });
  const ids = topics.map((t) => t.id);
  const swapped = [ids[1], ids[0], ...ids.slice(2)];
  await call(admin, 'POST', '/api/admin/topics/reorder', { ids: swapped });
  assert.deepEqual((await call(null, 'GET', '/api/topics')).data.map((t) => t.id), swapped);
  await call(admin, 'POST', '/api/admin/topics/reorder', { ids });
  assert.deepEqual((await call(null, 'GET', '/api/topics')).data.map((t) => t.title), ORDER);

  // ұран өзгерту
  await call(admin, 'PUT', '/api/admin/settings', { slogan: 'Жаңа ұран' });
  assert.equal((await call(null, 'GET', '/api/site')).data.slogan, 'Жаңа ұран');
  assert.equal((await call(null, 'GET', '/api/site')).data.title, 'QAZAQ HANDYǴY');

  // статистика
  const st = await call(admin, 'GET', '/api/admin/stats');
  assert.ok(st.data.totals.students >= 3);
  assert.equal(st.data.perTopic.length, 8);
});

test('PIN-кодты қайта-қайта теру шектеледі', async () => {
  const j = jar();
  let last;
  for (let i = 0; i < 6; i++) last = await call(j, 'POST', '/api/admin/login', { pin: '111111' });
  assert.equal(last.status, 429);
});
