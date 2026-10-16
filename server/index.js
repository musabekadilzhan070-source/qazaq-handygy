import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { all, get, run, getSettings } from './db.js';
import {
  sessionMiddleware,
  requireStudent,
  hashPassword,
  verifyPassword,
  startStudentSession,
  endStudentSession,
  makeLimiter,
  purgeExpiredSessions,
} from './auth.js';
import { listTopics, getTopic, studentProgress } from './content.js';
import { startTopicQuiz, startFinalQuiz, gradeAttempt } from './quiz.js';
import { adminRouter } from './admin.js';
import { seedIfEmpty } from './seed.js';

await seedIfEmpty();
purgeExpiredSessions();
setInterval(purgeExpiredSessions, 60 * 60 * 1000).unref();

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : process.env.TRUST_PROXY);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  next();
});

app.use('/api', express.json({ limit: '1mb' }));
app.use('/api', sessionMiddleware);

// CSRF guard: every state-changing API call must carry a custom header,
// which browsers never attach to cross-site form posts.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-QH') !== '1') return res.status(403).json({ error: 'Сұраныс қабылданбады.' });
  next();
});
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const loginLimiter = makeLimiter({ max: 10, windowMs: 10 * 60 * 1000 });
const wrap = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res);
    if (out && typeof out.then === 'function') out.catch(next);
  } catch (err) {
    next(err);
  }
};
const toInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// ─── Public content ────────────────────────────────────────────────
app.get('/api/site', (_req, res) => {
  const s = getSettings();
  res.json({
    title: 'QAZAQ HANDYǴY',
    slogan: s.slogan,
    hero_intro: s.hero_intro,
    cards_heading: s.cards_heading,
    cards_intro: s.cards_intro,
    final_intro: s.final_intro,
    footer_text: s.footer_text,
    final_question_count: Number(s.final_question_count),
    mastery_threshold: Number(s.mastery_threshold),
    gold_tone: s.gold_tone,
    effects: s.effects,
  });
});

app.get('/api/topics', (_req, res) => res.json(listTopics()));

app.get('/api/topics/:id', (req, res) => {
  const id = toInt(req.params.id);
  const topic = id && getTopic(id);
  if (!topic) return res.status(404).json({ error: 'Тақырып табылмады.' });
  res.json(topic);
});

// ─── Tests (graded on the server) ──────────────────────────────────
app.post(
  '/api/quiz/topic/:id/start',
  wrap((req, res) => {
    const id = toInt(req.params.id);
    const topic = id && get('SELECT id FROM topics WHERE id = ? AND visible = 1', id);
    if (!topic) return res.status(404).json({ error: 'Тақырып табылмады.' });
    const quiz = startTopicQuiz(id, req.student?.id);
    if (!quiz.questions.length) return res.status(409).json({ error: 'Бұл тақырыпқа әзірге сұрақ қосылмаған.' });
    res.json(quiz);
  }),
);

app.post(
  '/api/quiz/final/start',
  wrap((req, res) => {
    const quiz = startFinalQuiz(req.student?.id);
    if (!quiz.questions.length) return res.status(409).json({ error: 'Қорытынды тестке әзірге сұрақ жоқ.' });
    res.json(quiz);
  }),
);

app.post(
  '/api/quiz/submit',
  wrap((req, res) => {
    const out = gradeAttempt(req.body?.attemptId, req.body?.answers, req.student);
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.json(out.result);
  }),
);

// ─── Student accounts ──────────────────────────────────────────────
const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,32}$/u;

app.post(
  '/api/auth/register',
  wrap((req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const displayName = String(req.body?.displayName ?? '').trim().slice(0, 60) || username;
    const password = String(req.body?.password ?? '');
    if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Логин 3–32 таңбадан тұрсын: әріп, сан, «_», «.», «-».' });
    if (password.length < 6 || password.length > 200) return res.status(400).json({ error: 'Құпиясөз кемінде 6 таңбадан тұруы керек.' });
    if (get('SELECT 1 FROM students WHERE username = ?', username)) return res.status(409).json({ error: 'Бұл логин бос емес. Басқа логин таңдаңыз.' });
    const id = Number(
      run("INSERT INTO students (username, display_name, pass_hash, last_login) VALUES (?, ?, ?, datetime('now'))", username, displayName, hashPassword(password))
        .lastInsertRowid,
    );
    startStudentSession(req, res, id);
    res.status(201).json({ user: get('SELECT id, username, display_name, created_at FROM students WHERE id = ?', id) });
  }),
);

app.post(
  '/api/auth/login',
  wrap((req, res) => {
    const key = req.ip;
    const wait = loginLimiter.blocked(key);
    if (wait) return res.status(429).json({ error: `Тым көп сәтсіз әрекет. ${Math.ceil(wait / 60)} минуттан кейін қайталаңыз.` });
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    const row = get('SELECT * FROM students WHERE username = ?', username);
    if (!row || !verifyPassword(password, row.pass_hash)) {
      loginLimiter.fail(key);
      return res.status(401).json({ error: 'Логин немесе құпиясөз қате.' });
    }
    loginLimiter.reset(key);
    run("UPDATE students SET last_login = datetime('now') WHERE id = ?", row.id);
    startStudentSession(req, res, row.id);
    res.json({ user: { id: row.id, username: row.username, display_name: row.display_name, created_at: row.created_at } });
  }),
);

app.post('/api/auth/logout', (req, res) => {
  endStudentSession(req, res);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.student) return res.json({ user: null });
  res.json({ user: req.student, progress: studentProgress(req.student.id) });
});

app.put(
  '/api/me/checklist/:itemId',
  requireStudent,
  wrap((req, res) => {
    const itemId = toInt(req.params.itemId);
    if (!itemId || !get('SELECT 1 FROM checklist_items WHERE id = ?', itemId)) return res.status(404).json({ error: 'Тапсырма табылмады.' });
    if (req.body?.done) run('INSERT OR IGNORE INTO checklist_progress (student_id, item_id) VALUES (?, ?)', req.student.id, itemId);
    else run('DELETE FROM checklist_progress WHERE student_id = ? AND item_id = ?', req.student.id, itemId);
    res.json({ ok: true, done: Boolean(req.body?.done) });
  }),
);

app.put(
  '/api/me/read/:topicId',
  requireStudent,
  wrap((req, res) => {
    const topicId = toInt(req.params.topicId);
    if (!topicId || !get('SELECT 1 FROM topics WHERE id = ?', topicId)) return res.status(404).json({ error: 'Тақырып табылмады.' });
    if (req.body?.read) run('INSERT OR IGNORE INTO topic_reads (student_id, topic_id) VALUES (?, ?)', req.student.id, topicId);
    else run('DELETE FROM topic_reads WHERE student_id = ? AND topic_id = ?', req.student.id, topicId);
    res.json({ ok: true, read: Boolean(req.body?.read) });
  }),
);

// Merge progress a guest collected on this device into the account after login.
app.post(
  '/api/me/import',
  requireStudent,
  wrap((req, res) => {
    const ids = (v) => (Array.isArray(v) ? v.map(toInt).filter(Boolean).slice(0, 2000) : []);
    for (const id of ids(req.body?.checklist)) {
      if (get('SELECT 1 FROM checklist_items WHERE id = ?', id)) run('INSERT OR IGNORE INTO checklist_progress (student_id, item_id) VALUES (?, ?)', req.student.id, id);
    }
    for (const id of ids(req.body?.reads)) {
      if (get('SELECT 1 FROM topics WHERE id = ?', id)) run('INSERT OR IGNORE INTO topic_reads (student_id, topic_id) VALUES (?, ?)', req.student.id, id);
    }
    res.json({ progress: studentProgress(req.student.id) });
  }),
);

app.get(
  '/api/me/results/:id',
  requireStudent,
  wrap((req, res) => {
    const r = get('SELECT * FROM test_results WHERE id = ? AND student_id = ?', toInt(req.params.id), req.student.id);
    if (!r) return res.status(404).json({ error: 'Нәтиже табылмады.' });
    const saved = JSON.parse(r.review || '[]');
    const qids = saved.map((s) => s.id);
    const qs = qids.length
      ? new Map(
          all(`SELECT q.*, t.title AS topic_title FROM questions q JOIN topics t ON t.id = q.topic_id WHERE q.id IN (${qids.map(() => '?').join(',')})`, ...qids).map((q) => [
            q.id,
            q,
          ]),
        )
      : new Map();
    const review = saved
      .filter((s) => qs.has(s.id))
      .map((s) => {
        const q = qs.get(s.id);
        return {
          id: q.id,
          topic_id: q.topic_id,
          topic_title: q.topic_title,
          type: q.type,
          text: q.text,
          options: JSON.parse(q.options),
          correct: JSON.parse(q.correct),
          explanation: q.explanation,
          selected: s.selected,
          is_correct: s.is_correct,
        };
      });
    res.json({
      id: r.id,
      kind: r.kind,
      topic_id: r.topic_id,
      correct: r.correct,
      wrong: r.total - r.correct,
      total: r.total,
      percent: r.percent,
      threshold: Number(getSettings().mastery_threshold) || 70,
      breakdown: JSON.parse(r.breakdown || '[]'),
      review,
      saved: true,
      created_at: r.created_at,
    });
  }),
);

app.use('/api/admin', adminRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Табылмады.' }));
app.use('/api', (err, _req, res, _next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Сервер қатесі. Қайталап көріңіз.' : err.message });
});

// ─── Static files ──────────────────────────────────────────────────
app.use('/uploads', express.static(config.uploadsDir, { maxAge: '30d', immutable: true, fallthrough: false }));
app.get(['/admin', '/admin/'], (_req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex');
  res.sendFile(path.join(config.publicDir, 'admin.html'));
});
app.use(express.static(config.publicDir, { maxAge: '1h', index: 'index.html' }));
app.use((req, res) => {
  if (req.method === 'GET' && req.accepts('html')) return res.sendFile(path.join(config.publicDir, 'index.html'));
  res.status(404).end();
});
app.use((err, _req, res, _next) => {
  if (err.status === 404 || err.statusCode === 404) return res.status(404).end();
  console.error(err);
  res.status(500).end();
});

app.listen(config.port, config.host, () => {
  console.log(`QAZAQ HANDYǴY іске қосылды: http://localhost:${config.port}`);
  if (!config.adminPin) console.warn('[!] ADMIN_PIN орнатылмаған — ұйымдастырушы кабинетіне кіру мүмкін емес. .env файлын баптаңыз.');
});
