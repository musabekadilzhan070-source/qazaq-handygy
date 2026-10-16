// Read models for the student-facing site.
import { all, get } from './db.js';
import { portraitUrls } from './images.js';

function khanRows(topicIds) {
  if (!topicIds.length) return [];
  return all(
    `SELECT k.*, p.file, p.card_file, p.large_file FROM khans k
     LEFT JOIN portraits p ON p.id = k.portrait_id
     WHERE k.topic_id IN (${topicIds.map(() => '?').join(',')})
     ORDER BY k.topic_id, k.position, k.id`,
    ...topicIds,
  );
}

function khanOut(k, full) {
  const base = { id: k.id, topic_id: k.topic_id, name: k.name, full_name: k.full_name, reign: k.reign, portrait: portraitUrls(k) };
  if (!full) return base;
  return {
    ...base,
    biography: k.biography,
    internal_policy: k.internal_policy,
    external_policy: k.external_policy,
    contribution: k.contribution,
  };
}

export function listTopics({ includeHidden = false } = {}) {
  const topics = all(`SELECT * FROM topics ${includeHidden ? '' : 'WHERE visible = 1'} ORDER BY position, id`);
  const ids = topics.map((t) => t.id);
  const khans = khanRows(ids);
  const checklist = ids.length
    ? all(`SELECT id, topic_id FROM checklist_items WHERE topic_id IN (${ids.map(() => '?').join(',')}) ORDER BY position, id`, ...ids)
    : [];
  const qCounts = new Map(
    (ids.length
      ? all(`SELECT topic_id, COUNT(*) AS n FROM questions WHERE active = 1 AND topic_id IN (${ids.map(() => '?').join(',')}) GROUP BY topic_id`, ...ids)
      : []
    ).map((r) => [r.topic_id, r.n]),
  );
  return topics.map((t, index) => ({
    id: t.id,
    number: index + 1,
    visible: Boolean(t.visible),
    title: t.title,
    reign_label: t.reign_label,
    summary: t.summary,
    khans: khans.filter((k) => k.topic_id === t.id).map((k) => khanOut(k, false)),
    checklist_ids: checklist.filter((c) => c.topic_id === t.id).map((c) => c.id),
    question_count: qCounts.get(t.id) || 0,
  }));
}

export function getTopic(id) {
  const t = get('SELECT * FROM topics WHERE id = ? AND visible = 1', id);
  if (!t) return null;
  const visible = all('SELECT id, title FROM topics WHERE visible = 1 ORDER BY position, id');
  const idx = visible.findIndex((v) => v.id === t.id);
  return {
    id: t.id,
    number: idx + 1,
    title: t.title,
    reign_label: t.reign_label,
    summary: t.summary,
    place_in_history: t.place_in_history,
    era_features: t.era_features,
    remember: t.remember
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    updated_at: t.updated_at,
    khans: khanRows([t.id]).map((k) => khanOut(k, true)),
    events: all('SELECT id, khan_id, year_label, title, description, disputed, note FROM events WHERE topic_id = ? ORDER BY position, id', t.id),
    dates: all('SELECT id, year_label, sort_year, text, disputed, note FROM dates WHERE topic_id = ? ORDER BY sort_year, position, id', t.id),
    terms: all('SELECT id, kind, name, description FROM terms WHERE topic_id = ? ORDER BY position, id', t.id),
    checklist: all('SELECT id, text, auto FROM checklist_items WHERE topic_id = ? ORDER BY position, id', t.id),
    question_count: get('SELECT COUNT(*) AS n FROM questions WHERE topic_id = ? AND active = 1', t.id).n,
    prev: idx > 0 ? visible[idx - 1] : null,
    next: idx >= 0 && idx < visible.length - 1 ? visible[idx + 1] : null,
  };
}

export function studentProgress(studentId) {
  return {
    checklist: all(
      `SELECT cp.item_id FROM checklist_progress cp JOIN checklist_items c ON c.id = cp.item_id WHERE cp.student_id = ?`,
      studentId,
    ).map((r) => r.item_id),
    reads: all('SELECT topic_id FROM topic_reads WHERE student_id = ?', studentId).map((r) => r.topic_id),
    results: all(
      `SELECT r.id, r.kind, r.topic_id, t.title AS topic_title, r.correct, r.total, r.percent, r.breakdown, r.created_at
       FROM test_results r LEFT JOIN topics t ON t.id = r.topic_id
       WHERE r.student_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 200`,
      studentId,
    ).map((r) => ({ ...r, breakdown: JSON.parse(r.breakdown || '[]') })),
  };
}
