// Қосымшаның күйі: сайт баптаулары, тақырыптар, оқушы және оның прогресі.
// Аккаунтқа кірген оқушының прогресі серверде (дерекқорда) сақталады.
// Кірмеген қонақтың белгілері осы құрылғыда уақытша сақталып, кейін аккаунтқа көшіріледі.
import { api } from './api.js';

const GUEST_KEY = 'qh_guest_progress_v1';
const listeners = new Set();

export const state = {
  site: null,
  topics: [],
  user: null,
  progress: { checklist: new Set(), reads: new Set(), results: [] },
};

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((fn) => fn(state));
}

function readGuest() {
  try {
    const g = JSON.parse(localStorage.getItem(GUEST_KEY) || '{}');
    return { checklist: g.checklist || [], reads: g.reads || [], results: g.results || [] };
  } catch {
    return { checklist: [], reads: [], results: [] };
  }
}
function writeGuest() {
  try {
    localStorage.setItem(
      GUEST_KEY,
      JSON.stringify({
        checklist: [...state.progress.checklist],
        reads: [...state.progress.reads],
        results: state.progress.results.slice(0, 50),
      }),
    );
  } catch {
    /* storage unavailable */
  }
}
function hasGuestData() {
  const g = readGuest();
  return g.checklist.length > 0 || g.reads.length > 0;
}
function clearGuest() {
  try {
    localStorage.removeItem(GUEST_KEY);
  } catch {
    /* ignore */
  }
}

function setProgress(p) {
  state.progress = {
    checklist: new Set(p.checklist || []),
    reads: new Set(p.reads || []),
    results: p.results || [],
  };
}

export async function boot() {
  const [site, topics, me] = await Promise.all([api('/api/site'), api('/api/topics'), api('/api/me')]);
  state.site = site;
  state.topics = topics;
  if (me.user) {
    state.user = me.user;
    setProgress(me.progress);
  } else {
    setProgress(readGuest());
  }
  return state;
}

export async function refreshTopics() {
  state.topics = await api('/api/topics', { quiet: true });
  emit();
}

export async function reloadProgress() {
  const me = await api('/api/me', { quiet: true });
  if (me.user) {
    state.user = me.user;
    setProgress(me.progress);
  } else {
    state.user = null;
    setProgress(readGuest());
  }
  emit();
}

export async function login(username, password) {
  const r = await api('/api/auth/login', { method: 'POST', body: { username, password } });
  state.user = r.user;
  return afterAuth();
}
export async function register(username, password, displayName) {
  const r = await api('/api/auth/register', { method: 'POST', body: { username, password, displayName } });
  state.user = r.user;
  return afterAuth();
}
async function afterAuth() {
  let imported = false;
  if (hasGuestData()) {
    const g = readGuest();
    const r = await api('/api/me/import', { method: 'POST', body: { checklist: g.checklist, reads: g.reads } });
    setProgress(r.progress);
    clearGuest();
    imported = true;
  }
  await reloadProgress();
  return { imported };
}
export async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  state.user = null;
  setProgress(readGuest());
  emit();
}

export async function toggleChecklist(itemId, done) {
  const set = state.progress.checklist;
  const before = set.has(itemId);
  done ? set.add(itemId) : set.delete(itemId);
  emit();
  if (!state.user) {
    writeGuest();
    return { saved: 'local' };
  }
  try {
    await api(`/api/me/checklist/${itemId}`, { method: 'PUT', body: { done }, quiet: true });
    return { saved: 'server' };
  } catch (err) {
    before ? set.add(itemId) : set.delete(itemId);
    emit();
    throw err;
  }
}

export async function setRead(topicId, read) {
  const set = state.progress.reads;
  read ? set.add(topicId) : set.delete(topicId);
  emit();
  if (!state.user) {
    writeGuest();
    return;
  }
  await api(`/api/me/read/${topicId}`, { method: 'PUT', body: { read }, quiet: true });
}

/** Called after a graded test. Server already stored it for logged-in students. */
export async function recordResult(result, topicTitle) {
  if (state.user) {
    await reloadProgress();
    return;
  }
  state.progress.results.unshift({
    id: null,
    kind: result.kind,
    topic_id: result.topic_id,
    topic_title: topicTitle || null,
    correct: result.correct,
    total: result.total,
    percent: result.percent,
    breakdown: result.breakdown,
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  });
  if (result.kind === 'topic') {
    const topic = state.topics.find((t) => t.id === result.topic_id);
    // auto items ("Тақырыптық тестті орындадым") are marked locally too
    if (topic && topic._autoIds) topic._autoIds.forEach((id) => state.progress.checklist.add(id));
  }
  writeGuest();
  emit();
}

// ─── Derived progress ──────────────────────────────────────────────
export function topicProgress(topic) {
  const ids = topic.checklist_ids || [];
  const done = ids.filter((id) => state.progress.checklist.has(id)).length;
  return { done, total: ids.length, percent: ids.length ? Math.round((done / ids.length) * 100) : 0 };
}

export function overallProgress() {
  let done = 0;
  let total = 0;
  for (const t of state.topics) {
    const p = topicProgress(t);
    done += p.done;
    total += p.total;
  }
  const completed = state.topics.filter((t) => {
    const p = topicProgress(t);
    return p.total > 0 && p.done === p.total;
  }).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0, completed };
}

export function bestTopicScore(topicId) {
  const list = state.progress.results.filter((r) => r.kind === 'topic' && r.topic_id === topicId);
  if (!list.length) return null;
  return Math.max(...list.map((r) => r.percent));
}
