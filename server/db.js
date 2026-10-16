import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  reign_label TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  place_in_history TEXT NOT NULL DEFAULT '',
  era_features TEXT NOT NULL DEFAULT '',
  remember TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portraits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  khan_id INTEGER REFERENCES khans(id) ON DELETE SET NULL,
  file TEXT NOT NULL,
  card_file TEXT,
  large_file TEXT,
  original_name TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS khans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  reign TEXT NOT NULL DEFAULT '',
  biography TEXT NOT NULL DEFAULT '',
  internal_policy TEXT NOT NULL DEFAULT '',
  external_policy TEXT NOT NULL DEFAULT '',
  contribution TEXT NOT NULL DEFAULT '',
  portrait_id INTEGER REFERENCES portraits(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  khan_id INTEGER REFERENCES khans(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  year_label TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  disputed INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  year_label TEXT NOT NULL,
  sort_year INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  disputed INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'term' CHECK (kind IN ('person','place','term')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  auto TEXT CHECK (auto IS NULL OR auto IN ('quiz'))
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('single','multi','order')),
  text TEXT NOT NULL,
  options TEXT NOT NULL,
  correct TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  in_final INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('student','admin')),
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checklist_progress (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  done_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, item_id)
);

CREATE TABLE IF NOT EXISTS topic_reads (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, topic_id)
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('topic','final')),
  topic_id INTEGER REFERENCES topics(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  question_ids TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  submitted_at INTEGER
);

CREATE TABLE IF NOT EXISTS test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id TEXT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('topic','final')),
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  percent INTEGER NOT NULL,
  breakdown TEXT NOT NULL DEFAULT '[]',
  review TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_khans_topic ON khans(topic_id, position);
CREATE INDEX IF NOT EXISTS idx_events_topic ON events(topic_id, position);
CREATE INDEX IF NOT EXISTS idx_dates_topic ON dates(topic_id, sort_year);
CREATE INDEX IF NOT EXISTS idx_terms_topic ON terms(topic_id, position);
CREATE INDEX IF NOT EXISTS idx_check_topic ON checklist_items(topic_id, position);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic_id, position);
CREATE INDEX IF NOT EXISTS idx_results_student ON test_results(student_id, created_at);
`);

export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}
export function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}
export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const DEFAULT_SETTINGS = {
  slogan: 'Қазақ хандығының тарихын зертте',
  hero_intro:
    'Керей мен Жәнібектен Әз Тәукеге дейін: хандардың өмірі, билік жылдары, ішкі және сыртқы саясаты, маңызды даталар мен ҰБТ-ға арналған тесттер бір жерде.',
  cards_heading: 'Қазақ хандары',
  cards_intro: 'Хандар билік құрған жылдарының ретімен орналасқан. Карточканы ашып, тақырыпты зертте.',
  final_intro:
    'Сегіз тақырыптың барлығынан сұрақтар. Тест соңында әр хан бойынша нәтижеңді және қайта оқу керек тақырыптарды көресің.',
  footer_text: 'QAZAQ HANDYǴY — ҰБТ-ға дайындалатын оқушыларға арналған оқу платформасы.',
  final_question_count: '16',
  mastery_threshold: '70',
  gold_tone: 'classic',
  effects: 'full',
};

export function getSettings() {
  const rows = all('SELECT key, value FROM settings');
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}
