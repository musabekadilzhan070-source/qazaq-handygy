import crypto from 'node:crypto';
import { all, get, run, getSettings } from './db.js';

const ATTEMPT_TTL_MS = 1000 * 60 * 60 * 24;

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseQuestion(row) {
  return { ...row, options: JSON.parse(row.options), correct: JSON.parse(row.correct) };
}

/** Question as sent to the student: no correct answers, no explanation, options shuffled. */
function publicQuestion(q, topicTitle) {
  let options = shuffle(q.options);
  if (q.type === 'order') {
    // never hand out an order question already in the correct order
    for (let i = 0; i < 5 && options.every((o, idx) => o.id === q.correct[idx]); i++) options = shuffle(q.options);
  }
  return { id: q.id, topic_id: q.topic_id, topic_title: topicTitle, type: q.type, text: q.text, options };
}

function createAttempt(kind, topicId, studentId, questions) {
  const id = crypto.randomBytes(16).toString('base64url');
  run(
    'INSERT INTO quiz_attempts (id, kind, topic_id, student_id, question_ids, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    kind,
    topicId ?? null,
    studentId ?? null,
    JSON.stringify(questions.map((q) => q.id)),
    Date.now(),
  );
  return id;
}

export function startTopicQuiz(topicId, studentId) {
  const topic = get('SELECT id, title FROM topics WHERE id = ?', topicId);
  if (!topic) return null;
  const questions = all('SELECT * FROM questions WHERE topic_id = ? AND active = 1 ORDER BY position, id', topicId).map(parseQuestion);
  const attemptId = createAttempt('topic', topicId, studentId, questions);
  return { attemptId, kind: 'topic', topic, questions: questions.map((q) => publicQuestion(q, topic.title)) };
}

/**
 * Final test: questions marked "in_final" from every visible topic, spread as
 * evenly as the available questions allow (round-robin across topics).
 */
export function startFinalQuiz(studentId) {
  const settings = getSettings();
  const target = Math.max(1, Math.min(100, Number(settings.final_question_count) || 16));
  const topics = all('SELECT id, title FROM topics WHERE visible = 1 ORDER BY position, id');
  const pools = topics.map((t) => ({
    topic: t,
    items: shuffle(all('SELECT * FROM questions WHERE topic_id = ? AND active = 1 AND in_final = 1', t.id).map(parseQuestion)),
  }));
  const picked = [];
  let progressed = true;
  while (picked.length < target && progressed) {
    progressed = false;
    for (const pool of pools) {
      if (picked.length >= target) break;
      const q = pool.items.shift();
      if (q) {
        picked.push({ q, title: pool.topic.title });
        progressed = true;
      }
    }
  }
  // keep topics in chronological order, shuffle inside each topic
  const order = new Map(topics.map((t, i) => [t.id, i]));
  picked.sort((a, b) => order.get(a.q.topic_id) - order.get(b.q.topic_id));
  const attemptId = createAttempt(
    'final',
    null,
    studentId,
    picked.map((p) => p.q),
  );
  return {
    attemptId,
    kind: 'final',
    topics: topics.map((t) => ({ id: t.id, title: t.title, count: picked.filter((p) => p.q.topic_id === t.id).length })),
    questions: picked.map((p) => publicQuestion(p.q, p.title)),
  };
}

function isCorrect(q, selected) {
  if (!Array.isArray(selected)) return false;
  if (q.type === 'order') return selected.length === q.correct.length && selected.every((id, i) => id === q.correct[i]);
  const a = new Set(selected);
  return a.size === q.correct.length && q.correct.every((id) => a.has(id));
}

/**
 * Grades a submitted attempt on the server. Unanswered questions count as wrong.
 * Returns the full review (with correct answers) only after submission.
 */
export function gradeAttempt(attemptId, answers, student) {
  const attempt = get('SELECT * FROM quiz_attempts WHERE id = ?', String(attemptId || ''));
  if (!attempt) return { error: 'Тест сессиясы табылмады. Тестті қайта бастаңыз.', status: 404 };
  if (attempt.submitted_at) return { error: 'Бұл тест бұрын тапсырылған. Тестті қайта бастаңыз.', status: 409 };
  if (Date.now() - attempt.created_at > ATTEMPT_TTL_MS) return { error: 'Тест уақыты өтіп кетті. Тестті қайта бастаңыз.', status: 410 };
  if (attempt.student_id && (!student || student.id !== attempt.student_id)) return { error: 'Бұл тест басқа аккаунтқа тиесілі.', status: 403 };

  const ids = JSON.parse(attempt.question_ids);
  const byId = new Map();
  if (ids.length) {
    const rows = all(`SELECT q.*, t.title AS topic_title FROM questions q JOIN topics t ON t.id = q.topic_id WHERE q.id IN (${ids.map(() => '?').join(',')})`, ...ids);
    for (const r of rows) byId.set(r.id, parseQuestion(r));
  }
  const given = answers && typeof answers === 'object' ? answers : {};
  const review = [];
  for (const id of ids) {
    const q = byId.get(id);
    if (!q) continue; // question deleted meanwhile
    const raw = given[id] ?? given[String(id)];
    const selected = Array.isArray(raw) ? raw.map(String).slice(0, 12) : [];
    review.push({
      id: q.id,
      topic_id: q.topic_id,
      topic_title: q.topic_title,
      type: q.type,
      text: q.text,
      options: q.options,
      selected,
      correct: q.correct,
      is_correct: isCorrect(q, selected),
      explanation: q.explanation,
    });
  }

  const correct = review.filter((r) => r.is_correct).length;
  const total = review.length;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  const threshold = Number(getSettings().mastery_threshold) || 70;

  const breakdownMap = new Map();
  for (const r of review) {
    const b = breakdownMap.get(r.topic_id) || { topic_id: r.topic_id, title: r.topic_title, correct: 0, total: 0 };
    b.total += 1;
    if (r.is_correct) b.correct += 1;
    breakdownMap.set(r.topic_id, b);
  }
  const breakdown = [...breakdownMap.values()].map((b) => {
    const p = b.total ? Math.round((b.correct / b.total) * 100) : 0;
    return { ...b, percent: p, mastered: p >= threshold };
  });

  run('UPDATE quiz_attempts SET submitted_at = ? WHERE id = ?', Date.now(), attempt.id);

  let resultId = null;
  if (student) {
    resultId = Number(
      run(
        `INSERT INTO test_results (attempt_id, student_id, kind, topic_id, correct, total, percent, breakdown, review)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        attempt.id,
        student.id,
        attempt.kind,
        attempt.topic_id,
        correct,
        total,
        percent,
        JSON.stringify(breakdown),
        JSON.stringify(review.map((r) => ({ id: r.id, selected: r.selected, is_correct: r.is_correct }))),
      ).lastInsertRowid,
    );
    if (attempt.kind === 'topic' && attempt.topic_id) {
      // "Тақырыптық тестті орындадым" items are ticked automatically after a completed topic test.
      for (const item of all("SELECT id FROM checklist_items WHERE topic_id = ? AND auto = 'quiz'", attempt.topic_id)) {
        run('INSERT OR IGNORE INTO checklist_progress (student_id, item_id) VALUES (?, ?)', student.id, item.id);
      }
    }
  }

  return {
    result: {
      id: resultId,
      saved: Boolean(student),
      kind: attempt.kind,
      topic_id: attempt.topic_id,
      correct,
      wrong: total - correct,
      total,
      percent,
      threshold,
      breakdown,
      review,
    },
  };
}
