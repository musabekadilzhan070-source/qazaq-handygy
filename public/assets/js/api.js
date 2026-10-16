import { loading } from './ui.js';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** JSON fetch wrapper with the CSRF header and readable Kazakh error messages. */
export async function api(path, { method = 'GET', body, raw, headers = {}, quiet = false } = {}) {
  const opts = { method, headers: { ...headers }, credentials: 'same-origin' };
  if (method !== 'GET') opts.headers['X-QH'] = '1';
  if (raw) {
    opts.body = raw;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (!quiet) loading(true);
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new ApiError('Серверге қосылу мүмкін болмады. Интернет байланысын тексеріңіз.', 0);
  } finally {
    if (!quiet) loading(false);
  }
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) throw new ApiError(data?.error || `Қате орын алды (${res.status}).`, res.status);
  return data;
}
