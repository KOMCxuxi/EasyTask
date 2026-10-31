// ics.js — 产生 iCalendar (.ics) 文字，让任务可以导入 iOS / macOS 的系统日历。
// 事件用 UTC 时间（不加 VTIMEZONE），提醒用 VALARM，由系统日历在本机触发。
// 纯函数，不碰 DOM，方便单元测试。

import { effectiveRemind, fmtDuration, pad2 } from './util.js';

const PRODID = '-//Pixel Notes//Pixel Notes 1.1//ZH';

const CATEGORY_LABEL = {
  work: '工作',
  life: '生活',
  study: '学习',
  other: '其他',
};

/** 毫秒 → iCalendar UTC 时间（20261101T090000Z） */
export function utcStamp(ms) {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

/** 文字内容转义（反斜线、分号、逗号、换行） */
export function escapeICSText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n?/g, '\\n')
    .replace(/\n/g, '\\n');
}

/** RFC 5545 的 75 octet 折行（UTF-8 安全，续行以一个空格开头） */
export function foldLine(line) {
  const text = String(line);
  if (new TextEncoder().encode(text).length <= 75) return text;

  const encoder = new TextEncoder();
  const parts = [];
  let current = '';
  let currentBytes = 0;
  for (const ch of text) {
    const size = encoder.encode(ch).length;
    if (currentBytes + size > 73) {
      parts.push(current);
      current = '';
      currentBytes = 0;
    }
    current += ch;
    currentBytes += size;
  }
  if (current) parts.push(current);
  return [parts[0], ...parts.slice(1).map((part) => ` ${part}`)].join('\r\n');
}

function eventLines(task, now) {
  const title = task.title || '未命名任务';
  const category = CATEGORY_LABEL[task.cat] || CATEGORY_LABEL.other;
  const description = [
    `分类：${category}`,
    `时长：${fmtDuration((task.endAt - task.startAt) / 60000)}`,
    '由 Pixel Notes 导出',
  ].join('\n');

  const lines = [
    'BEGIN:VEVENT',
    `UID:task-${task.id}@pixel-notes`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(task.startAt)}`,
    `DTEND:${utcStamp(task.endAt)}`,
    `SUMMARY:${escapeICSText(title)}`,
    `DESCRIPTION:${escapeICSText(description)}`,
    `CATEGORIES:${escapeICSText(category)}`,
    `LAST-MODIFIED:${utcStamp(task.updatedAt || now)}`,
    `SEQUENCE:${Math.max(0, Math.floor((task.updatedAt || now) / 1000))}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
  ];

  const remind = effectiveRemind(task);
  if (remind !== null) {
    lines.push(
      'BEGIN:VALARM',
      `TRIGGER:-PT${remind}M`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeICSText(title)}`,
      'END:VALARM'
    );
  }

  lines.push('END:VEVENT');
  return lines;
}

/**
 * 把任务转成 .ics 文字。
 * @param {Array} tasks 任务数组（会在汇出时排序）
 * @param {object} options { now, calendarName, timeZone }
 */
export function buildICS(tasks, options = {}) {
  const now = options.now ?? Date.now();
  const calendarName = options.calendarName || 'Pixel Notes';
  const timeZone =
    options.timeZone ||
    (typeof Intl !== 'undefined' && Intl.DateTimeFormat
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC') ||
    'UTC';

  const sorted = [...(tasks || [])].sort((a, b) => a.startAt - b.startAt);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICSText(calendarName)}`,
    `X-WR-TIMEZONE:${escapeICSText(timeZone)}`,
    ...sorted.flatMap((task) => eventLines(task, now)),
    'END:VCALENDAR',
  ];

  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** 安全的文件名（去掉路径与奇怪字符） */
export function icsFilename(prefix = 'tasks') {
  const safe = String(prefix)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40);
  const d = new Date();
  return `pixel-notes-${safe || 'tasks'}-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.ics`;
}
