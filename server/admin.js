import express from 'express';
import { all, get, run, tx, getSettings, DEFAULT_SETTINGS } from './db.js';
import { checkAdminPin, startAdminSession, endAdminSession, requireAdmin, makeLimiter } from './auth.js';
import { savePortrait, deletePortraitFiles, portraitUrls } from './images.js';
import { config } from './config.js';

export const adminRouter = express.Router();
const pinLimiter = makeLimiter({ max: 5, windowMs: 15 * 60 * 1000 });

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ─── Field coercion ────────────────────────────────────────────────
const str = (max) => (v) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' && typeof v !== 'number') throw new HttpError(400, 'Мәтін өрісі қате.');
  return String(v).slice(0, max);
};
const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);
const int = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new HttpError(400, 'Сандық өріс қате.');
  return n;
};
const intOrNull = (v) => (v === null || v === '' || v === undefined ? null : int(v));
const oneOf = (...values) => (v) => {
  const val = v === '' || v === undefined ? null : v;
  if (!values.includes(val)) throw new HttpError(400, 'Таңдалған мән қате.');
  return val;
};

const TEXT = str(20000);
const LINE = str(300);

const ENTITIES = {
  topics: {
    table: 'topics',
    fields: { title: LINE, reign_label: LINE, summary: str(2000), place_in_history: TEXT, era_features: TEXT, remember: TEXT, visible: bool },
    required: ['title'],
    touch: true,
  },
  khans: {
    table: 'khans',
    scope: 'topic_id',
    fields: {
      topic_id: int,
      name: LINE,
      full_name: LINE,
      reign: LINE,
      biography: TEXT,
      internal_policy: TEXT,
      external_policy: TEXT,
      contribution: TEXT,
    },
    required: ['name', 'topic_id'],
    touch: true,
  },
  events: {
    table: 'events',
    scope: 'topic_id',
    fields: { topic_id: int, khan_id: intOrNull, year_label: LINE, title: LINE, description: TEXT, disputed: bool, note: str(1000) },
    required: ['title', 'topic_id'],
  },
  dates: {
    table: 'dates',
    scope: 'topic_id',
    fields: { topic_id: int, year_label: LINE, sort_year: int, text: str(1000), disputed: bool, note: str(1000) },
    required: ['year_label', 'text', 'topic_id'],
  },
  terms: {
    table: 'terms',
    scope: 'topic_id',
    fields: { topic_id: int, kind: oneOf('person', 'place', 'term'), name: LINE, description: TEXT },
    required: ['name', 'topic_id', 'kind'],
  },
  checklist: {
    table: 'checklist_items',
    scope: 'topic_id',
    fields: { topic_id: int, text: str(500), auto: oneOf(null, 'quiz') },
    required: ['text', 'topic_id'],
  },
  questions: {
    table: 'questions',
    scope: 'topic_id',
    fields: {
      topic_id: int,
      type: oneOf('single', 'multi', 'order'),
      text: str(2000),
      options: (v) => v,
      correct: (v) => v,
      explanation: str(2000),
      in_final: bool,
      active: bool,
    },
    required: ['text', 'topic_id', 'type', 'options'],
    validate: validateQuestion,
  },
};

function validateQuestion(row) {
  let options = typeof row.options === 'string' ? JSON.parse(row.options) : row.options;
  if (!Array.isArray(options)) throw new HttpError(400, 'Жауап нұсқалары тізім болуы керек.');
  options = options
    .map((o) => ({ id: String(o?.id ?? '').slice(0, 12), text: String(o?.text ?? '').trim().slice(0, 500) }))
    .filter((o) => o.text);
  if (options.length < 2 || options.length > 8) throw new HttpError(400, 'Сұрақта 2–8 жауап нұсқасы болуы керек.');
  const used = new Set();
  const ids = 'abcdefghijkl';
  options.forEach((o) => {
    if (!o.id || used.has(o.id)) o.id = [...ids].find((c) => !used.has(c));
    used.add(o.id);
  });
  let correct = typeof row.correct === 'string' ? JSON.parse(row.correct || '[]') : row.correct || [];
  if (row.type === 'order') {
    correct = options.map((o) => o.id); // nұсқалардың сақталған реті — дұрыс хронологиялық рет
  } else {
    correct = [...new Set((Array.isArray(correct) ? correct : []).map(String))].filter((id) => used.has(id));
    if (row.type === 'single' && correct.length !== 1) throw new HttpError(400, 'Бір дұрыс жауабы бар сұрақта дәл бір дұрыс жауап белгіленуі керек.');
    if (row.type === 'multi' && correct.length < 1) throw new HttpError(400, 'Кемінде бір дұрыс жауапты белгілеңіз.');
  }
  row.options = JSON.stringify(options);
  row.correct = JSON.stringify(correct);
}

function entityOr404(name) {
  const e = ENTITIES[name];
  if (!e) throw new HttpError(404, 'Белгісіз бөлім.');
  return e;
}

function pickFields(entity, body, { partial }) {
  const row = {};
  for (const [key, coerce] of Object.entries(entity.fields)) {
    if (body[key] === undefined) continue;
    row[key] = coerce(body[key]);
  }
  if (!partial) {
    for (const r of entity.required) {
      if (row[r] === undefined || row[r] === '' || row[r] === null) throw new HttpError(400, `«${r}» өрісін толтырыңыз.`);
    }
  } else {
    for (const r of entity.required) {
      if (r in row && (row[r] === '' || row[r] === null)) throw new HttpError(400, `«${r}» өрісі бос болмауы керек.`);
    }
  }
  if (row.topic_id !== undefined && !get('SELECT 1 FROM topics WHERE id = ?', row.topic_id)) throw new HttpError(400, 'Тақырып табылмады.');
  if (row.khan_id && !get('SELECT 1 FROM khans WHERE id = ?', row.khan_id)) throw new HttpError(400, 'Хан табылмады.');
  return row;
}

const wrap = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res);
    if (out && typeof out.then === 'function') out.catch(next);
  } catch (err) {
    next(err);
  }
};

// ─── PIN login ─────────────────────────────────────────────────────
adminRouter.post(
  '/login',
  wrap((req, res) => {
    if (!config.adminPin) {
      return res.status(503).json({ error: 'Сервердегі ADMIN_PIN баптауы орнатылмаған. README нұсқаулығын қараңыз.' });
    }
    const key = req.ip;
    const wait = pinLimiter.blocked(key);
    if (wait) return res.status(429).json({ error: `Тым көп сәтсіз әрекет. ${Math.ceil(wait / 60)} минуттан кейін қайталаңыз.` });
    const pin = String(req.body?.pin ?? '');
    if (!/^\d{4,12}$/.test(pin) || !checkAdminPin(pin)) {
      pinLimiter.fail(key);
      return res.status(401).json({ error: 'PIN-код қате.' });
    }
    pinLimiter.reset(key);
    startAdminSession(req, res);
    res.json({ ok: true });
  }),
);

adminRouter.post('/logout', (req, res) => {
  endAdminSession(req, res);
  res.json({ ok: true });
});

adminRouter.get('/me', (req, res) => res.json({ admin: req.isAdmin, pinConfigured: Boolean(config.adminPin) }));

adminRouter.use(requireAdmin);

// ─── Overview for the editor ───────────────────────────────────────
adminRouter.get(
  '/overview',
  wrap((_req, res) => {
    const topics = all('SELECT id, position, visible, title, reign_label FROM topics ORDER BY position, id');
    const khans = all(
      `SELECT k.id, k.topic_id, k.position, k.name, k.reign, k.portrait_id, p.file, p.card_file, p.large_file
       FROM khans k LEFT JOIN portraits p ON p.id = k.portrait_id ORDER BY k.topic_id, k.position, k.id`,
    );
    const counts = (table) => new Map(all(`SELECT topic_id, COUNT(*) AS n FROM ${table} GROUP BY topic_id`).map((r) => [r.topic_id, r.n]));
    const qc = counts('questions');
    const cc = counts('checklist_items');
    res.json({
      topics: topics.map((t) => ({
        ...t,
        visible: Boolean(t.visible),
        question_count: qc.get(t.id) || 0,
        checklist_count: cc.get(t.id) || 0,
        khans: khans
          .filter((k) => k.topic_id === t.id)
          .map((k) => ({ id: k.id, name: k.name, reign: k.reign, position: k.position, portrait_id: k.portrait_id, portrait: portraitUrls(k) })),
      })),
    });
  }),
);

// ─── Settings ──────────────────────────────────────────────────────
adminRouter.get('/settings', (_req, res) => res.json(getSettings()));
adminRouter.put(
  '/settings',
  wrap((req, res) => {
    const body = req.body || {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (body[key] === undefined) continue;
      let value = String(body[key]).slice(0, 4000);
      if (key === 'final_question_count') value = String(Math.max(4, Math.min(80, parseInt(value, 10) || 16)));
      if (key === 'mastery_threshold') value = String(Math.max(10, Math.min(100, parseInt(value, 10) || 70)));
      if (key === 'gold_tone' && !['classic', 'bright', 'antique'].includes(value)) continue;
      if (key === 'effects' && !['full', 'calm'].includes(value)) continue;
      run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
    }
    res.json(getSettings());
  }),
);

// ─── Portraits ─────────────────────────────────────────────────────
const portraitOut = (p) => ({ ...p, urls: portraitUrls(p) });

adminRouter.get(
  '/portraits',
  wrap((_req, res) => {
    const rows = all(
      `SELECT p.*, k.name AS khan_name, k.topic_id, t.title AS topic_title,
              (SELECT COUNT(*) FROM khans a WHERE a.portrait_id = p.id) AS active_count
       FROM portraits p LEFT JOIN khans k ON k.id = p.khan_id LEFT JOIN topics t ON t.id = k.topic_id
       ORDER BY t.position, k.position, p.id DESC`,
    );
    res.json(rows.map(portraitOut));
  }),
);

adminRouter.post(
  '/khans/:id/portrait',
  express.raw({ type: ['image/png', 'image/jpeg', 'image/webp', 'application/octet-stream'], limit: '13mb' }),
  wrap(async (req, res) => {
    const khanId = int(req.params.id);
    const khan = get('SELECT id FROM khans WHERE id = ?', khanId);
    if (!khan) throw new HttpError(404, 'Хан табылмады.');
    const name = decodeURIComponent(String(req.headers['x-file-name'] || 'portrait'));
    const saved = await savePortrait(req.body, name);
    const id = tx(() => {
      const pid = Number(
        run(
          `INSERT INTO portraits (khan_id, file, card_file, large_file, original_name, mime, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          khanId,
          saved.file,
          saved.card_file,
          saved.large_file,
          saved.original_name,
          saved.mime,
          saved.width,
          saved.height,
        ).lastInsertRowid,
      );
      run("UPDATE khans SET portrait_id = ?, updated_at = datetime('now') WHERE id = ?", pid, khanId);
      return pid;
    });
    res.status(201).json(portraitOut(get('SELECT * FROM portraits WHERE id = ?', id)));
  }),
);

// Assign an existing portrait (from the library) to a khan, or clear it.
adminRouter.put(
  '/khans/:id/portrait',
  wrap((req, res) => {
    const khanId = int(req.params.id);
    if (!get('SELECT id FROM khans WHERE id = ?', khanId)) throw new HttpError(404, 'Хан табылмады.');
    const portraitId = intOrNull(req.body?.portrait_id);
    if (portraitId !== null && !get('SELECT id FROM portraits WHERE id = ?', portraitId)) throw new HttpError(404, 'Сурет табылмады.');
    tx(() => {
      run("UPDATE khans SET portrait_id = ?, updated_at = datetime('now') WHERE id = ?", portraitId, khanId);
      if (portraitId !== null) {
        // a portrait shown on a card belongs to that khan
        run('UPDATE khans SET portrait_id = NULL WHERE portrait_id = ? AND id <> ?', portraitId, khanId);
        run('UPDATE portraits SET khan_id = ? WHERE id = ?', khanId, portraitId);
      }
    });
    res.json({ ok: true });
  }),
);

adminRouter.delete(
  '/portraits/:id',
  wrap((req, res) => {
    const row = get('SELECT * FROM portraits WHERE id = ?', int(req.params.id));
    if (!row) throw new HttpError(404, 'Сурет табылмады.');
    tx(() => {
      run('UPDATE khans SET portrait_id = NULL WHERE portrait_id = ?', row.id);
      run('DELETE FROM portraits WHERE id = ?', row.id);
    });
    deletePortraitFiles(row);
    res.json({ ok: true });
  }),
);

// ─── Results & statistics ──────────────────────────────────────────
function studentsTable() {
  const totalItems = get('SELECT COUNT(*) AS n FROM checklist_items c JOIN topics t ON t.id = c.topic_id WHERE t.visible = 1').n;
  return all(
    `SELECT s.id, s.username, s.display_name, s.created_at, s.last_login,
       (SELECT COUNT(*) FROM checklist_progress cp JOIN checklist_items c ON c.id = cp.item_id JOIN topics t ON t.id = c.topic_id
          WHERE cp.student_id = s.id AND t.visible = 1) AS checklist_done,
       (SELECT COUNT(*) FROM test_results r WHERE r.student_id = s.id AND r.kind = 'topic') AS topic_tests,
       (SELECT ROUND(AVG(percent)) FROM test_results r WHERE r.student_id = s.id AND r.kind = 'topic') AS topic_avg,
       (SELECT COUNT(*) FROM test_results r WHERE r.student_id = s.id AND r.kind = 'final') AS final_tests,
       (SELECT MAX(percent) FROM test_results r WHERE r.student_id = s.id AND r.kind = 'final') AS final_best
     FROM students s ORDER BY s.created_at DESC`,
  ).map((s) => ({ ...s, checklist_total: totalItems, progress: totalItems ? Math.round((s.checklist_done / totalItems) * 100) : 0 }));
}

adminRouter.get(
  '/stats',
  wrap((_req, res) => {
    const students = studentsTable();
    const topics = all('SELECT id, title FROM topics ORDER BY position, id');
    const perTopic = topics.map((t) => {
      const r = get(
        `SELECT COUNT(*) AS attempts, COUNT(DISTINCT student_id) AS students, ROUND(AVG(percent)) AS avg_percent, MAX(percent) AS best
         FROM test_results WHERE kind = 'topic' AND topic_id = ?`,
        t.id,
      );
      const items = get('SELECT COUNT(*) AS n FROM checklist_items WHERE topic_id = ?', t.id).n;
      const done = get(
        'SELECT COUNT(*) AS n FROM checklist_progress cp JOIN checklist_items c ON c.id = cp.item_id WHERE c.topic_id = ?',
        t.id,
      ).n;
      // final-test answers for this topic, from stored breakdowns
      let finalCorrect = 0;
      let finalTotal = 0;
      for (const row of all("SELECT breakdown FROM test_results WHERE kind = 'final'")) {
        for (const b of JSON.parse(row.breakdown || '[]')) {
          if (b.topic_id === t.id) {
            finalCorrect += b.correct;
            finalTotal += b.total;
          }
        }
      }
      return {
        topic_id: t.id,
        title: t.title,
        attempts: r.attempts,
        students: r.students,
        avg_percent: r.avg_percent,
        best: r.best,
        checklist_avg: students.length && items ? Math.round((done / (items * students.length)) * 100) : 0,
        final_percent: finalTotal ? Math.round((finalCorrect / finalTotal) * 100) : null,
      };
    });
    const totals = get(
      `SELECT (SELECT COUNT(*) FROM students) AS students,
              (SELECT COUNT(*) FROM test_results WHERE kind = 'topic') AS topic_tests,
              (SELECT COUNT(*) FROM test_results WHERE kind = 'final') AS final_tests,
              (SELECT ROUND(AVG(percent)) FROM test_results) AS avg_percent`,
    );
    totals.avg_progress = students.length ? Math.round(students.reduce((a, s) => a + s.progress, 0) / students.length) : 0;
    res.json({ totals, perTopic, students });
  }),
);

adminRouter.get(
  '/students/:id',
  wrap((req, res) => {
    const s = get('SELECT id, username, display_name, created_at, last_login FROM students WHERE id = ?', int(req.params.id));
    if (!s) throw new HttpError(404, 'Оқушы табылмады.');
    const topics = all('SELECT id, title FROM topics ORDER BY position, id').map((t) => {
      const total = get('SELECT COUNT(*) AS n FROM checklist_items WHERE topic_id = ?', t.id).n;
      const done = get(
        'SELECT COUNT(*) AS n FROM checklist_progress cp JOIN checklist_items c ON c.id = cp.item_id WHERE c.topic_id = ? AND cp.student_id = ?',
        t.id,
        s.id,
      ).n;
      const best = get("SELECT MAX(percent) AS p, COUNT(*) AS n FROM test_results WHERE kind='topic' AND topic_id = ? AND student_id = ?", t.id, s.id);
      return { topic_id: t.id, title: t.title, done, total, progress: total ? Math.round((done / total) * 100) : 0, best: best.p, tests: best.n };
    });
    const results = all(
      `SELECT r.id, r.kind, r.topic_id, t.title AS topic_title, r.correct, r.total, r.percent, r.created_at
       FROM test_results r LEFT JOIN topics t ON t.id = r.topic_id WHERE r.student_id = ? ORDER BY r.created_at DESC, r.id DESC`,
      s.id,
    );
    res.json({ student: s, topics, results });
  }),
);

adminRouter.get(
  '/stats/students.csv',
  wrap((_req, res) => {
    const rows = studentsTable();
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['ID', 'Логин', 'Аты-жөні', 'Тіркелген', 'Соңғы кіру', 'Чек-лист %', 'Тақырыптық тесттер', 'Орташа %', 'Қорытынды тесттер', 'Қорытынды ең жоғары %'];
    const lines = rows.map((s) =>
      [s.id, s.username, s.display_name, s.created_at, s.last_login, s.progress, s.topic_tests, s.topic_avg, s.final_tests, s.final_best].map(esc).join(','),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="qazaq-handygy-students.csv"');
    res.send('﻿' + [header.map(esc).join(','), ...lines].join('\r\n'));
  }),
);

// ─── Generic CRUD for content entities ─────────────────────────────
adminRouter.get(
  '/:entity',
  wrap((req, res) => {
    const e = entityOr404(req.params.entity);
    const where = [];
    const params = [];
    if (e.scope && req.query[e.scope] !== undefined) {
      where.push(`${e.scope} = ?`);
      params.push(int(req.query[e.scope]));
    }
    const order = e.table === 'dates' ? 'sort_year, position, id' : 'position, id';
    const rows = all(`SELECT * FROM ${e.table} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order}`, ...params);
    if (e.table === 'questions') rows.forEach((r) => Object.assign(r, { options: JSON.parse(r.options), correct: JSON.parse(r.correct) }));
    res.json(rows);
  }),
);

adminRouter.post(
  '/:entity',
  wrap((req, res) => {
    const e = entityOr404(req.params.entity);
    const row = pickFields(e, req.body || {}, { partial: false });
    if (e.validate) e.validate(row);
    const scopeVal = e.scope ? row[e.scope] : null;
    const { m } = get(`SELECT COALESCE(MAX(position), -1) AS m FROM ${e.table} ${e.scope ? `WHERE ${e.scope} = ?` : ''}`, ...(e.scope ? [scopeVal] : []));
    row.position = m + 1;
    const keys = Object.keys(row);
    const id = Number(run(`INSERT INTO ${e.table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => row[k])).lastInsertRowid);
    res.status(201).json(get(`SELECT * FROM ${e.table} WHERE id = ?`, id));
  }),
);

adminRouter.put(
  '/:entity/:id',
  wrap((req, res) => {
    const e = entityOr404(req.params.entity);
    const id = int(req.params.id);
    const existing = get(`SELECT * FROM ${e.table} WHERE id = ?`, id);
    if (!existing) throw new HttpError(404, 'Жазба табылмады.');
    const row = pickFields(e, req.body || {}, { partial: true });
    if (e.validate) {
      const merged = { ...existing, ...row };
      e.validate(merged);
      row.options = merged.options;
      row.correct = merged.correct;
    }
    if (e.scope && row[e.scope] !== undefined && row[e.scope] !== existing[e.scope]) {
      // moved to another topic: append at the end there
      row.position = get(`SELECT COALESCE(MAX(position), -1) + 1 AS p FROM ${e.table} WHERE ${e.scope} = ?`, row[e.scope]).p;
    }
    const keys = Object.keys(row);
    if (!keys.length) throw new HttpError(400, 'Өзгеріс жоқ.');
    const touch = e.touch ? ", updated_at = datetime('now')" : '';
    run(`UPDATE ${e.table} SET ${keys.map((k) => `${k} = ?`).join(', ')}${touch} WHERE id = ?`, ...keys.map((k) => row[k]), id);
    res.json(get(`SELECT * FROM ${e.table} WHERE id = ?`, id));
  }),
);

adminRouter.delete(
  '/:entity/:id',
  wrap((req, res) => {
    const e = entityOr404(req.params.entity);
    const id = int(req.params.id);
    const r = run(`DELETE FROM ${e.table} WHERE id = ?`, id);
    if (!r.changes) throw new HttpError(404, 'Жазба табылмады.');
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/:entity/reorder',
  wrap((req, res) => {
    const e = entityOr404(req.params.entity);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(int) : null;
    if (!ids || !ids.length) throw new HttpError(400, 'Рет тізімі бос.');
    const rows = all(`SELECT id ${e.scope ? `, ${e.scope} AS scope` : ''} FROM ${e.table} WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
    if (rows.length !== ids.length) throw new HttpError(400, 'Кейбір жазбалар табылмады.');
    if (e.scope && new Set(rows.map((r) => r.scope)).size > 1) throw new HttpError(400, 'Тек бір тақырып ішіндегі жазбалардың ретін өзгертуге болады.');
    tx(() => ids.forEach((id, i) => run(`UPDATE ${e.table} SET position = ? WHERE id = ?`, i, id)));
    res.json({ ok: true });
  }),
);

adminRouter.use((err, _req, res, _next) => {
  const status = err.status || (err instanceof SyntaxError ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Сервер қатесі. Қайталап көріңіз.' : err.message });
});
