// util.js — 纯函数工具（不依赖 DOM / IndexedDB，方便单独测试）
// 全部时间都按「装置本地时区」处理，存档里存毫秒时间戳。

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export const pad2 = (n) => String(n).padStart(2, '0');

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function startOfDay(input) {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(input, n) {
  const d = new Date(input);
  d.setDate(d.getDate() + n);
  return d;
}

/** 本地日期键：YYYY-MM-DD（用于分组、匹配「今天」） */
export function dayKey(input) {
  const d = new Date(input);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 把 <input type="date"> + <input type="time"> 的值转成时间戳 */
export function parseLocal(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mm] = String(timeStr).split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh)) return null;
  const dt = new Date(y, m - 1, d, hh, mm || 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function toDateValue(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function toTimeValue(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fmtTime(ts) {
  return toTimeValue(ts);
}

export function fmtDateShort(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function fmtDateCN(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]}`;
}

/** 同一天显示 14:00–15:30；跨天显示 11/1 14:00 → 11/2 09:00 */
export function fmtRange(startAt, endAt) {
  if (dayKey(startAt) === dayKey(endAt)) {
    return `${fmtTime(startAt)}–${fmtTime(endAt)}`;
  }
  return `${fmtDateShort(startAt)} ${fmtTime(startAt)} → ${fmtDateShort(endAt)} ${fmtTime(endAt)}`;
}

export function fmtDuration(minutes) {
  const min = Math.max(0, Math.round(minutes));
  const days = Math.floor(min / 1440);
  const hours = Math.floor((min % 1440) / 60);
  const mins = min % 60;
  const parts = [];
  if (days) parts.push(`${days} 天`);
  if (hours) parts.push(`${hours} 小时`);
  if (mins) parts.push(`${mins} 分钟`);
  return parts.length ? parts.join(' ') : '0 分钟';
}

export function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** 今天 / 明天 / 昨天 / 11月1日 周六 */
export function relDayLabel(ts, now = Date.now()) {
  const k = dayKey(ts);
  if (k === dayKey(now)) return '今天';
  if (k === dayKey(addDays(now, 1))) return '明天';
  if (k === dayKey(addDays(now, -1))) return '昨天';
  const d = new Date(ts);
  const year = d.getFullYear() !== new Date(now).getFullYear() ? `${d.getFullYear()}年` : '';
  return `${year}${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]}`;
}

/** 刚刚 / 12 分钟前 / 3 小时前 / 昨天 / 11月1日 */
export function fmtUpdated(ts, now = Date.now()) {
  const diff = now - ts;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (dayKey(ts) === dayKey(now)) return `${Math.floor(diff / 3600000)} 小时前`;
  if (dayKey(ts) === dayKey(addDays(now, -1))) return '昨天';
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 周一开头的月历网格，总是 5 或 6 行 × 7 列 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // 周一 = 0
  const days = new Date(year, month + 1, 0).getDate();
  const total = Math.ceil((offset + days) / 7) * 7;
  const cells = [];
  for (let i = 0; i < total; i += 1) {
    const dayNum = i - offset + 1;
    const d = new Date(year, month, dayNum);
    cells.push({
      ts: d.getTime(),
      day: d.getDate(),
      inMonth: dayNum >= 1 && dayNum <= days,
    });
  }
  return cells;
}

export function monthLabel(year, month) {
  return `${year} 年 ${month + 1} 月`;
}

export function roundUpHalfHour(input) {
  const step = 30 * 60 * 1000;
  return new Date(Math.ceil(new Date(input).getTime() / step) * step).getTime();
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** HTML 转义（用于 textContent 之外的所有插值） */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

/** 笔记预览：空白折叠、截断 */
export function notePreview(note, max = 90) {
  const text = String(note.body || '').replace(/\s+/g, ' ').trim();
  if (!text) return '（空白笔记）';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function charCount(text) {
  return Array.from(String(text || '')).length;
}
