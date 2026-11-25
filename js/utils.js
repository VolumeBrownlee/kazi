/* Kazi — small, dependency-free helpers. */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

export function uid(prefix = 'id') {
  const random = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${random}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function debounce(fn, wait = 250) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  wrapped.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return wrapped;
}

export function truncate(value, length = 120) {
  const text = String(value || '');
  if (text.length <= length) return text;
  return `${text.slice(0, Math.max(0, length - 1)).trimEnd()}…`;
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO(ref = new Date()) {
  return toISODate(ref);
}

export function nowISO() {
  return new Date().toISOString();
}

export function parseDateOnly(iso) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addDaysISO(iso, days) {
  const date = parseDateOnly(iso);
  if (!date) return null;
  date.setDate(date.getDate() + Number(days || 0));
  return toISODate(date);
}

export function addMonthsISO(iso, months) {
  const date = parseDateOnly(iso);
  if (!date) return null;
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + Number(months || 0));
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, last));
  return toISODate(date);
}

export function daysUntil(iso, fromISO = todayISO()) {
  const target = parseDateOnly(iso);
  const from = parseDateOnly(fromISO);
  if (!target || !from) return null;
  const targetUTC = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const fromUTC = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((targetUTC - fromUTC) / 86400000);
}

export function isPast(iso, fromISO = todayISO()) {
  const days = daysUntil(iso, fromISO);
  return days != null && days < 0;
}

export function formatDate(iso, { year = true, weekday = false, short = false } = {}) {
  const date = parseDateOnly(iso);
  if (!date) return '';
  const options = {
    day: 'numeric',
    month: short ? 'short' : 'short'
  };
  if (year) options.year = 'numeric';
  if (weekday) options.weekday = 'short';
  return new Intl.DateTimeFormat('en-GB', options).format(date);
}

export function formatDateLong(iso) {
  const date = parseDateOnly(iso);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

export function formatDateFromTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  }).format(date);
}

export function formatTime(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? 'pm' : 'am';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

export function relativeTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const future = diff < 0;
  const seconds = Math.abs(diff) / 1000;
  if (seconds < 60) return future ? 'in a moment' : 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return future ? `in ${minutes}m` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return future ? `in ${days}d` : `${days}d ago`;
  return formatDateFromTimestamp(value);
}

export function formatRange(start, end, current = false) {
  const left = String(start || '').trim();
  const right = current ? 'Present' : String(end || '').trim();
  if (left && right) return `${left} — ${right}`;
  return left || right;
}

export function monthLabel(year, month) {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
    .format(new Date(year, month, 1));
}

export function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const start = new Date(year, month, 1 - offset);
  const today = todayISO();
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const iso = toISODate(date);
    return {
      iso,
      day: date.getDate(),
      inMonth: date.getMonth() === month,
      isToday: iso === today,
      weekday: date.getDay()
    };
  });
}

export function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/* ------------------------------------------------------------------ */
/* Text and identity                                                   */
/* ------------------------------------------------------------------ */

export function initials(name) {
  const cleaned = String(name || '').trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const AVATAR_COLORS = [
  '#1f5a43', '#a84a2f', '#315b8a', '#7a5a1e', '#5b477f',
  '#2f6f70', '#8a3d5b', '#4d5e2f', '#6b4f3a', '#3f5a78'
];

export function colorFor(value) {
  const text = String(value || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function titleCase(value) {
  const small = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'in', 'on', 'at', 'for', 'to', 'with']);
  return String(value || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => (index > 0 && small.has(word)) ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function isUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function stripProtocol(url) {
  return String(url || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

export function download(filename, content, type = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(blob);
  });
}

export async function dataURLToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsText(file);
  });
}

/* ------------------------------------------------------------------ */
/* Clipboard                                                           */
/* ------------------------------------------------------------------ */

export async function copyText(value) {
  const text = String(value == null ? '' : value);
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } finally {
    area.remove();
  }
  if (!ok) throw new Error('Copy failed');
  return true;
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

export function toCSV(rows) {
  return rows.map(row => row.map(cell => {
    const text = String(cell == null ? '' : cell);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }).join(',')).join('\r\n');
}

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\r') {
      // handled by the next \n
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(item => item.some(cell => String(cell).trim() !== ''));
}

export function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(header => String(header || '').trim());
  return rows.slice(1).map(row => {
    const object = {};
    headers.forEach((header, index) => {
      object[header] = row[index] == null ? '' : String(row[index]);
    });
    return object;
  });
}

/* ------------------------------------------------------------------ */
/* Calendar export                                                     */
/* ------------------------------------------------------------------ */

function icsEscape(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsFold(line) {
  if (line.length <= 75) return line;
  const parts = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = rest.slice(75);
  }
  parts.push(rest);
  return parts.join('\r\n ');
}

function icsStamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function icsTime(date, time, addMinutes = 0) {
  const [year, month, day] = String(date).split('-').map(Number);
  const [hour, minute] = String(time || '09:00').split(':').map(Number);
  const value = new Date(year, month - 1, day, hour, minute + addMinutes);
  return `${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, '0')}${String(value.getDate()).padStart(2, '0')}T${String(value.getHours()).padStart(2, '0')}${String(value.getMinutes()).padStart(2, '0')}00`;
}

export function buildICS(events, calendarName = 'Kazi — Job search') {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kazi//Job search//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(calendarName)}`
  ];
  for (const event of events || []) {
    if (!event.date) continue;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${icsEscape(event.uid || uid('event'))}@kazi.local`);
    lines.push(`DTSTAMP:${icsStamp()}`);
    lines.push(`SUMMARY:${icsEscape(event.title || 'Job search task')}`);
    if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
    if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`);
    if (event.time) {
      lines.push(`DTSTART:${icsTime(event.date, event.time)}`);
      lines.push(`DTEND:${icsTime(event.date, event.time, event.durationMinutes || 60)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${String(event.date).replace(/-/g, '')}`);
      lines.push(`DTEND;VALUE=DATE:${String(addDaysISO(event.date, 1)).replace(/-/g, '')}`);
    }
    if (event.alarmMinutes) {
      lines.push('BEGIN:VALARM');
      lines.push(`TRIGGER:-PT${Math.abs(event.alarmMinutes)}M`);
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:${icsEscape(event.title || 'Kazi reminder')}`);
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n');
}
