import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

let sharp = null;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.warn('[images] sharp орнатылмаған: портреттер бастапқы файл күйінде беріледі (кішірейтілген нұсқасыз).');
}

const MAX_BYTES = 12 * 1024 * 1024;

export function detectImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: 'png', mime: 'image/png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

/**
 * Saves the original upload untouched and, when sharp is available, a resized
 * WebP copy for cards (width 560) and for the topic page (width 1000).
 * Resizing only scales the picture; the image content itself is not altered.
 */
export async function savePortrait(buf, originalName = '') {
  if (!buf || !buf.length) throw Object.assign(new Error('Файл бос.'), { status: 400 });
  if (buf.length > MAX_BYTES) throw Object.assign(new Error('Файл тым үлкен (ең көбі 12 МБ).'), { status: 413 });
  const type = detectImageType(buf);
  if (!type) throw Object.assign(new Error('Тек PNG, JPG немесе WEBP суреттерін жүктеуге болады.'), { status: 415 });

  const base = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
  const file = `${base}.${type.ext}`;
  fs.writeFileSync(path.join(config.portraitsDir, file), buf);

  let card_file = null;
  let large_file = null;
  let width = null;
  let height = null;
  if (sharp) {
    try {
      const meta = await sharp(buf).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
      card_file = `${base}-card.webp`;
      large_file = `${base}-large.webp`;
      await sharp(buf).resize({ width: 560, withoutEnlargement: true }).webp({ quality: 84 }).toFile(path.join(config.portraitsDir, card_file));
      await sharp(buf).resize({ width: 1000, withoutEnlargement: true }).webp({ quality: 86 }).toFile(path.join(config.portraitsDir, large_file));
    } catch (err) {
      console.warn('[images] кішірейту сәтсіз:', err.message);
      card_file = null;
      large_file = null;
    }
  }
  return { file, card_file, large_file, mime: type.mime, width, height, original_name: String(originalName).slice(0, 200) };
}

export function deletePortraitFiles(row) {
  for (const f of [row.file, row.card_file, row.large_file]) {
    if (!f) continue;
    const p = path.join(config.portraitsDir, path.basename(f));
    try {
      fs.unlinkSync(p);
    } catch {
      /* already gone */
    }
  }
}

export function portraitUrls(row) {
  if (!row || !row.file) return null;
  const u = (f) => `/uploads/portraits/${encodeURIComponent(f)}`;
  return {
    original: u(row.file),
    card: row.card_file ? u(row.card_file) : u(row.file),
    large: row.large_file ? u(row.large_file) : u(row.file),
  };
}
