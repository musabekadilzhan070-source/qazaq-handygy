import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { get, run, tx } from './db.js';
import { savePortrait } from './images.js';
import { TOPICS } from './seed/content.js';

const OPTION_IDS = 'abcdefgh';

export function buildOptions(texts) {
  return texts.map((text, i) => ({ id: OPTION_IDS[i], text }));
}

/** Seeds the initial eight topics once, when the database has no topics yet. */
export async function seedIfEmpty() {
  const { n } = get('SELECT COUNT(*) AS n FROM topics');
  if (n > 0) return false;

  // Portraits are prepared first (async), keeping the exact order in which they were provided.
  const portraitFiles = {};
  for (const topic of TOPICS) {
    for (const khan of topic.khans) {
      const src = path.join(config.seedDir, 'portraits', khan.portrait);
      if (fs.existsSync(src)) portraitFiles[khan.portrait] = await savePortrait(fs.readFileSync(src), khan.portrait);
    }
  }

  tx(() => {
    TOPICS.forEach((t, ti) => {
      const topicId = Number(
        run(
          `INSERT INTO topics (position, title, reign_label, summary, place_in_history, era_features, remember)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ti,
          t.title,
          t.reign_label,
          t.summary,
          t.place_in_history,
          t.era_features,
          t.remember,
        ).lastInsertRowid,
      );

      t.khans.forEach((k, ki) => {
        const khanId = Number(
          run(
            `INSERT INTO khans (topic_id, position, name, full_name, reign, biography, internal_policy, external_policy, contribution)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            topicId,
            ki,
            k.name,
            k.full_name,
            k.reign,
            k.biography,
            k.internal_policy,
            k.external_policy,
            k.contribution,
          ).lastInsertRowid,
        );
        const p = portraitFiles[k.portrait];
        if (p) {
          const portraitId = Number(
            run(
              `INSERT INTO portraits (khan_id, file, card_file, large_file, original_name, mime, width, height)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              khanId,
              p.file,
              p.card_file,
              p.large_file,
              p.original_name,
              p.mime,
              p.width,
              p.height,
            ).lastInsertRowid,
          );
          run('UPDATE khans SET portrait_id = ? WHERE id = ?', portraitId, khanId);
        }
      });

      t.events.forEach((e, i) =>
        run(
          'INSERT INTO events (topic_id, position, year_label, title, description, disputed, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
          topicId,
          i,
          e.year_label,
          e.title,
          e.description,
          e.disputed ? 1 : 0,
          e.note || '',
        ),
      );
      t.dates.forEach((d, i) =>
        run(
          'INSERT INTO dates (topic_id, position, year_label, sort_year, text, disputed, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
          topicId,
          i,
          d.year_label,
          d.sort_year,
          d.text,
          d.disputed ? 1 : 0,
          d.note || '',
        ),
      );
      t.terms.forEach((term, i) =>
        run('INSERT INTO terms (topic_id, position, kind, name, description) VALUES (?, ?, ?, ?, ?)', topicId, i, term.kind, term.name, term.description),
      );
      t.checklist.forEach((c, i) =>
        run('INSERT INTO checklist_items (topic_id, position, text, auto) VALUES (?, ?, ?, ?)', topicId, i, c.text, c.auto || null),
      );
      t.questions.forEach((q, i) => {
        const options = buildOptions(q.options);
        const correct = q.type === 'order' ? options.map((o) => o.id) : q.correct.map((idx) => options[idx].id);
        run(
          `INSERT INTO questions (topic_id, position, type, text, options, correct, explanation, in_final)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          topicId,
          i,
          q.type,
          q.text,
          JSON.stringify(options),
          JSON.stringify(correct),
          q.explanation || '',
          q.final ? 1 : 0,
        );
      });
    });
  });
  console.log(`[seed] ${TOPICS.length} тақырып пен ${Object.keys(portraitFiles).length} портрет жүктелді.`);
  return true;
}
