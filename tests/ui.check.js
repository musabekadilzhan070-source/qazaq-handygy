// Браузерде толық сценарийлерді тексеру: npm run test:ui
// Playwright қажет (npm i -D playwright немесе PLAYWRIGHT_MODULE орта айнымалысы).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = path.resolve(import.meta.dirname, '..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const PORT = 3990;
const BASE = `http://127.0.0.1:${PORT}`;
const PIN = '552603';
const SHOTS = process.env.SHOTS_DIR || null;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qh-ui-'));

const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dataDir, ADMIN_PIN: PIN },
});
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes('іске қосылды') && r()));

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(['✓', name]);
  } catch (err) {
    results.push(['✗', name, err.message.split('\n')[0]]);
  }
}
const shot = (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true, timeout: 30000 });

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  ctx.setDefaultTimeout(10000);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });

  await step('Басты бетте сегіз карточка дұрыс ретпен тұр', async () => {
    const titles = await page.$$eval('.cards .card__title', (els) => els.map((e) => e.textContent.trim()));
    assert.deepEqual(titles, ['Керей хан мен Жәнібек хан', 'Бұрындық хан', 'Қасым хан', 'Хақназар хан', 'Тәуекел хан', 'Есім хан', 'Жәңгір хан', 'Тәуке хан']);
  });
  await step('Керей мен Жәнібек бір карточкада, Керей сол жақта, Жәнібек оң жақта, өлшемдері тең', async () => {
    const info = await page.$eval('.card--pair', (card) =>
      [...card.querySelectorAll('.frame')].map((f) => {
        const r = f.getBoundingClientRect();
        return { name: f.querySelector('figcaption').firstChild.textContent.trim(), x: r.x, w: Math.round(r.width), h: Math.round(r.height), img: f.querySelector('img').getAttribute('src') };
      }),
    );
    assert.equal(info.length, 2);
    assert.equal(info[0].name, 'Керей хан');
    assert.equal(info[1].name, 'Жәнібек хан');
    assert.ok(info[0].x < info[1].x);
    assert.equal(info[0].w, info[1].w);
    assert.equal(info[0].h, info[1].h);
    const btns = await page.$$eval('.card--pair .card__cta', (b) => b.map((x) => x.textContent.trim()));
    assert.equal(btns.length, 1);
    assert.match(btns[0], /ХАН ТАРИХЫН ЗЕРТТЕУ/);
  });
  await step('Портреттер жүктелді (бос сурет жоқ)', async () => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);
    const broken = await page.$$eval('.cards img', (imgs) => imgs.filter((i) => !i.complete || i.naturalWidth === 0).length);
    assert.equal(broken, 0);
  });
  await step('Қорытынды тест батырмасы басты бетте бар', async () => {
    assert.ok(await page.locator('text=ҚАЗАҚ ХАНДЫҒЫ БОЙЫНША ҚОРЫТЫНДЫ ТЕСТ').first().isVisible());
  });
  await shot(page, '01-home');

  await step('Әр ханның жеке беті ашылады', async () => {
    const ids = await page.$$eval('.cards .card', (c) => c.map((x) => x.dataset.topic));
    for (const id of ids) {
      await page.goto(`${BASE}/#/khan/${id}`);
      await page.waitForSelector('.khan-hero h1');
      for (const s of ['info', 'bio', 'inner', 'outer', 'events', 'dates', 'terms', 'remember', 'test', 'check']) assert.ok(await page.$(`#sec-${s}`), `#sec-${s}`);
    }
  });

  await step('Чек-лист прогресті дұрыс есептейді және сақтайды (қонақ)', async () => {
    await page.goto(`${BASE}/#/khan/2`);
    await page.waitForSelector('[data-checklist] input');
    const boxes = page.locator('[data-checklist] .check');
    const total = await boxes.count();
    for (let i = 0; i < 3; i++) await boxes.nth(i).click();
    await page.waitForTimeout(200);
    const text = await page.locator('[data-checklist] .meter__top').textContent();
    assert.ok(text.includes(`3 / ${total}`), text);
    assert.ok(text.includes(`${Math.round((3 / total) * 100)}%`), text);
    await page.reload();
    await page.waitForSelector('[data-checklist] input');
    assert.equal(await page.locator('[data-checklist] input:checked').count(), 3);
    await page.click('[data-filter="done"]');
    assert.equal(await page.locator('[data-checklist] .check').count(), 3);
    await page.click('[data-filter="todo"]');
    assert.equal(await page.locator('[data-checklist] .check').count(), total - 3);
  });

  await step('Тіркелу: қонақ белгілері аккаунтқа көшеді', async () => {
    await page.click('[data-login]');
    await page.click('[data-tab="register"]');
    await page.fill('dialog input[name=displayName]', 'Тест Оқушы');
    await page.fill('dialog input[name=username]', 'test_oqushy');
    await page.fill('dialog input[name=password]', 'secret123');
    await page.click('dialog button[type=submit]');
    await page.waitForSelector('[data-logout]');
    const me = await page.evaluate(() => fetch('/api/me').then((r) => r.json()));
    assert.equal(me.progress.checklist.length, 3);
  });

  await step('Тақырыптық тест: жауап беру, нәтиже, қателерді көру, сақтау, қайта тапсыру', async () => {
    await page.goto(`${BASE}/#/khan/3`);
    await page.click('[data-quiz] [data-q="start"]');
    await page.waitForSelector('.quiz__run');
    // дұрыс жауаптар тест біткенше көрсетілмейді
    assert.equal(await page.locator('.review-item').count(), 0);
    const total = await page.locator('.quiz__dots button').count();
    for (let i = 0; i < total; i++) {
      const order = await page.locator('.order-list').count();
      if (!order) await page.locator('.opt').first().click();
      if (i < total - 1) await page.click('[data-q="next"]');
    }
    await page.click('[data-q="finish"]');
    await page.waitForSelector('.quiz__result');
    const nums = await page.$$eval('.result-num b', (b) => b.map((x) => x.textContent.trim()));
    assert.equal(Number(nums[0]) + Number(nums[1]), total);
    await page.click('[data-q="filter"][data-f="all"]');
    assert.equal(await page.locator('.review-item').count(), total);
    const me = await page.evaluate(() => fetch('/api/me').then((r) => r.json()));
    assert.equal(me.progress.results.length, 1);
    await shot(page, '03-quiz-result');
    await page.click('[data-q="restart"]');
    await page.waitForSelector('.quiz__run');
  });

  await step('Қорытынды тест: хан бойынша нәтиже және қайта оқу сілтемелері', async () => {
    await page.goto(`${BASE}/#/final`);
    await page.click('[data-q="start"]');
    await page.waitForSelector('.quiz__run');
    const total = await page.locator('.quiz__dots button').count();
    for (let i = 0; i < total; i++) {
      if (!(await page.locator('.order-list').count())) await page.locator('.opt').nth(1).click();
      if (i < total - 1) await page.click('[data-q="next"]');
    }
    await page.click('[data-q="finish"]');
    await page.waitForSelector('.breakdown__row');
    assert.equal(await page.locator('.breakdown__row').count(), 8);
    assert.ok((await page.locator('.verdict a').count()) >= 1);
    await shot(page, '04-final-result');
  });

  await step('Прогресс беті жеке нәтижелерді көрсетеді', async () => {
    await page.goto(`${BASE}/#/progress`);
    await page.waitForSelector('.table tbody tr');
    assert.equal(await page.locator('.table tbody tr').count(), 2);
    await shot(page, '05-progress');
  });

  await step('Ұйымдастырушы кабинеті: қате PIN қабылданбайды, дұрыс PIN ашады', async () => {
    const admin = await ctx.newPage();
    await admin.goto(`${BASE}/admin`);
    await admin.fill('input[name=pin]', '123456');
    await admin.click('form button');
    await admin.waitForSelector('[data-err]:has-text("қате")');
    await admin.fill('input[name=pin]', PIN);
    await admin.click('form button');
    await admin.waitForSelector('.adm__tab');
    await shot(admin, '06-admin');

    // Қасым ханның өмірбаянын өзгерту
    await admin.click('.le > .rows > .row:nth-child(3) .row__title');
    await admin.waitForSelector('[data-khans] .row');
    await admin.click('[data-khans] .row__title');
    const ta = admin.locator('[data-khans] textarea[name=biography]');
    await ta.fill('Ұйымдастырушы өзгерткен өмірбаян: тексеру мәтіні.');
    await admin.click('[data-khans] [data-act="save"]');
    await admin.waitForSelector('.toast--ok');

    // жаңа тест сұрағын қосу
    await admin.click('[data-tab="questions"]');
    await admin.selectOption('[data-topic-select]', { index: 2 });
    await admin.waitForSelector('.le .row');
    await admin.click('[data-act="add"]');
    await admin.fill('.row.is-new textarea[name=text]', 'Кабинеттен қосылған сұрақ');
    const opts = admin.locator('.row.is-new [data-opt-text]');
    await opts.nth(0).fill('Дұрыс');
    await opts.nth(1).fill('Қате');
    await admin.locator('.row.is-new input[type=radio]').first().check();
    await admin.click('.row.is-new [data-act="save"]');
    await admin.waitForSelector('.toast--ok');
    await shot(admin, '07-admin-questions');

    await page.goto(`${BASE}/#/khan/3`);
    await page.waitForSelector('#sec-bio');
    assert.ok((await page.locator('#sec-bio').textContent()).includes('Ұйымдастырушы өзгерткен өмірбаян'));
    await page.click('[data-quiz] [data-q="start"]');
    await page.waitForSelector('.quiz__run');
    const n = await page.locator('.quiz__dots button').count();
    let found = false;
    for (let i = 0; i < n; i++) {
      if ((await page.locator('.quiz__text').textContent()).includes('Кабинеттен қосылған сұрақ')) found = true;
      if (i < n - 1) {
        if (!(await page.locator('.order-list').count())) await page.locator('.opt').first().click();
        await page.click('[data-q="next"]');
      }
    }
    assert.ok(found, 'жаңа сұрақ тестте көрінбеді');

    // суреттер бөлімі мен нәтижелер ашылады
    await admin.click('[data-tab="portraits"]');
    await admin.waitForSelector('.pslot');
    assert.equal(await admin.locator('.pslot').count(), 9);
    await shot(admin, '08-admin-portraits');
    await admin.click('[data-tab="results"]');
    await admin.waitForSelector('.kpi');
    await shot(admin, '09-admin-results');
  });

  await step('Телефонда: көлденең айналдыру жоқ, төменгі навигация бар', async () => {
    const m = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    m.setDefaultTimeout(10000);
    const p = await m.newPage();
    for (const url of ['/', '/#/khan/1', '/#/khan/5', '/#/final', '/#/progress']) {
      await p.goto(BASE + url, { waitUntil: 'networkidle' });
      await p.waitForTimeout(400);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(over <= 1, `${url}: ${over}px артық`);
      assert.ok(await p.locator('.tabbar').isVisible());
    }
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    await p.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-in')));
    await shot(p, '10-mobile-home');
    await p.goto(BASE + '/#/khan/1', { waitUntil: 'networkidle' });
    await p.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-in')));
    await shot(p, '11-mobile-khan');
    const adm = await m.newPage();
    await adm.goto(BASE + '/admin');
    const over = await adm.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 1);
    await m.close();
  });

  await step('Браузер консолінде қате жоқ', async () => {
    assert.deepEqual(errors.filter((e) => !e.includes('401')), []);
  });
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

for (const r of results) console.log(r.join('  '));
const failed = results.filter((r) => r[0] === '✗').length;
console.log(`\n${results.length - failed}/${results.length} сценарий өтті`);
process.exit(failed ? 1 : 0);
