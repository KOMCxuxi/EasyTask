// app.js — Pixel Notes 前端主程序
// 纯前端、离线优先：资料全部存在 IndexedDB，附件存 blob，不需要任何伺服器。

import { db } from './db.js';
import { getLang, initLang, isZh, LANGS, setLang, tl, translateDom, translateText } from './i18n.js';
import { buildICS, icsFilename } from './ics.js';
import { renderMarkdown } from './md.js';
import { htmlToMarkdown, htmlToText, isEmptyHtml, sanitizeHtml } from './richtext.js';
import {
  DEFAULT_REMIND,
  addDays,
  charCount,
  dayKey,
  esc,
  fmtDateCN,
  fmtDuration,
  fmtRange,
  fmtTime,
  fmtUpdated,
  humanSize,
  isOverdue,
  monthGrid,
  monthLabel,
  notePreview,
  pad2,
  parseLocal,
  relDayLabel,
  reminderLabel,
  roundUpHalfHour,
  startOfDay,
  toDateValue,
  toTimeValue,
  uid,
  weekHeader,
} from './util.js';

const MARK_SVG = `<svg class="mark" viewBox="0 0 16 16" width="44" height="44" aria-hidden="true" focusable="false" shape-rendering="crispEdges">
  <rect width="16" height="16" fill="#f2eee2"/>
  <rect x="2" y="1" width="12" height="14" fill="#191820"/>
  <rect x="3" y="2" width="10" height="12" fill="#fffdf6"/>
  <rect x="6" y="4" width="6" height="1" fill="#191820"/>
  <rect x="6" y="6" width="6" height="1" fill="#191820"/>
  <rect x="7" y="11" width="1" height="1" fill="#3ddc97"/>
  <rect x="8" y="12" width="1" height="1" fill="#3ddc97"/>
  <rect x="9" y="11" width="1" height="1" fill="#3ddc97"/>
  <rect x="10" y="10" width="1" height="1" fill="#3ddc97"/>
</svg>`;

const CAT = {
  work: { label: '工作', color: '#4d9de0' },
  life: { label: '生活', color: '#3ddc97' },
  study: { label: '学习', color: '#ffd23f' },
  other: { label: '其他', color: '#a06cd5' },
};

const PROJECT_COLORS = [
  { id: 'blue', label: '蓝', color: '#4d9de0' },
  { id: 'green', label: '绿', color: '#3ddc97' },
  { id: 'yellow', label: '黄', color: '#ffd23f' },
  { id: 'purple', label: '紫', color: '#a06cd5' },
  { id: 'orange', label: '橙', color: '#ff9f43' },
];

function projectColor(project) {
  if (!project) return '#6d6857';
  const found = PROJECT_COLORS.find((item) => item.id === project.color);
  return found ? found.color : PROJECT_COLORS[0].color;
}

const FILTERS = [
  ['all', '全部'],
  ['undone', '未完成'],
  ['done', '已完成'],
  ['today', '今天'],
];

const THEME_KEY = 'pixel-notes-theme';
const THEMES = [
  ['auto', '跟随系统'],
  ['light', '浅色'],
  ['dark', '深色'],
];
const THEME_LABEL = Object.fromEntries(THEMES);

const REMIND_OPTIONS = [
  ['none', '不提醒'],
  ['0', '准时'],
  ['5', '提前 5 分钟'],
  ['10', '提前 10 分钟'],
  ['30', '提前 30 分钟'],
  ['60', '提前 1 小时'],
  ['120', '提前 2 小时'],
];

const state = {
  tasks: [],
  notes: [],
  files: [],
  projects: [],
  folders: [],
  route: { name: 'tasks' },
  viewMonth: new Date(),
  selectedDay: startOfDay(Date.now()),
  filter: 'all',
  query: { tasks: '', notes: '' },
  projectFilter: 'all',
  projectsSorting: false,
  editingNoteId: null,
  theme: 'auto',
  urls: [],
  hintDismissed: false,
};

let modalStack = [];
let noteSaveTimer = null;
let dictation = null;
let projectDrag = null;

const $ = (sel, root = document) => root.querySelector(sel);

/* ==========================================================================
   启动
   ========================================================================== */

/* ==========================================================================
   主题
   ========================================================================== */

function initTheme() {
  let mode = 'auto';
  try {
    mode = localStorage.getItem(THEME_KEY) || 'auto';
  } catch (err) {
    /* 无痕模式可能锁住 localStorage */
  }
  if (!THEME_LABEL[mode]) mode = 'auto';
  applyTheme(mode, { silent: true });

  const query = window.matchMedia('(prefers-color-scheme: dark)');
  if (query && query.addEventListener) {
    query.addEventListener('change', () => {
      if (state.theme === 'auto') applyTheme('auto', { silent: true });
    });
  }
}

function resolveTheme(mode) {
  if (mode === 'dark' || mode === 'light') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode, options = {}) {
  state.theme = THEME_LABEL[mode] ? mode : 'auto';
  const resolved = resolveTheme(state.theme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = state.theme;
  try {
    localStorage.setItem(THEME_KEY, state.theme);
  } catch (err) {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#14121a' : '#f2eee2');
  updateThemeButton();
  if (!options.silent) render({ scroll: false });
}

function updateThemeButton() {
  const button = document.getElementById('btn-theme');
  if (!button) return;
  const icons = { auto: '◐', light: '☀', dark: '☾' };
  button.textContent = icons[state.theme] || '◐';
  const label = tl('主题：{name}（点击切换）', { name: tl(THEME_LABEL[state.theme]) });
  button.setAttribute('aria-label', label);
  button.title = label;
}

function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  const index = order.indexOf(state.theme);
  const next = order[(index + 1) % order.length];
  applyTheme(next);
  toast(`主题：${THEME_LABEL[next]}`);
}

function setTheme(mode) {
  if (!THEME_LABEL[mode]) return;
  applyTheme(mode);
  toast(`主题：${THEME_LABEL[mode]}`);
}

/* ==========================================================================
   启动
   ========================================================================== */

function applyStaticI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = el.dataset.i18n;
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = el.dataset.i18nTitle;
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', el.dataset.i18nAria);
  });
}

function applyLangMeta() {
  document.documentElement.lang = isZh() ? 'zh-Hant' : 'en';
  document.title = isZh()
    ? 'Pixel Notes · 筆記、待辦與日曆'
    : 'Pixel Notes · Notes, Tasks & Calendar';
}

async function boot() {
  initLang();
  applyLangMeta();
  initTheme();
  try {
    await db.init();
    await seedIfNeeded();
    await loadData();
    state.hintDismissed = Boolean(await db.metaGet('installHintDismissed'));
    state.viewMonth = new Date(state.selectedDay.getFullYear(), state.selectedDay.getMonth(), 1);
  } catch (err) {
    console.error(err);
    const view = document.getElementById('view');
    if (view) {
      view.innerHTML = `<section class="page"><div class="empty">
        ${MARK_SVG}
        <h2>无法启动</h2>
        <p>浏览器无法使用 IndexedDB。请用 Safari 打开，并确认没有开启无痕模式。</p>
        <p class="hint">${esc(err && err.message ? err.message : String(err))}</p>
        <button class="btn" type="button" data-act="retry-boot">重新载入</button>
      </div></section>`;
    }
    return;
  }

  bindEvents();
  await render();
  document.documentElement.dataset.appReady = '1';
  registerSW();
}

async function loadData() {
  const [tasks, notes, files, projects, folders] = await Promise.all([
    db.tasksAll(),
    db.notesAll(),
    db.filesAll(),
    db.projectsAll(),
    db.foldersAll(),
  ]);
  state.tasks = tasks || [];
  state.notes = notes || [];
  state.files = files || [];
  state.projects = (projects || []).sort(
    (a, b) => (a.sort ?? a.createdAt ?? 0) - (b.sort ?? b.createdAt ?? 0)
  );
  state.folders = (folders || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

/** 第一次打开时放几个示例，方便马上看到效果 */
async function seedIfNeeded() {
  if (await db.metaGet('seeded')) return;

  const T = (enText, zhText) => (isZh() ? zhText : enText);
  const today = startOfDay(Date.now());
  const at = (dayOffset, hour, minute) => {
    const d = addDays(today, dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
  };
  const now = Date.now();

  const p1 = { id: uid(), name: T('Work', '工作'), color: 'blue', sort: 0, createdAt: now, updatedAt: now };
  const p2 = { id: uid(), name: T('Home', '生活'), color: 'green', sort: 10, createdAt: now, updatedAt: now };
  const p3 = { id: uid(), name: T('Study', '學習'), color: 'yellow', sort: 20, createdAt: now, updatedAt: now };

  const f1 = { id: uid(), name: T('Ideas', '靈感'), createdAt: now, updatedAt: now };
  const f2 = { id: uid(), name: T('Work notes', '工作筆記'), createdAt: now, updatedAt: now };

  const t1 = {
    id: uid(), title: T('Welcome: open this task', '歡迎使用：點開這個任務'),
    startAt: at(0, 9, 0), endAt: at(0, 10, 0),
    cat: 'work', projectId: p1.id, done: 0, remind: 10, createdAt: now, updatedAt: now,
  };
  const t2 = {
    id: uid(), title: T('Tidy this week’s tasks', '整理這週的待辦'),
    startAt: at(0, 14, 0), endAt: at(0, 15, 30),
    cat: 'life', projectId: p2.id, done: 0, remind: 10, createdAt: now, updatedAt: now,
  };
  const t3 = {
    id: uid(), title: T('Weekend shopping list', '週末採購清單'),
    startAt: at(1, 11, 0), endAt: at(1, 12, 0),
    cat: 'other', projectId: p2.id, done: 0, remind: 10, createdAt: now, updatedAt: now,
  };
  const t4 = {
    id: uid(), title: T('Read for 30 minutes', '讀 30 分鐘書'),
    startAt: at(1, 20, 0), endAt: at(1, 20, 30),
    cat: 'study', projectId: p3.id, done: 0, remind: 10, createdAt: now, updatedAt: now,
  };
  const n1 = {
    id: uid(), taskId: t1.id, folderId: null, title: T('Note inside this task', '這個任務裡的筆記'),
    body: T(
      'Every task can have its own notes and attachments.\n\nTap “+ Task note” to add another note, or “+ Attachments” to attach files.\nEverything stays on this device — remember to export a backup now and then.',
      '每個任務都能有自己的筆記和附件。\n\n點「＋ 任務筆記」再寫一則；點「＋ 附件」把照片或檔案放進來。\n資料只存在這台裝置，記得偶爾到設定裡匯出備份。'
    ),
    pinned: 0, createdAt: now, updatedAt: now,
  };
  const n2 = {
    id: uid(), taskId: null, folderId: f1.id, title: T('Quick ideas', '靈感速記'),
    body: T(
      'Standalone notes live here:\n- Books to read\n- Things to buy\n- A sentence to remember',
      '獨立備忘錄放在這裡：\n- 想看的書\n- 想買的東西\n- 隨手記下的一句話'
    ),
    pinned: 1, createdAt: now, updatedAt: now,
  };
  const n3 = {
    id: uid(), taskId: null, folderId: f2.id, title: T('Weekly review', '本週復盤'),
    body: T(
      '# Weekly review\n\nWrite down three things that went well, then two to improve.\n\n| Item | Status | Notes |\n| --- | --- | --- |\n| Project A | In progress | Check next Wednesday |\n| Project B | Done | Archive it |',
      '# 本週復盤\n\n先寫下三件做得好的事，再寫兩件想改進的事。\n\n| 項目 | 狀況 | 備註 |\n| --- | --- | --- |\n| 專案 A | 進行中 | 下週三檢查 |\n| 專案 B | 已完成 | 待歸檔 |'
    ),
    pinned: 0, createdAt: now, updatedAt: now,
  };

  for (const project of [p1, p2, p3]) await db.projectPut(project);
  for (const folder of [f1, f2]) await db.folderPut(folder);
  for (const task of [t1, t2, t3, t4]) await db.taskPut(task);
  for (const note of [n1, n2, n3]) await db.notePut(note);
  await db.metaSet('seeded', true);
}

/* ==========================================================================
   路由与渲染
   ========================================================================== */

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const name = parts[0] || 'tasks';
  if (name === 'tasks' || name === 'all' || name === 'calendar' || name === 'notes' || name === 'allnotes') {
    return { name };
  }
  if (name === 'new') return { name: 'new', params: new URLSearchParams(queryPart) };
  if (name === 'project' && parts[1]) {
    return { name: 'project', id: parts[1] === 'inbox' ? null : decodeURIComponent(parts[1]) };
  }
  if (name === 'folder' && parts[1]) {
    return { name: 'folder', id: parts[1] === 'inbox' ? null : decodeURIComponent(parts[1]) };
  }
  if ((name === 'task' || name === 'note') && parts[1]) {
    return { name, id: decodeURIComponent(parts[1]) };
  }
  return { name: 'tasks' };
}

/** 从捷径的 #/new?title=... 参数组出可预填的任务资料 */
function presetFromParams(params) {
  const preset = {};
  if (!params) return preset;
  const title = params.get('title');
  if (title) preset.title = title.slice(0, 200);
  const date = params.get('date');
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) preset.dateStr = date;
  const start = params.get('start');
  if (start && /^\d{1,2}:\d{2}$/.test(start)) preset.startTime = start;
  const end = params.get('end');
  if (end && /^\d{1,2}:\d{2}$/.test(end)) preset.endTime = end;
  const cat = params.get('cat');
  if (cat && CAT[cat]) preset.cat = cat;
  const remind = params.get('remind');
  if (remind === 'none') preset.remind = null;
  else if (remind && /^\d+$/.test(remind)) preset.remind = Number(remind);
  const project = params.get('project');
  if (project) {
    const matched = state.projects.find((p) => p.id === project || p.name === project);
    if (matched) preset.projectId = matched.id;
  }
  return preset;
}

function routeSection(route) {
  if (['tasks', 'all', 'project', 'task'].includes(route.name)) return 'tasks';
  if (['notes', 'allnotes', 'folder', 'note'].includes(route.name)) return 'notes';
  if (route.name === 'calendar') return 'calendar';
  return route.name;
}

function updateTabs(route) {
  const map = {
    tasks: 'tasks',
    all: 'tasks',
    project: 'tasks',
    task: 'tasks',
    calendar: 'calendar',
    notes: 'notes',
    allnotes: 'notes',
    folder: 'notes',
    note: 'notes',
  };
  const active = map[route.name] || 'tasks';
  document.querySelectorAll('#tabs a').forEach((a) => {
    if (a.dataset.tab === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function revokeUrls() {
  for (const url of state.urls) {
    try {
      URL.revokeObjectURL(url);
    } catch (err) {
      /* ignore */
    }
  }
  state.urls = [];
}

async function render(opts = {}) {
  const route = parseRoute();
  updateThemeButton();

  // 离开编辑中的笔记前，先把内容写回去
  if (state.editingNoteId) {
    if (document.getElementById('note-title')) await saveNoteNow();
    if (!(route.name === 'note' && route.id === state.editingNoteId)) state.editingNoteId = null;
  }
  if (route.name !== 'note') {
    state.editingNoteId = null;
  }
  if (dictation && route.name !== 'note') {
    try {
      dictation.stop();
    } catch (err) {
      /* ignore */
    }
    dictation = null;
  }

  const viewRoute = route.name === 'new' ? { name: 'tasks' } : route;
  const previousSection = state.route ? routeSection(state.route) : null;
  if (previousSection && previousSection !== routeSection(viewRoute)) {
    state.query.tasks = '';
    state.query.notes = '';
    state.filter = 'all';
  }
  state.route = viewRoute;
  updateTabs(viewRoute);
  revokeUrls();

  let html = '';
  try {
    if (viewRoute.name === 'tasks') html = renderTaskHome();
    else if (viewRoute.name === 'all') html = renderAllTasks();
    else if (viewRoute.name === 'project') html = renderProjectPage(viewRoute.id);
    else if (viewRoute.name === 'calendar') html = renderCalendar();
    else if (viewRoute.name === 'notes') html = renderNotesHome();
    else if (viewRoute.name === 'allnotes') html = renderAllNotes();
    else if (viewRoute.name === 'folder') html = renderFolderPage(viewRoute.id);
    else if (viewRoute.name === 'task') html = await renderTaskDetail(viewRoute.id);
    else if (viewRoute.name === 'note') html = renderNoteEditor(viewRoute.id);
  } catch (err) {
    console.error(err);
    html = `<section class="page"><div class="empty"><h2>载入失败</h2><p>${esc(err.message || String(err))}</p></div></section>`;
  }

  const view = document.getElementById('view');
  view.innerHTML = html;

  const fab = document.getElementById('fab');
  if (fab) {
    const actions = {
      tasks: ['new-project', '新增专案'],
      all: ['new-task', '新增任务'],
      project: ['new-task', '新增任务'],
      calendar: ['new-task-day', '新增任务'],
      notes: ['new-folder', '新增资料夹'],
      allnotes: ['new-note', '新增备忘录'],
      folder: ['new-note', '新增备忘录'],
    };
    const entry = actions[viewRoute.name];
    fab.hidden = !entry;
    if (entry) {
      fab.dataset.act = entry[0];
      fab.setAttribute('aria-label', tl(entry[1]));
    }
  }

  postRender(viewRoute);

  applyStaticI18n();
  translateDom(document.body);

  if (route.name === 'new') {
    const preset = presetFromParams(route.params);
    openTaskModal(null, preset);
    history.replaceState(null, '', `${location.pathname}${location.search}#/tasks`);
  }

  if (opts.scroll !== false) {
    try {
      window.scrollTo(0, 0);
    } catch (err) {
      /* ignore */
    }
  }
}

function postRender(route) {
  if (route.name === 'note') {
    const note = state.notes.find((n) => n.id === route.id);
    if (!note) return;
    state.editingNoteId = note.id;
    updateEditorFoot(note);
    setSaveState('已储存');
    if (!note.title && !note.body) {
      const editor = document.getElementById('note-body');
      if (editor) setTimeout(() => editor.focus({ preventScroll: true }), 90);
    }
  }
}

/* ---------- 共用片段 ---------- */

function emptyState(title, text) {
  return `<div class="empty">
    ${MARK_SVG}
    <h2>${esc(title)}</h2>
    <p>${esc(text)}</p>
  </div>`;
}

function notFoundPage(message, href) {
  return `<section class="page"><div class="empty">
    ${MARK_SVG}
    <h2>${esc(message)}</h2>
    <a class="btn" href="${esc(href)}">返回</a>
  </div></section>`;
}

function catOf(cat) {
  return CAT[cat] || CAT.other;
}

function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

/* ==========================================================================
   待办清单
   ========================================================================== */

function projectById(id) {
  return id ? state.projects.find((p) => p.id === id) : null;
}

function tasksForProject(projectId) {
  return state.tasks.filter((t) => (projectId ? t.projectId === projectId : !t.projectId));
}

function taskSummary(list) {
  return tl('{n} 项 · {m} 项未完成', {
    n: list.length,
    m: list.filter((t) => !t.done).length,
  });
}

function filterTasksByProject(list) {
  if (state.projectFilter === 'all') return list;
  if (state.projectFilter === 'none') return list.filter((t) => !t.projectId);
  return list.filter((t) => t.projectId === state.projectFilter);
}

function renderTaskHome() {
  const tasks = state.tasks;
  const inbox = tasks.filter((t) => !t.projectId);
  const overdue = tasks.filter((t) => isOverdue(t));
  const active = state.projects.filter((project) => !project.archived);
  const archived = state.projects.filter((project) => project.archived);
  const cards = active.map((project) => projectCardHTML(project)).join('');
  const inboxCard = inbox.length
    ? projectCardHTML({ id: null, name: '未分类', color: null })
    : '';
  const archivedCards = archived.map((project) => projectCardHTML(project)).join('');

  return `<section class="page">
    <div class="page-head">
      <div>
        <h1>待办</h1>
        <p class="sub">${esc(taskSummary(tasks))}</p>
      </div>
      <div class="head-actions">
        ${state.projects.length
          ? `<button class="btn" type="button" data-act="toggle-project-sort">${state.projectsSorting ? '完成' : '排序'}</button>`
          : ''}
        <button class="btn" type="button" data-act="go-all">全部任务</button>
        <button class="btn btn-primary" type="button" data-act="new-project">＋ 新专案</button>
      </div>
    </div>
    ${installHintHTML()}
    ${state.projectsSorting
      ? '<p class="hint sort-hint">按住卡片拖动排序，或用卡片上的 ↑ ↓ 调整；排好后按「完成」。</p>'
      : ''}
    ${overdue.length
      ? `<div class="overdue-banner"><span>${tl('有 {n} 个逾期任务', { n: overdue.length })}</span><button class="btn tiny btn-danger" type="button" data-act="go-all">去处理</button></div>`
      : ''}
    ${cards || inboxCard
      ? `<div class="project-grid sort-grid">${cards}${inboxCard}</div>`
      : emptyState('还没有专案', '按「＋ 新专案」建立第一个专案，再把任务放进去。')}
    ${archivedCards
      ? `<div class="group archived-group">
        <div class="group-head"><span>已封存</span><span class="line"></span><span class="count">${archived.length}</span></div>
        <div class="project-grid archived-grid">${archivedCards}</div>
      </div>`
      : ''}
  </section>`;
}

function projectCardHTML(project) {
  const list = tasksForProject(project.id);
  const undone = list.filter((t) => !t.done).length;
  const next = list.filter((t) => !t.done).sort((a, b) => a.startAt - b.startAt)[0];
  const nextText = next ? `${relDayLabel(next.startAt)} ${fmtTime(next.startAt)} · ${next.title}` : '没有待办任务';
  const color = projectColor(project);
  const canSort = state.projectsSorting && project.id;
  const sortControls = canSort
    ? `<div class="pc-sort">
        <button class="pc-sort-btn" type="button" data-act="move-project" data-id="${project.id}" data-dir="-1" aria-label="上移">↑</button>
        <button class="pc-sort-btn" type="button" data-act="move-project" data-id="${project.id}" data-dir="1" aria-label="下移">↓</button>
      </div>`
    : '';
  return `<div class="project-card ${project.archived ? 'archived' : ''} ${state.projectsSorting ? 'sorting' : ''}" ${project.id ? `data-project-id="${project.id}"` : ''} data-act="open-project" data-id="${project.id || ''}" role="link" tabindex="0" style="--c:${color}">
    <a class="pc-link" href="#/project/${project.id || 'inbox'}" ${state.projectsSorting ? 'tabindex="-1"' : ''}>
      <div class="pc-head"><span class="pc-name" data-raw>${esc(project.name)}</span><span class="pc-count">${undone}/${list.length}</span></div>
      <div class="pc-next" data-raw>${esc(nextText)}</div>
    </a>
    ${sortControls}
  </div>`;
}

function renderAllTasks() {
  const filtered = filterTasksByProject(state.tasks);
  const projectChips = [
    ['all', '全部专案'],
    ...state.projects.map((project) => [project.id, project.name]),
    ['none', '未分类'],
  ]
    .map(
      ([value, label]) =>
        `<button class="chip ${state.projectFilter === value ? 'on' : ''}" type="button" data-act="project-filter" data-project="${value}">${esc(label)}</button>`
    )
    .join('');

  return `<section class="page">
    <div class="page-head">
      <div>
        <h1>全部任务</h1>
        <p class="sub" id="task-sub">${esc(taskSummary(filtered))}</p>
      </div>
      <div class="head-actions">
        <button class="btn" type="button" data-act="go-tasks">‹ 专案</button>
        <button class="btn btn-primary" type="button" data-act="new-task">＋ 新任务</button>
      </div>
    </div>
    <div class="toolbar">
      <div class="search-wrap">
        <span class="search-ico" aria-hidden="true">⌕</span>
        <input id="task-search" class="input" type="search" placeholder="搜索任务或笔记…" value="${esc(state.query.tasks)}" autocomplete="off">
      </div>
      <div class="chips">
        ${FILTERS.map(([key, label]) => `<button class="chip ${state.filter === key ? 'on' : ''}" type="button" data-act="filter" data-filter="${key}">${label}</button>`).join('')}
      </div>
      <div class="chips project-filter">${projectChips}</div>
    </div>
    <div id="task-list">${taskListHTML(filtered, { showProject: true })}</div>
  </section>`;
}

function renderProjectPage(id) {
  const project = id ? projectById(id) : null;
  if (id && !project) return notFoundPage('专案不存在或已被删除', '#/tasks');
  const name = project ? project.name : '未分类';
  const list = tasksForProject(id);
  const color = project ? projectColor(project) : '#6d6857';

  return `<section class="page">
    <div class="detail-top">
      <button class="btn tiny" type="button" data-act="go-tasks">‹ 专案</button>
      <span class="badge" style="border-color:${color}" data-raw>${esc(name)}</span>
      ${project && project.archived ? '<span class="badge">已封存</span>' : ''}
    </div>
    <div class="page-head">
      <div>
        <h1 data-raw>${esc(name)}</h1>
        <p class="sub" id="task-sub">${esc(taskSummary(list))}</p>
      </div>
      <div class="head-actions">
        ${project ? `<button class="btn" type="button" data-act="edit-project" data-id="${project.id}">编辑</button>` : ''}
        ${project ? `<button class="btn" type="button" data-act="toggle-archive" data-id="${project.id}">${project.archived ? '取消封存' : '封存'}</button>` : ''}
        ${project ? `<button class="btn btn-danger" type="button" data-act="delete-project" data-id="${project.id}">删除</button>` : ''}
        <button class="btn btn-primary" type="button" data-act="new-task">＋ 新任务</button>
      </div>
    </div>
    ${project ? '' : '<p class="hint">未分类收纳还没有放进专案的任务；在任务编辑里可以移动。</p>'}
    <div id="task-list">${taskListHTML(list, { showProject: false, applyQuery: false })}</div>
  </section>`;
}

function installHintHTML() {
  if (!isIOS() || isStandalone() || state.hintDismissed) return '';
  return `<div class="install-hint">
    <div>
      <strong>加到主画面</strong>
      <span>在 Safari 点「分享」→「加到主画面」，就能全屏使用、离线也开得起来。</span>
    </div>
    <button class="btn tiny" type="button" data-act="dismiss-hint">知道了</button>
  </div>`;
}

function buildCountMaps() {
  const noteCount = {};
  const fileCount = {};
  const noteText = {};
  for (const n of state.notes) {
    if (!n.taskId) continue;
    noteCount[n.taskId] = (noteCount[n.taskId] || 0) + 1;
    noteText[n.taskId] = `${noteText[n.taskId] || ''} ${n.title || ''} ${n.body || ''}`;
  }
  for (const f of state.files) {
    if (!f.taskId) continue;
    fileCount[f.taskId] = (fileCount[f.taskId] || 0) + 1;
  }
  return { noteCount, fileCount, noteText };
}

function taskListHTML(list, opts = {}) {
  const { showProject = false, applyQuery = true } = opts;
  const query = applyQuery ? state.query.tasks.trim().toLowerCase() : '';
  const { noteCount, fileCount, noteText } = buildCountMaps();
  const todayKey = dayKey(Date.now());
  const now = Date.now();

  const projectMap = {};
  for (const project of state.projects) projectMap[project.id] = project;

  const filtered = list.filter((t) => {
    if (applyQuery) {
      if (state.filter === 'undone' && t.done) return false;
      if (state.filter === 'done' && !t.done) return false;
      if (state.filter === 'today' && dayKey(t.startAt) !== todayKey) return false;
      if (query) {
        const haystack = `${t.title} ${noteText[t.id] || ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
    }
    return true;
  });

  const overdueList = filtered
    .filter((t) => isOverdue(t, now))
    .sort((a, b) => a.startAt - b.startAt);
  const undone = filtered
    .filter((t) => !t.done && !isOverdue(t, now))
    .sort((a, b) => a.startAt - b.startAt);
  const done = filtered.filter((t) => t.done).sort((a, b) => b.startAt - a.startAt);

  const rowOpts = { showProject, projectMap };
  let html = '';
  if (state.filter !== 'done' || !applyQuery) {
    if (overdueList.length) {
      html += `<div class="group overdue-group">
        <div class="group-head">
          <span>逾期</span><span class="line"></span><span class="count">${overdueList.length}</span>
          <button class="btn tiny btn-danger" type="button" data-act="clear-overdue">全部删除</button>
        </div>
        ${overdueList
          .map((t) => taskRowHTML(t, noteCount, fileCount, { ...rowOpts, quickDelete: true }))
          .join('')}
      </div>`;
    }

    if (undone.length) {
      const groups = new Map();
      for (const t of undone) {
        const key = dayKey(t.startAt);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(t);
      }
      for (const [, rows] of groups) {
        html += `<div class="group">
          <div class="group-head"><span>${esc(relDayLabel(rows[0].startAt))}</span><span class="line"></span><span class="count">${rows.length}</span></div>
          ${rows.map((t) => taskRowHTML(t, noteCount, fileCount, rowOpts)).join('')}
        </div>`;
      }
    } else if (!overdueList.length) {
      html += list.length
        ? emptyState('没有符合的任务', '换个筛选条件或搜索字试试。')
        : emptyState('这个专案还没有任务', '按「＋ 新任务」新增第一个任务。');
    }

    if (done.length) {
      html += `<div class="group">
        <div class="group-head"><span>已完成</span><span class="line"></span><span class="count">${done.length}</span></div>
        ${done.map((t) => taskRowHTML(t, noteCount, fileCount, rowOpts)).join('')}
      </div>`;
    }
  } else {
    html += done.length
      ? done.map((t) => taskRowHTML(t, noteCount, fileCount, rowOpts)).join('')
      : emptyState('还没有已完成的任务', '完成任务后会自动收在这里。');
  }

  return html;
}

function taskRowHTML(task, noteCount, fileCount, opts = {}) {
  const c = catOf(task.cat);
  const project = opts.projectMap && task.projectId ? opts.projectMap[task.projectId] : null;
  const accent = project ? projectColor(project) : c.color;
  const overdue = isOverdue(task);
  const projectChip = opts.showProject
    ? `<span class="badge proj-badge" data-raw>${esc(project ? project.name : '未分类')}</span>`
    : '';
  const trailing = opts.quickDelete
    ? `<button class="row-del" type="button" data-act="delete-task-quick" data-id="${task.id}" aria-label="删除任务" title="删除任务">×</button>`
    : '<span class="chev" aria-hidden="true">›</span>';
  return `<div class="task-row ${task.done ? 'done' : ''}" style="--c:${accent}" data-act="open-task" data-id="${task.id}" role="button" tabindex="0">
    <button class="check ${task.done ? 'on' : ''}" type="button" data-act="toggle-task" data-id="${task.id}" aria-label="${task.done ? '标记为未完成' : '标记为完成'}">✓</button>
    <div class="t-body">
      <div class="t-title" data-raw>${esc(task.title)}</div>
      <div class="t-meta">
        <span class="dot" style="--c:${c.color}"></span>
        <span class="mono">${esc(fmtRange(task.startAt, task.endAt))}</span>
        ${opts.showProject ? projectChip : `<span class="dim">${esc(c.label)}</span>`}
        ${overdue ? '<span class="badge warn">逾期</span>' : ''}
        ${fileCount[task.id] ? `<span class="badge">${tl('附件 {n}', { n: fileCount[task.id] })}</span>` : ''}
        ${noteCount[task.id] ? `<span class="badge">${tl('笔记 {n}', { n: noteCount[task.id] })}</span>` : ''}
      </div>
    </div>
    ${trailing}
  </div>`;
}

function updateTaskList() {
  const list = document.getElementById('task-list');
  if (!list) return;
  const route = state.route;
  let tasks = state.tasks;
  let options = { showProject: true };
  if (route.name === 'project') {
    tasks = tasksForProject(route.id);
    options = { showProject: false, applyQuery: false };
  } else if (route.name !== 'all') {
    return;
  } else {
    tasks = filterTasksByProject(state.tasks);
  }
  list.innerHTML = taskListHTML(tasks, options);
  const sub = document.getElementById('task-sub');
  if (sub) sub.textContent = taskSummary(tasks);
}

/* ==========================================================================
   日历
   ========================================================================== */

function renderCalendar() {
  const viewYear = state.viewMonth.getFullYear();
  const viewMonth = state.viewMonth.getMonth();
  const cells = monthGrid(viewYear, viewMonth);
  const todayKey = dayKey(Date.now());
  const selectedKey = dayKey(state.selectedDay);

  const byDay = new Map();
  for (const t of state.tasks) {
    const key = dayKey(t.startAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(t);
  }

  const weekHead = weekHeader()
    .map((w) => `<div class="cal-w">${w}</div>`)
    .join('');

  const grid = cells
    .map((cell) => {
      const key = dayKey(cell.ts);
      const rows = byDay.get(key) || [];
      const dots = rows.slice(0, 3)
        .map((t) => `<i style="--c:${catOf(t.cat).color}"></i>`)
        .join('');
      const more = rows.length > 3 ? `<span class="more">+${rows.length - 3}</span>` : '';
      return `<button class="cal-cell ${cell.inMonth ? '' : 'out'} ${key === todayKey ? 'today' : ''} ${key === selectedKey ? 'sel' : ''}" type="button" data-act="select-day" data-day="${key}" aria-label="${esc(fmtDateCN(cell.ts))}">
        <span class="dnum">${cell.day}</span>
        <span class="dots">${dots}</span>${more}
      </button>`;
    })
    .join('');

  const dayTasks = (byDay.get(selectedKey) || []).slice().sort((a, b) => a.startAt - b.startAt);
  const agenda = dayTasks.length
    ? dayTasks.map((t) => agendaRowHTML(t)).join('')
    : `<p class="empty-inline">这天还没有任务。按右上角「＋ 这天」加一个。</p>`;

  return `<section class="page">
    <div class="page-head">
      <div>
        <h1>日历</h1>
        <p class="sub">${esc(fmtDateCN(state.selectedDay))} · ${tl('{n} 项', { n: dayTasks.length })}</p>
      </div>
      <div class="head-actions">
        <button class="btn" type="button" data-act="export-day-ics">导出这天</button>
        <button class="btn btn-primary" type="button" data-act="new-task-day">＋ 这天</button>
      </div>
    </div>
    <div class="cal-bar">
      <button class="btn tiny" type="button" data-act="cal-prev" aria-label="上个月">‹</button>
      <div class="cal-title">${esc(monthLabel(viewYear, viewMonth))}</div>
      <button class="btn tiny" type="button" data-act="cal-next" aria-label="下个月">›</button>
      <button class="btn tiny" type="button" data-act="cal-today">今天</button>
    </div>
    <div class="cal">
      <div class="cal-head">${weekHead}</div>
      <div class="cal-grid">${grid}</div>
    </div>
    <div class="group">
      <div class="group-head"><span>${esc(relDayLabel(state.selectedDay))}</span><span class="line"></span><span class="count">${dayTasks.length}</span></div>
      ${agenda}
    </div>
  </section>`;
}

function agendaRowHTML(task) {
  return `<button class="agenda-row ${task.done ? 'done' : ''}" type="button" data-act="open-task" data-id="${task.id}">
    <span class="agenda-time">${esc(fmtTime(task.startAt))}</span>
    <span class="dot" style="--c:${catOf(task.cat).color}"></span>
    <span class="agenda-title" data-raw>${esc(task.title)}</span>
    <span class="chev" aria-hidden="true">›</span>
  </button>`;
}

function selectDay(key) {
  if (!key) return;
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return;
  state.selectedDay = new Date(year, month - 1, day);
  state.viewMonth = new Date(year, month - 1, 1);
  render({ scroll: false });
}

function goMonth(delta) {
  const base = new Date(state.viewMonth.getFullYear(), state.viewMonth.getMonth() + delta, 1);
  state.viewMonth = base;
  const selected = new Date(state.selectedDay);
  if (selected.getFullYear() !== base.getFullYear() || selected.getMonth() !== base.getMonth()) {
    state.selectedDay = new Date(base.getFullYear(), base.getMonth(), 1);
  }
  render({ scroll: false });
}

/* ==========================================================================
   备忘录
   ========================================================================== */

function standaloneNotes() {
  return state.notes.filter((n) => !n.taskId);
}

function folderById(id) {
  return id ? state.folders.find((folder) => folder.id === id) : null;
}

function notesInFolder(folderId) {
  return standaloneNotes().filter((note) => (folderId ? note.folderId === folderId : !note.folderId));
}

function renderNotesHome() {
  const notes = standaloneNotes();
  const cards = state.folders
    .map((folder, index) => folderCardHTML(folder, index))
    .join('');
  const inbox = notesInFolder(null);
  const inboxCard = inbox.length ? folderCardHTML({ id: null, name: '未分类' }, state.folders.length) : '';

  return `<section class="page">
    <div class="page-head">
      <div>
        <h1>备忘</h1>
        <p class="sub">${tl('{n} 则 · {m} 个资料夹', { n: notes.length, m: state.folders.length })}</p>
      </div>
      <div class="head-actions">
        <button class="btn" type="button" data-act="go-allnotes">全部笔记</button>
        <button class="btn btn-primary" type="button" data-act="new-note">＋ 新备忘</button>
        <button class="btn" type="button" data-act="new-folder">＋ 新资料夹</button>
      </div>
    </div>
    ${cards || inboxCard
      ? `<div class="project-grid">${cards}${inboxCard}</div>`
      : emptyState('还没有备忘录', '按「＋ 新资料夹」建立分类，或按「＋ 新备忘」直接写。')}
  </section>`;
}

function folderCardHTML(folder, index) {
  const list = notesInFolder(folder.id);
  const updated = list.reduce((max, note) => Math.max(max, note.updatedAt || 0), 0);
  const color = folder.id
    ? PROJECT_COLORS[index % PROJECT_COLORS.length].color
    : '#6d6857';
  return `<a class="project-card folder-card" href="#/folder/${folder.id || 'inbox'}" style="--c:${color}">
    <div class="pc-head"><span class="pc-name" data-raw>${esc(folder.name)}</span><span class="pc-count">${list.length}</span></div>
    <div class="pc-next">${updated ? esc(fmtUpdated(updated)) : '还没有笔记'}</div>
  </a>`;
}

function renderAllNotes() {
  const notes = standaloneNotes();
  return `<section class="page">
    <div class="page-head">
      <div>
        <h1>全部笔记</h1>
        <p class="sub" id="note-sub">${tl('{n} 则', { n: notes.length })}</p>
      </div>
      <div class="head-actions">
        <button class="btn" type="button" data-act="go-notes">‹ 资料夹</button>
        <button class="btn btn-primary" type="button" data-act="new-note">＋ 新备忘</button>
      </div>
    </div>
    <div class="toolbar">
      <div class="search-wrap">
        <span class="search-ico" aria-hidden="true">⌕</span>
        <input id="note-search" class="input" type="search" placeholder="搜索所有笔记…" value="${esc(state.query.notes)}" autocomplete="off">
      </div>
    </div>
    <div id="note-list">${noteListHTML(notes, { showFolder: true, applyQuery: true })}</div>
  </section>`;
}

function renderFolderPage(id) {
  const folder = id ? folderById(id) : null;
  if (id && !folder) return notFoundPage('资料夹不存在或已被删除', '#/notes');
  const name = folder ? folder.name : '未分类';
  const list = notesInFolder(id);

  return `<section class="page">
    <div class="detail-top">
      <button class="btn tiny" type="button" data-act="go-notes">‹ 资料夹</button>
      <span class="badge">${esc(name)}</span>
      ${folder ? `<button class="btn tiny" type="button" data-act="edit-folder" data-id="${folder.id}">编辑</button>` : ''}
      ${folder ? `<button class="btn tiny btn-danger" type="button" data-act="delete-folder" data-id="${folder.id}">删除</button>` : ''}
      <span class="spacer"></span>
      <button class="btn tiny btn-primary" type="button" data-act="new-note">＋ 新备忘</button>
    </div>
    <div class="page-head">
      <div>
        <h1 data-raw>${esc(name)}</h1>
        <p class="sub" id="note-sub">${tl('{n} 则', { n: list.length })}</p>
      </div>
    </div>
    <div id="note-list">${noteListHTML(list, { showFolder: false, applyQuery: false })}</div>
  </section>`;
}

function noteListHTML(list, opts = {}) {
  const { showFolder = false, applyQuery = true } = opts;
  const query = applyQuery ? state.query.notes.trim().toLowerCase() : '';
  const folderMap = {};
  for (const folder of state.folders) folderMap[folder.id] = folder;

  const rows = list
    .filter((note) => {
      if (!query) return true;
      return `${note.title || ''} ${note.body || ''}`.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      if (Boolean(b.pinned) !== Boolean(a.pinned)) return b.pinned - a.pinned;
      return b.updatedAt - a.updatedAt;
    });

  if (!rows.length) {
    return list.length
      ? emptyState('没有符合的笔记', '换个搜索字试试。')
      : emptyState('这个资料夹还没有笔记', '按「＋ 新备忘」开始写。');
  }
  return rows
    .map((note) => noteRowHTML(note, { showPin: true, showFolder, folderMap }))
    .join('');
}

function noteRowHTML(note, opts = {}) {
  const { showPin = false, showFolder = false, folderMap = {} } = opts;
  const folder = note.folderId ? folderMap[note.folderId] : null;
  const folderBadge = showFolder
    ? `<span class="badge">${esc(folder ? folder.name : '未分类')}</span>`
    : '';
  return `<div class="note-row" role="button" tabindex="0" data-act="open-note" data-id="${note.id}">
    <div class="note-row-main">
      <div class="note-row-head">
        ${note.title ? `<span class="n-title" data-raw>${esc(note.title)}</span>` : '<span class="n-title">无标题笔记</span>'}
        ${showPin && note.pinned ? '<span class="badge">置顶</span>' : ''}
        ${folderBadge}
      </div>
      <div class="n-prev" data-raw>${esc(notePreview(note))}</div>
      <div class="n-time">${esc(fmtUpdated(note.updatedAt))}</div>
    </div>
    <button class="row-export" type="button" data-act="export-note" data-id="${note.id}" title="汇出笔记" aria-label="汇出笔记">⇩</button>
  </div>`;
}

function updateNoteList() {
  const list = document.getElementById('note-list');
  if (!list) return;
  const route = state.route;
  let source;
  if (route.name === 'allnotes') {
    source = standaloneNotes();
    list.innerHTML = noteListHTML(source, { showFolder: true, applyQuery: true });
  } else if (route.name === 'folder') {
    source = notesInFolder(route.id);
    list.innerHTML = noteListHTML(source, { showFolder: false, applyQuery: false });
  } else {
    return;
  }
  const sub = document.getElementById('note-sub');
  if (sub) sub.textContent = `${source.length} 则`;
}

/* ---------- 笔记编辑器（富文本，像 iOS 备忘录） ---------- */

let lastRange = null;

function getNoteEditor() {
  return document.getElementById('note-body');
}

function rememberSelection() {
  const editor = getNoteEditor();
  const sel = window.getSelection();
  if (editor && sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
    lastRange = sel.getRangeAt(0).cloneRange();
  }
}

function restoreSelection(editor) {
  if (!editor) return;
  if (lastRange && editor.contains(lastRange.startContainer)) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(lastRange);
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function notifyEditorChanged() {
  const editor = getNoteEditor();
  if (editor) editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function placeCaretIn(element) {
  if (!element) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  try {
    element.scrollIntoView({ block: 'nearest' });
  } catch (err) {
    /* ignore */
  }
}

function renderNoteEditor(id) {
  const note = state.notes.find((n) => n.id === id);
  if (!note) return notFoundPage('这则笔记不存在', '#/notes');

  state.editingNoteId = note.id;
  lastRange = null;
  const folder = note.folderId ? folderById(note.folderId) : null;
  const backAct = note.taskId ? 'back-task' : note.folderId ? 'back-folder' : 'back-notes';
  const backLabel = note.taskId ? '‹ 任务' : note.folderId ? '‹ 资料夹' : '‹ 备忘';
  const initialHtml = note.html ? sanitizeHtml(note.html) : renderMarkdown(note.body || '');

  return `<section class="editor">
    <div class="editor-bar">
      <button class="btn tiny" type="button" data-act="${backAct}">${backLabel}</button>
      <span class="spacer"></span>
      ${note.taskId ? '' : `<button class="btn tiny" type="button" data-act="move-note" data-id="${note.id}" title="移动到资料夹">📁 ${folder ? `<span data-raw>${esc(folder.name)}</span>` : '<span>未分类</span>'}</button>`}
      <button class="btn tiny" type="button" data-act="export-note" data-id="${note.id}">⇩ 汇出</button>
      ${note.taskId ? '' : `<button class="btn tiny" type="button" data-act="toggle-pin" data-id="${note.id}">${note.pinned ? '取消置顶' : '置顶'}</button>`}
      <button class="btn tiny btn-danger" type="button" data-act="delete-note" data-id="${note.id}">删除</button>
    </div>
    <div class="md-toolbar" role="toolbar" aria-label="笔记格式工具">
      <button class="tool" type="button" data-act="rich" data-cmd="bold" title="粗体" aria-label="粗体"><b>B</b></button>
      <button class="tool" type="button" data-act="rich" data-cmd="italic" title="斜体" aria-label="斜体"><em>I</em></button>
      <button class="tool" type="button" data-act="rich" data-cmd="underline" title="下划线" aria-label="下划线"><u>U</u></button>
      <button class="tool" type="button" data-act="rich" data-cmd="h2" title="大标题" aria-label="大标题">H</button>
      <button class="tool" type="button" data-act="rich" data-cmd="ul" title="项目符号" aria-label="项目符号">•</button>
      <button class="tool" type="button" data-act="rich" data-cmd="ol" title="编号清单" aria-label="编号清单">1.</button>
      <button class="tool" type="button" data-act="rich" data-cmd="todo" title="待办清单" aria-label="待办清单">☐</button>
      <button class="tool" type="button" data-act="rich" data-cmd="table" title="插入表格" aria-label="插入表格">▦</button>
      <button class="tool" type="button" data-act="rich" data-cmd="hr" title="分隔线" aria-label="分隔线">―</button>
      <span class="spacer"></span>
      <button class="tool" id="btn-dictate" type="button" data-act="dictate-note" title="语音输入（iOS 请用键盘上的 🎤 听写）" aria-label="语音输入">🎤</button>
    </div>
    <div class="md-toolbar table-tools" id="table-tools" hidden>
      <span class="tool-label">表格</span>
      <button class="tool" type="button" data-act="table-add-row">＋行</button>
      <button class="tool" type="button" data-act="table-add-col">＋栏</button>
      <button class="tool" type="button" data-act="table-del">删表格</button>
    </div>
    <input id="note-title" class="note-title" type="text" placeholder="标题" value="${esc(note.title)}" autocomplete="off">
    <div id="note-body" class="note-body rich-content" contenteditable="true" spellcheck="false" role="textbox" aria-multiline="true" data-placeholder="开始输入…">${initialHtml}</div>
    <div class="editor-foot">
      <span id="note-count">${tl('{n} 字', { n: charCount(note.body) })}</span>
      <span class="save-state" id="save-state">${tl('已储存')}</span>
      <div class="foot-right">
        <span class="md-hint">${isIOS() ? '语音：用键盘 🎤 听写' : '支援表格、清单与粗体'}</span>
        <span id="note-updated">${tl('更新于 {time}', { time: fmtUpdated(note.updatedAt) })}</span>
      </div>
    </div>
  </section>`;
}

/** 执行格式指令（内容会直接呈现在编辑区，像备忘录那样） */
function richCommand(command) {
  const editor = getNoteEditor();
  if (!editor) return;
  if (command === 'table') {
    openTableModal();
    return;
  }

  editor.focus();
  restoreSelection(editor);

  if (command === 'todo') {
    document.execCommand(
      'insertHTML',
      false,
      '<ul class="rich-todo"><li><span class="todo-box" contenteditable="false">☐</span> 待办事项</li></ul><p><br></p>'
    );
  } else {
    const commands = {
      bold: ['bold'],
      italic: ['italic'],
      underline: ['underline'],
      strike: ['strikeThrough'],
      h2: ['formatBlock', '<h2>'],
      quote: ['formatBlock', '<blockquote>'],
      ul: ['insertUnorderedList'],
      ol: ['insertOrderedList'],
      hr: ['insertHorizontalRule'],
    };
    const entry = commands[command];
    if (!entry) return;
    document.execCommand(entry[0], false, entry[1] || null);
  }

  rememberSelection();
  notifyEditorChanged();
  updateTableTools();
}

function currentTableCell() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return null;
  let node = selection.anchorNode;
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  return node && node.closest ? node.closest('td, th') : null;
}

function updateTableTools() {
  const tools = document.getElementById('table-tools');
  if (!tools) return;
  tools.hidden = !currentTableCell();
}

function tableAddRow() {
  const cell = currentTableCell();
  if (!cell) {
    toast('请先把光标放进表格');
    return;
  }
  const row = cell.closest('tr');
  const newRow = document.createElement('tr');
  for (let i = 0; i < row.children.length; i += 1) {
    const td = document.createElement('td');
    td.innerHTML = '<br>';
    newRow.appendChild(td);
  }
  row.after(newRow);
  placeCaretIn(newRow.firstElementChild);
  notifyEditorChanged();
}

function tableAddCol() {
  const cell = currentTableCell();
  if (!cell) {
    toast('请先把光标放进表格');
    return;
  }
  const table = cell.closest('table');
  const index = Array.from(cell.parentElement.children).indexOf(cell);
  table.querySelectorAll('tr').forEach((row) => {
    const td = document.createElement('td');
    td.innerHTML = '<br>';
    const reference = row.children[index];
    if (reference) reference.after(td);
    else row.appendChild(td);
  });
  notifyEditorChanged();
}

function tableDelete() {
  const cell = currentTableCell();
  if (!cell) {
    toast('请先把光标放进表格');
    return;
  }
  const table = cell.closest('table');
  const paragraph = document.createElement('p');
  paragraph.innerHTML = '<br>';
  table.replaceWith(paragraph);
  placeCaretIn(paragraph);
  notifyEditorChanged();
  updateTableTools();
}

function openTableModal() {
  openModal(`
    <div class="modal-head">
      <h2>插入表格</h2>
      <button class="btn tiny" type="button" data-act="close-modal" aria-label="关闭">✕</button>
    </div>
    <div class="form">
      <div class="field-row two">
        <label class="field"><span>行数</span><input id="tbl-rows" type="number" min="1" max="8" value="3"></label>
        <label class="field"><span>栏数</span><input id="tbl-cols" type="number" min="1" max="6" value="3"></label>
      </div>
      <p class="hint">插入后把光标放进表格，会出现「＋行 / ＋栏 / 删表格」工具。</p>
      <div class="modal-actions">
        <button class="btn" type="button" data-act="close-modal">取消</button>
        <button class="btn btn-primary" type="button" data-act="insert-table">插入</button>
      </div>
    </div>`);
}

function insertTableFromModal(button) {
  const modal = button.closest('.modal');
  if (!modal) return;
  const rows = Math.min(8, Math.max(1, Number(modal.querySelector('#tbl-rows')?.value) || 3));
  const cols = Math.min(6, Math.max(1, Number(modal.querySelector('#tbl-cols')?.value) || 3));
  closeTopModal();

  const editor = getNoteEditor();
  if (!editor) return;
  editor.focus();
  restoreSelection(editor);

  let html = '<table><tbody>';
  for (let r = 0; r < rows; r += 1) {
    html += '<tr>';
    for (let c = 0; c < cols; c += 1) html += '<td><br></td>';
    html += '</tr>';
  }
  html += '</tbody></table><p><br></p>';
  document.execCommand('insertHTML', false, html);
  rememberSelection();
  notifyEditorChanged();
  updateTableTools();
}

function insertTextIntoNote(text) {
  const editor = getNoteEditor();
  if (!editor) return;
  editor.focus();
  restoreSelection(editor);
  document.execCommand('insertText', false, text);
  rememberSelection();
  notifyEditorChanged();
}

/** 语音输入：支援的浏览器直接用 SpeechRecognition；iOS 上提示用系统键盘听写 */
function dictateNote(button) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    const editor = getNoteEditor();
    if (editor) editor.focus();
    toast('iOS Safari 不开放网页语音识别，请用键盘上的「🎤」系统听写');
    return;
  }

  if (dictation) {
    try {
      dictation.stop();
    } catch (err) {
      /* ignore */
    }
    dictation = null;
    if (button) {
      button.classList.remove('rec');
      button.textContent = '🎤';
    }
    return;
  }

  const recognition = new Recognition();
  recognition.lang = navigator.language || 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    if (button) {
      button.classList.add('rec');
      button.textContent = '■ 停止';
    }
    toast('开始听写…说完再点一次停止');
  };
  recognition.onresult = (event) => {
    let finalText = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
    }
    if (finalText) insertTextIntoNote(finalText);
  };
  recognition.onerror = (event) => {
    if (event && event.error && event.error !== 'aborted') toast(`语音识别失败：${event.error}`);
  };
  recognition.onend = () => {
    dictation = null;
    if (button) {
      button.classList.remove('rec');
      button.textContent = '🎤';
    }
    saveNoteNow();
  };

  dictation = recognition;
  try {
    recognition.start();
  } catch (err) {
    dictation = null;
    toast(`无法开始语音识别：${err.message}`);
  }
}

function setSaveState(text) {
  const el = document.getElementById('save-state');
  if (el) el.textContent = translateText(text);
}

function updateEditorFoot(note) {
  const count = document.getElementById('note-count');
  const updated = document.getElementById('note-updated');
  if (count) count.textContent = tl('{n} 字', { n: charCount(note.body) });
  if (updated) updated.textContent = tl('更新于 {time}', { time: fmtUpdated(note.updatedAt) });
}

function scheduleNoteSave() {
  setSaveState('• 未储存');
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(() => {
    saveNoteNow();
  }, 500);
}

async function saveNoteNow() {
  clearTimeout(noteSaveTimer);
  const id = state.editingNoteId;
  if (!id) return;
  const note = state.notes.find((n) => n.id === id);
  if (!note) return;

  const titleEl = document.getElementById('note-title');
  const editor = getNoteEditor();
  let changed = false;
  if (titleEl && note.title !== titleEl.value) {
    note.title = titleEl.value;
    changed = true;
  }
  if (editor) {
    const html = sanitizeHtml(editor.innerHTML);
    const text = htmlToText(html);
    if (note.html !== html || note.body !== text) {
      note.html = html;
      note.body = text;
      changed = true;
    }
  }
  if (!changed) {
    setSaveState('已储存');
    return;
  }
  note.updatedAt = Date.now();
  try {
    await db.notePut(note);
    setSaveState('已储存');
    updateEditorFoot(note);
  } catch (err) {
    console.error(err);
    setSaveState('储存失败');
    toast('笔记储存失败：' + err.message);
  }
}

async function createNote(taskId, folderId) {
  const now = Date.now();
  const note = {
    id: uid(),
    taskId: taskId || null,
    folderId: taskId ? null : folderId || null,
    title: '',
    body: '',
    html: '',
    pinned: 0,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.notePut(note);
  } catch (err) {
    toast('建立笔记失败：' + err.message);
    return;
  }
  state.notes.push(note);
  if (state.editingNoteId) state.editingNoteId = null;
  location.hash = `#/note/${encodeURIComponent(note.id)}`;
}

async function togglePin(id) {
  if (state.editingNoteId) await saveNoteNow();
  const note = state.notes.find((n) => n.id === id);
  if (!note) return;
  note.pinned = note.pinned ? 0 : 1;
  note.updatedAt = Date.now();
  try {
    await db.notePut(note);
  } catch (err) {
    toast('储存失败：' + err.message);
    return;
  }
  toast(note.pinned ? '已置顶' : '已取消置顶');
  render({ scroll: false });
}

async function deleteNoteFlow(id) {
  const note = state.notes.find((n) => n.id === id);
  if (!note) return;
  const ok = await confirmDialog({
    title: '删除笔记',
    message: `「${note.title || '无标题笔记'}」删除后无法还原。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;

  try {
    await db.noteDel(id);
  } catch (err) {
    toast('删除失败：' + err.message);
    return;
  }
  state.notes = state.notes.filter((n) => n.id !== id);
  if (state.editingNoteId === id) {
    state.editingNoteId = null;
    if (note.taskId) location.hash = `#/task/${encodeURIComponent(note.taskId)}`;
    else if (note.folderId) location.hash = `#/folder/${encodeURIComponent(note.folderId)}`;
    else location.hash = '#/notes';
  } else {
    toast('已删除笔记');
    render({ scroll: false });
  }
}

/* ==========================================================================
   任务详情
   ========================================================================== */

async function renderTaskDetail(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return notFoundPage('这个任务不存在或已被删除', '#/tasks');

  const c = catOf(task.cat);
  const notes = state.notes.filter((n) => n.taskId === id).sort((a, b) => b.updatedAt - a.updatedAt);
  const files = state.files.filter((f) => f.taskId === id).sort((a, b) => b.createdAt - a.createdAt);

  const fileItems = [];
  for (const meta of files) {
    let url = '';
    if ((meta.type || '').startsWith('image/')) {
      const blob = await db.blobGet(meta.id);
      if (blob) {
        url = URL.createObjectURL(blob);
        state.urls.push(url);
      }
    }
    fileItems.push(fileItemHTML(meta, url));
  }

  const project = task.projectId ? projectById(task.projectId) : null;
  const backHash = project ? `#/project/${encodeURIComponent(project.id)}` : '#/tasks';

  return `<section class="page detail">
    <div class="detail-top">
      <a class="btn tiny" href="${backHash}">‹ ${project ? esc(project.name) : '专案'}</a>
      <span class="badge ${task.done ? 'ok' : ''}">${task.done ? '已完成' : '进行中'}</span>
    </div>
    <h1 class="detail-title ${task.done ? 'done' : ''}" data-raw>${esc(task.title)}</h1>
    <div class="chips meta-chips">
      <span class="chip static"><span class="dot" style="--c:${c.color}"></span>${esc(c.label)}</span>
      <a class="chip" href="${project ? `#/project/${encodeURIComponent(project.id)}` : '#/project/inbox'}" data-raw>📁 ${esc(project ? project.name : '未分类')}</a>
      <span class="chip static">${esc(fmtDateCN(task.startAt))}</span>
      <span class="chip static mono">${esc(fmtRange(task.startAt, task.endAt))}</span>
      <span class="chip static">${esc(fmtDuration((task.endAt - task.startAt) / 60000))}</span>
      <span class="chip static">🔔 ${esc(reminderLabel(task))}</span>
    </div>
    <div class="detail-actions">
      <button class="btn" type="button" data-act="toggle-task" data-id="${task.id}">${task.done ? '↺ 标记未完成' : '✓ 标记完成'}</button>
      <button class="btn" type="button" data-act="edit-task" data-id="${task.id}">✎ 编辑</button>
      <button class="btn" type="button" data-act="add-note" data-id="${task.id}">＋ 任务笔记</button>
      <button class="btn" type="button" data-act="trigger-file">＋ 附件</button>
      <button class="btn" type="button" data-act="export-task-ics" data-id="${task.id}">📅 加入日历</button>
      <input class="sr-only" type="file" id="file-input" data-task="${task.id}" multiple>
    </div>

    <section class="panel">
      <div class="panel-head"><h2>附件</h2><span class="count">${files.length}</span></div>
      ${fileItems.length ? `<div class="files">${fileItems.join('')}</div>` : '<p class="empty-inline">把和这个任务相关的文件放在这里，存在这台装置上。</p>'}
    </section>

    <section class="panel">
      <div class="panel-head"><h2>任务笔记</h2><span class="count">${notes.length}</span></div>
      ${notes.length ? `<div class="notes">${notes.map((n) => noteRowHTML(n, {})).join('')}</div>` : '<p class="empty-inline">在任务里写笔记，回头一看就懂。</p>'}
    </section>

    <section class="panel danger">
      <div class="panel-head"><h2>危险区</h2></div>
      <p class="hint" style="margin-bottom:10px">${tl('删除任务会一并删除它的 {notes} 则笔记和 {files} 个附件，无法还原。', { notes: notes.length, files: files.length })}</p>
      <button class="btn btn-danger" type="button" data-act="delete-task" data-id="${task.id}">删除这个任务</button>
    </section>
  </section>`;
}

function fileItemHTML(meta, url) {
  const ext = meta.name.includes('.')
    ? meta.name.split('.').pop()
    : (meta.type || 'file').split('/')[1] || 'file';
  return `<div class="file-item">
    <div class="thumb" data-act="preview-file" data-id="${meta.id}" role="button" tabindex="0" aria-label="预览 ${esc(meta.name)}">
      ${url ? `<img src="${url}" alt="">` : `<span class="file-ext">${esc(ext.slice(0, 4))}</span>`}
    </div>
    <div class="f-meta">
      <div class="f-name" title="${esc(meta.name)}" data-raw>${esc(meta.name)}</div>
      <div class="f-size">${esc(humanSize(meta.size))}</div>
    </div>
    <div class="f-actions">
      <button class="btn tiny" type="button" data-act="download-file" data-id="${meta.id}">下载</button>
      <button class="btn tiny btn-danger" type="button" data-act="delete-file" data-id="${meta.id}" aria-label="删除附件">×</button>
    </div>
  </div>`;
}

/* ==========================================================================
   任务操作
   ========================================================================== */

async function toggleTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = task.done ? 0 : 1;
  task.updatedAt = Date.now();
  try {
    await db.taskPut(task);
  } catch (err) {
    toast('储存失败：' + err.message);
  }
  if (document.getElementById('task-list')) {
    updateTaskList();
  } else {
    await render({ scroll: false });
  }
}

async function deleteTaskFlow(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  const notes = state.notes.filter((n) => n.taskId === id);
  const files = state.files.filter((f) => f.taskId === id);

  const ok = await confirmDialog({
    title: '删除任务',
    message: `「${task.title}」以及它的 ${notes.length} 则笔记、${files.length} 个附件都会删除，无法还原。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;

  try {
    for (const f of files) await db.fileDel(f.id);
    for (const n of notes) await db.noteDel(n.id);
    await db.taskDel(id);
  } catch (err) {
    toast('删除失败：' + err.message);
    return;
  }

  state.tasks = state.tasks.filter((t) => t.id !== id);
  state.notes = state.notes.filter((n) => n.taskId !== id);
  state.files = state.files.filter((f) => f.taskId !== id);
  toast('已删除任务');

  if (state.route.name === 'task' && state.route.id === id) {
    location.hash = task.projectId ? `#/project/${encodeURIComponent(task.projectId)}` : '#/tasks';
  } else {
    await render({ scroll: false });
  }
}

/** 一次删除多个任务（连同它们的笔记与附件） */
async function deleteTasksDeep(ids) {
  const idSet = new Set(ids);
  if (!idSet.size) return;
  const files = state.files.filter((f) => idSet.has(f.taskId));
  const notes = state.notes.filter((n) => idSet.has(n.taskId));
  for (const file of files) await db.fileDel(file.id);
  for (const note of notes) await db.noteDel(note.id);
  for (const id of idSet) await db.taskDel(id);
  state.tasks = state.tasks.filter((t) => !idSet.has(t.id));
  state.notes = state.notes.filter((n) => !idSet.has(n.taskId));
  state.files = state.files.filter((f) => !idSet.has(f.taskId));
}

async function deleteTaskQuick(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  const ok = await confirmDialog({
    title: '删除任务',
    message: `「${task.title}」会连同它的笔记与附件一起删除，无法还原。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteTasksDeep([id]);
  } catch (err) {
    toast('删除失败：' + err.message);
    return;
  }
  toast('已删除任务');
  await render({ scroll: false });
}

async function clearOverdue() {
  const scope = state.route.name === 'project' ? tasksForProject(state.route.id) : state.tasks;
  const list = scope.filter((t) => isOverdue(t));
  if (!list.length) {
    toast('没有逾期任务');
    return;
  }
  const ok = await confirmDialog({
    title: '删除逾期任务',
    message: `会删除 ${list.length} 个已过期任务（连同笔记和附件），无法还原。`,
    confirmText: '全部删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteTasksDeep(list.map((t) => t.id));
  } catch (err) {
    toast('删除失败：' + err.message);
    return;
  }
  toast(`已删除 ${list.length} 个逾期任务`);
  await render({ scroll: false });
}

/* ==========================================================================
   专案
   ========================================================================== */

function openProjectModal(project = null) {
  const isEdit = Boolean(project);
  const currentColor = project ? project.color : 'blue';
  const colorChips = PROJECT_COLORS.map(
    (item) =>
      `<button class="chip color-chip ${item.id === currentColor ? 'on' : ''}" type="button" data-color="${item.id}" style="--swatch:${item.color}"><i class="swatch"></i>${item.label}</button>`
  ).join('');

  const m = openModal(`
    <div class="modal-head">
      <h2>${isEdit ? '编辑专案' : '新专案'}</h2>
      <button class="btn tiny" type="button" data-act="close-modal" aria-label="关闭">✕</button>
    </div>
    <div class="form">
      <label class="field"><span>名称</span>
        <input id="p-name" type="text" maxlength="60" placeholder="例如：工作、部落格、装修" value="${esc(isEdit ? project.name : '')}" autocomplete="off">
      </label>
      <div class="field"><span>颜色</span>
        <div class="chips" id="p-colors">${colorChips}</div>
      </div>
      <div class="form-error" id="p-error" hidden></div>
      <div class="modal-actions">
        <button class="btn" type="button" data-act="close-modal">取消</button>
        <button class="btn btn-primary" type="button" data-act="save-project" data-id="${isEdit ? project.id : ''}">${isEdit ? '保存' : '建立专案'}</button>
      </div>
    </div>`, { focus: '#p-name' });

  m.el.querySelectorAll('#p-colors [data-color]').forEach((chip) => {
    chip.addEventListener('click', () => {
      m.el.querySelectorAll('#p-colors [data-color]').forEach((other) => {
        other.classList.toggle('on', other === chip);
      });
    });
  });
}

function showProjectError(message) {
  const box = document.getElementById('p-error');
  if (box) {
    box.hidden = false;
    box.textContent = message;
  }
}

async function saveProjectFromModal(button) {
  const modal = button.closest('.modal');
  if (!modal) return;
  const name = (modal.querySelector('#p-name')?.value || '').trim();
  if (!name) {
    showProjectError('请填写专案名称');
    return;
  }
  const picked = modal.querySelector('#p-colors [data-color].on');
  const color = picked ? picked.dataset.color : 'blue';
  const id = button.dataset.id || '';
  const prev = id ? projectById(id) : null;
  const now = Date.now();
  const project = {
    id: prev ? prev.id : uid(),
    name,
    color,
    createdAt: prev ? prev.createdAt : now,
    updatedAt: now,
  };

  try {
    await db.projectPut(project);
  } catch (err) {
    showProjectError('储存失败：' + err.message);
    return;
  }

  if (prev) {
    const index = state.projects.findIndex((p) => p.id === prev.id);
    if (index >= 0) state.projects[index] = project;
    toast('已更新专案');
  } else {
    state.projects.push(project);
    toast('已建立专案');
  }
  closeTopModal();
  await render({ scroll: false });
}

async function deleteProjectFlow(id) {
  const project = projectById(id);
  if (!project) return;
  const tasks = state.tasks.filter((t) => t.projectId === id);
  const ok = await confirmDialog({
    title: '删除专案',
    message: `「${project.name}」里的 ${tasks.length} 个任务会移到「未分类」，不会被删除。`,
    confirmText: '删除专案',
    danger: true,
  });
  if (!ok) return;

  try {
    for (const task of tasks) {
      task.projectId = null;
      task.updatedAt = Date.now();
      await db.taskPut(task);
    }
    await db.projectDel(id);
  } catch (err) {
    toast('删除失败：' + err.message);
    return;
  }

  state.projects = state.projects.filter((p) => p.id !== id);
  toast('已删除专案，任务已移到未分类');
  if (location.hash !== '#/tasks') location.hash = '#/tasks';
  else await render({ scroll: false });
}

async function toggleArchive(id) {
  const project = projectById(id);
  if (!project) return;
  project.archived = project.archived ? 0 : 1;
  project.updatedAt = Date.now();
  try {
    await db.projectPut(project);
  } catch (err) {
    toast('储存失败：' + err.message);
    return;
  }
  toast(project.archived ? '已封存专案' : '已取消封存');
  await render({ scroll: false });
}

function toggleProjectSort() {
  state.projectsSorting = !state.projectsSorting;
  render({ scroll: false });
}

async function persistProjectOrder(activeList) {
  for (let i = 0; i < activeList.length; i += 1) {
    const project = activeList[i];
    project.sort = i * 10;
    project.updatedAt = Date.now();
    await db.projectPut(project);
  }
  const archived = state.projects.filter((p) => p.archived);
  state.projects = [...activeList, ...archived];
}

async function moveProject(id, dir) {
  const active = state.projects.filter((project) => !project.archived);
  const index = active.findIndex((project) => project.id === id);
  const target = index + Number(dir);
  if (index < 0 || target < 0 || target >= active.length) return;
  const reordered = active.slice();
  const [item] = reordered.splice(index, 1);
  reordered.splice(target, 0, item);
  try {
    await persistProjectOrder(reordered);
  } catch (err) {
    toast('储存失败：' + err.message);
    return;
  }
  await render({ scroll: false });
}

async function saveProjectOrderFromDom() {
  const grid = document.querySelector('.sort-grid');
  if (!grid) return;
  const ids = Array.from(grid.querySelectorAll('.project-card[data-project-id]')).map(
    (element) => element.dataset.projectId
  );
  const active = ids.map((id) => projectById(id)).filter(Boolean);
  if (active.length < 2) return;
  try {
    await persistProjectOrder(active);
  } catch (err) {
    toast('储存失败：' + err.message);
  }
}

function setProjectFilter(value) {
  state.projectFilter = value || 'all';
  render({ scroll: false });
}

/* ==========================================================================
   笔记资料夹
   ========================================================================== */

function openFolderModal(folder = null) {
  const isEdit = Boolean(folder);
  openModal(`
    <div class="modal-head">
      <h2>${isEdit ? '编辑资料夹' : '新资料夹'}</h2>
      <button class="btn tiny" type="button" data-act="close-modal" aria-label="关闭">✕</button>
    </div>
    <div class="form">
      <label class="field"><span>名称</span>
        <input id="d-name" type="text" maxlength="60" placeholder="例如：灵感、工作、读书" value="${esc(isEdit ? folder.name : '')}" autocomplete="off">
      </label>
      <div class="form-error" id="d-error" hidden></div>
      <div class="modal-actions">
        <button class="btn" type="button" data-act="close-modal">取消</button>
        <button class="btn btn-primary" type="button" data-act="save-folder" data-id="${isEdit ? folder.id : ''}">${isEdit ? '保存' : '建立资料夹'}</button>
      </div>
    </div>`, { focus: '#d-name' });
}

function showFolderError(message) {
  const box = document.getElementById('d-error');
  if (box) {
    box.hidden = false;
    box.textContent = message;
  }
}

async function saveFolderFromModal(button) {
  const modal = button.closest('.modal');
  if (!modal) return;
  const name = (modal.querySelector('#d-name')?.value || '').trim();
  if (!name) {
    showFolderError('请填写资料夹名称');
    return;
  }
  const id = button.dataset.id || '';
  const prev = id ? folderById(id) : null;
  const now = Date.now();
  const folder = {
    id: prev ? prev.id : uid(),
    name,
    createdAt: prev ? prev.createdAt : now,
    updatedAt: now,
  };

  try {
    await db.folderPut(folder);
  } catch (err) {
    showFolderError('储存失败：' + err.message);
    return;
  }

  if (prev) {
    const index = state.folders.findIndex((f) => f.id === prev.id);
    if (index >= 0) state.folders[index] = folder;
    toast('已更新资料夹');
  } else {
    state.folders.push(folder);
    toast('已建立资料夹');
  }
  closeTopModal();
  await render({ scroll: false });
}

async function deleteFolderFlow(id) {
  const folder = folderById(id);
  if (!folder) return;
  const notes = notesInFolder(id);
  const ok = await confirmDialog({
    title: '删除资料夹',
    message: `「${folder.name}」里的 ${notes.length} 则笔记会移到「未分类」，不会被删除。`,
    confirmText: '删除资料夹',
    danger: true,
  });
  if (!ok) return;

  try {
    for (const note of notes) {
      note.folderId = null;
      note.updatedAt = Date.now();
      await db.notePut(note);
    }
    await db.folderDel(id);
  } catch (err) {
    toast('删除失败：' + err.message);
    return;
  }

  state.folders = state.folders.filter((f) => f.id !== id);
  toast('已删除资料夹，笔记已移到未分类');
  if (location.hash !== '#/notes') location.hash = '#/notes';
  else await render({ scroll: false });
}

function openMoveNoteModal(noteId) {
  const note = state.notes.find((n) => n.id === noteId);
  if (!note) return;
  const rows = [
    `<button class="move-row ${!note.folderId ? 'on' : ''}" type="button" data-act="move-note-to" data-id="${note.id}" data-folder="">未分类</button>`,
  ]
    .concat(
      state.folders.map(
        (folder) =>
          `<button class="move-row ${note.folderId === folder.id ? 'on' : ''}" type="button" data-act="move-note-to" data-id="${note.id}" data-folder="${folder.id}" data-raw>${esc(folder.name)}</button>`
      )
    )
    .join('');

  openModal(`
    <div class="modal-head">
      <h2>移动到资料夹</h2>
      <button class="btn tiny" type="button" data-act="close-modal" aria-label="关闭">✕</button>
    </div>
    <div class="move-list">${rows}</div>
    <div class="modal-actions" style="margin-top:12px">
      <button class="btn" type="button" data-act="new-folder">＋ 新资料夹</button>
    </div>`);
}

async function moveNoteTo(noteId, folderId) {
  const note = state.notes.find((n) => n.id === noteId);
  if (!note) return;
  note.folderId = folderId || null;
  note.updatedAt = Date.now();
  try {
    await db.notePut(note);
  } catch (err) {
    toast('移动失败：' + err.message);
    return;
  }
  closeTopModal();
  toast('已移动笔记');
  await render({ scroll: false });
}

/* ==========================================================================
   汇出笔记
   ========================================================================== */

function exportNoteHtml(title, html) {
  return `<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  body { max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.7; color: #191820;
         font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  h1 { font-size: 28px; margin-bottom: 24px; }
  h2 { font-size: 22px; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
  th { background: #f2eee2; }
  blockquote { margin: 12px 0; padding: 6px 12px; color: #555; border-left: 4px solid #ccc; }
  pre { padding: 10px; overflow: auto; background: #f2eee2; }
  .todo-box { margin-right: 4px; }
  li.done { color: #777; text-decoration: line-through; }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
${html || '<p></p>'}
</body>
</html>`;
}

function noteExportContent(note, format) {
  const title = note.title || '无标题笔记';
  const html = note.html ? sanitizeHtml(note.html) : renderMarkdown(note.body || '');
  if (format === 'txt') {
    return {
      text: `${title}\n\n${htmlToText(html) || note.body || ''}\n`,
      type: 'text/plain;charset=utf-8',
      ext: 'txt',
    };
  }
  if (format === 'html') {
    return {
      text: exportNoteHtml(title, html),
      type: 'text/html;charset=utf-8',
      ext: 'html',
    };
  }
  return {
    text: `# ${title}\n\n${htmlToMarkdown(html)}\n`,
    type: 'text/markdown;charset=utf-8',
    ext: 'md',
  };
}

function safeFileName(value) {
  const cleaned = String(value || 'note')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return cleaned || 'note';
}

function openExportNoteModal(noteId) {
  const note = state.notes.find((n) => n.id === noteId);
  if (!note) return;
  openModal(`
    <div class="modal-head">
      <h2>汇出笔记</h2>
      <button class="btn tiny" type="button" data-act="close-modal" aria-label="关闭">✕</button>
    </div>
    <p class="hint" style="margin-bottom:12px">${tl('「{title}」会下载到「文件」App。', { title: note.title || '无标题笔记' })}</p>
    <div class="export-list">
      <button class="export-row" type="button" data-act="export-note-format" data-id="${note.id}" data-format="md">
        <strong>Markdown (.md)</strong><span>保留标题、清单与表格，方便搬到别的笔记软体</span>
      </button>
      <button class="export-row" type="button" data-act="export-note-format" data-id="${note.id}" data-format="txt">
        <strong>纯文本 (.txt)</strong><span>只要文字，任何地方都能打开</span>
      </button>
      <button class="export-row" type="button" data-act="export-note-format" data-id="${note.id}" data-format="html">
        <strong>网页 (.html)</strong><span>保留格式，可用浏览器打开或印成 PDF</span>
      </button>
      <button class="export-row" type="button" data-act="export-note-format" data-id="${note.id}" data-format="pdf">
        <strong>PDF（列印 / 存到文件）</strong><span>打开系统列印对话框，可存成 PDF 或直接印出来</span>
      </button>
    </div>`);
}

function printNote(note) {
  const title = note.title || '无标题笔记';
  const html = note.html ? sanitizeHtml(note.html) : renderMarkdown(note.body || '');
  const printRoot = document.getElementById('print-root');
  if (!printRoot) return;

  printRoot.innerHTML = `<article class="print-note"><h1>${esc(title)}</h1>${html}</article>`;
  document.body.classList.add('printing');
  closeTopModal();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove('printing');
    printRoot.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 60000);

  setTimeout(() => {
    try {
      window.print();
    } catch (err) {
      cleanup();
      toast('这个浏览器不支持列印，请改用 HTML 汇出');
    }
  }, 120);
}

function exportNoteFormat(noteId, format) {
  const note = state.notes.find((n) => n.id === noteId);
  if (!note) return;
  const payload = noteExportContent(note, format);
  const stamp = toDateValue(Date.now()).replace(/-/g, '');
  downloadBlob(
    new Blob([payload.text], { type: payload.type }),
    `${safeFileName(note.title || 'note')}-${stamp}.${payload.ext}`
  );
  closeTopModal();
  toast('已汇出笔记');
}

/* ---------- 新增 / 编辑任务弹窗 ---------- */

function openTaskModal(task, preset = {}) {
  const isEdit = Boolean(task);
  const now = Date.now();
  let startAt;
  let endAt;
  let title;
  let category;
  let remindValue;

  if (isEdit) {
    startAt = task.startAt;
    endAt = task.endAt;
    title = task.title;
    category = task.cat;
    remindValue =
      task.remind === null
        ? 'none'
        : String(typeof task.remind === 'number' ? task.remind : DEFAULT_REMIND);
  } else {
    const presetDate = preset.dateStr || (preset.dayTs != null ? toDateValue(preset.dayTs) : null);
    const baseDateStr = presetDate || (preset.startTime ? toDateValue(now) : null);
    if (baseDateStr) {
      const startTime = preset.startTime || '09:00';
      const parsed = parseLocal(baseDateStr, startTime);
      startAt = parsed ? parsed.getTime() : roundUpHalfHour(now);
    } else {
      startAt = roundUpHalfHour(now);
    }
    endAt = startAt + 60 * 60000;
    if (preset.endTime) {
      const parsedEnd = parseLocal(baseDateStr || toDateValue(startAt), preset.endTime);
      if (parsedEnd) endAt = parsedEnd.getTime();
    }
    if (endAt <= startAt) endAt += 86400000;
    title = preset.title || '';
    category = preset.cat && CAT[preset.cat] ? preset.cat : 'work';
    remindValue =
      preset.remind === null
        ? 'none'
        : String(typeof preset.remind === 'number' ? preset.remind : DEFAULT_REMIND);
  }

  const catOptions = Object.entries(CAT)
    .map(([key, value]) => `<option value="${key}" ${key === category ? 'selected' : ''}>${value.label}</option>`)
    .join('');
  const remindOptions = REMIND_OPTIONS.map(
    ([value, label]) => `<option value="${value}" ${String(remindValue) === value ? 'selected' : ''}>${label}</option>`
  ).join('');

  let currentProjectId;
  if (isEdit) {
    currentProjectId = task.projectId || '';
  } else if (preset.projectId !== undefined) {
    currentProjectId = preset.projectId || '';
  } else {
    currentProjectId =
      state.route && state.route.name === 'project' && state.route.id ? state.route.id : '';
  }
  const projectOptions = [`<option value="">未分类</option>`]
    .concat(
      state.projects.map(
        (project) =>
          `<option value="${project.id}" data-raw ${project.id === currentProjectId ? 'selected' : ''}>${esc(project.name)}</option>`
      )
    )
    .join('');

  const m = openModal(`
    <div class="modal-head">
      <h2>${isEdit ? '编辑任务' : '新任务'}</h2>
      <button class="btn tiny" type="button" data-act="close-modal" aria-label="关闭">✕</button>
    </div>
    <div class="form">
      <label class="field"><span>标题</span>
        <input id="f-title" type="text" placeholder="要做什么？" value="${esc(title || '')}" autocomplete="off">
      </label>
      <div class="field-row">
        <label class="field"><span>日期</span>
          <input id="f-date" type="date" value="${toDateValue(startAt)}">
        </label>
      </div>
      <div class="field-row two">
        <label class="field"><span>开始</span>
          <input id="f-start" type="time" value="${toTimeValue(startAt)}">
        </label>
        <label class="field"><span>结束</span>
          <input id="f-end" type="time" value="${toTimeValue(endAt)}">
        </label>
      </div>
      <div class="dur-line"><span id="f-dur">${tl('时长 {value}', { value: fmtDuration((endAt - startAt) / 60000) })}</span><span class="warn-text" id="f-warn"></span></div>
      <div class="dur-chips">
        <button class="btn tiny" type="button" data-act="set-dur" data-dur="30">30 分</button>
        <button class="btn tiny" type="button" data-act="set-dur" data-dur="60">1 小时</button>
        <button class="btn tiny" type="button" data-act="set-dur" data-dur="90">1.5 小时</button>
        <button class="btn tiny" type="button" data-act="set-dur" data-dur="120">2 小时</button>
      </div>
      <label class="field"><span>专案</span>
        <select id="f-project">${projectOptions}</select>
      </label>
      <div class="field-row two">
        <label class="field"><span>分类</span>
          <select id="f-cat">${catOptions}</select>
        </label>
        <label class="field"><span>提醒</span>
          <select id="f-remind">${remindOptions}</select>
        </label>
      </div>
      <p class="hint">提醒会写进汇出的日历文件，由系统日历执行；App 本身不会在背景通知。</p>
      <div class="form-error" id="f-error" hidden></div>
      <div class="modal-actions">
        <button class="btn" type="button" data-act="close-modal">取消</button>
        <button class="btn btn-primary" type="button" data-act="save-task" data-id="${isEdit ? task.id : ''}">${isEdit ? '保存' : '建立任务'}</button>
      </div>
    </div>`, { focus: isEdit ? null : '#f-title' });

  ['#f-date', '#f-start', '#f-end'].forEach((selector) => {
    const input = m.el.querySelector(selector);
    if (!input) return;
    input.addEventListener('change', () => syncTaskForm(m.el));
    input.addEventListener('input', () => syncTaskForm(m.el));
  });
  syncTaskForm(m.el);
}

function syncTaskForm(modal) {
  const date = modal.querySelector('#f-date')?.value || '';
  const startTime = modal.querySelector('#f-start')?.value || '';
  const endTime = modal.querySelector('#f-end')?.value || '';
  const durEl = modal.querySelector('#f-dur');
  const warnEl = modal.querySelector('#f-warn');
  if (!durEl) return;

  const start = parseLocal(date, startTime);
  const end = parseLocal(date, endTime);
  if (!start || !end) {
    durEl.textContent = tl('时长 —');
    if (warnEl) warnEl.textContent = '';
    return;
  }
  let minutes = (end.getTime() - start.getTime()) / 60000;
  if (minutes <= 0) {
    minutes += 1440;
    if (warnEl) warnEl.textContent = '结束早于开始，会算成隔日';
  } else if (warnEl) {
    warnEl.textContent = '';
  }
  durEl.textContent = tl('时长 {value}', { value: fmtDuration(minutes) });
}

function setDurationFromChip(button) {
  const modal = button.closest('.modal');
  if (!modal) return;
  const minutes = Number(button.dataset.dur) || 60;
  const date = modal.querySelector('#f-date')?.value || toDateValue(Date.now());
  const startTime = modal.querySelector('#f-start')?.value || toTimeValue(Date.now());
  const start = parseLocal(date, startTime);
  if (!start) return;
  const end = new Date(start.getTime() + minutes * 60000);
  const endInput = modal.querySelector('#f-end');
  if (endInput) endInput.value = toTimeValue(end.getTime());
  syncTaskForm(modal);
}

async function saveTaskFromModal(button) {
  const modal = button.closest('.modal');
  if (!modal) return;
  const errorEl = modal.querySelector('#f-error');
  const showError = (message) => {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = message;
    }
  };

  const title = (modal.querySelector('#f-title')?.value || '').trim();
  const date = modal.querySelector('#f-date')?.value || '';
  const startTime = modal.querySelector('#f-start')?.value || '';
  const endTime = modal.querySelector('#f-end')?.value || '';
  const cat = modal.querySelector('#f-cat')?.value || 'other';
  const remindRaw = modal.querySelector('#f-remind')?.value ?? 'none';
  const remind = remindRaw === 'none' ? null : Number(remindRaw);
  const projectId = modal.querySelector('#f-project')?.value || null;

  if (!title) {
    showError('请先填写标题');
    return;
  }
  const start = parseLocal(date, startTime);
  if (!start) {
    showError('请选择日期与开始时间');
    return;
  }
  const startAt = start.getTime();
  let endAt;
  if (endTime) {
    const end = parseLocal(date, endTime);
    endAt = end ? end.getTime() : startAt + 3600000;
  } else {
    endAt = startAt + 3600000;
  }
  if (endAt <= startAt) endAt += 86400000;

  const editId = button.dataset.id || '';
  const prev = editId ? state.tasks.find((t) => t.id === editId) : null;
  const now = Date.now();
  const task = {
    id: prev ? prev.id : uid(),
    title,
    startAt,
    endAt,
    cat: CAT[cat] ? cat : 'other',
    projectId: projectId || null,
    done: prev ? prev.done : 0,
    remind: Number.isFinite(remind) ? remind : null,
    createdAt: prev ? prev.createdAt : now,
    updatedAt: now,
  };

  try {
    await db.taskPut(task);
  } catch (err) {
    showError('储存失败：' + err.message);
    return;
  }

  if (prev) {
    const index = state.tasks.findIndex((t) => t.id === prev.id);
    if (index >= 0) state.tasks[index] = task;
    toast('已更新任务');
  } else {
    state.tasks.push(task);
    toast('已建立任务');
  }
  closeTopModal();
  await render({ scroll: false });
}

/* ==========================================================================
   附件
   ========================================================================== */

async function addFiles(taskId, fileList) {
  const items = Array.from(fileList || []);
  if (!items.length || !taskId) return;
  let added = 0;
  for (const file of items) {
    if (file.size > 200 * 1024 * 1024) {
      toast(`${file.name} 超过 200MB，已跳过`);
      continue;
    }
    const meta = {
      id: uid(),
      taskId,
      name: file.name || '未命名文件',
      type: file.type || 'application/octet-stream',
      size: file.size || 0,
      createdAt: Date.now(),
    };
    try {
      await db.blobPut(meta.id, file);
      await db.filePut(meta);
      state.files.push(meta);
      added += 1;
    } catch (err) {
      console.error(err);
      toast('附件储存失败：' + err.message);
      break;
    }
  }
  if (added) toast(`已加入 ${added} 个附件`);
  await render({ scroll: false });
}

async function previewFile(id) {
  const meta = state.files.find((f) => f.id === id);
  if (!meta) return;
  if (!(meta.type || '').startsWith('image/')) {
    toast('这个文件类型无法预览，请下载后用其他 App 打开');
    return;
  }
  const blob = await db.blobGet(id);
  if (!blob) {
    toast('找不到附件内容');
    return;
  }
  const url = URL.createObjectURL(blob);
  openModal(`
    <div class="modal-head">
      <h2>${esc(meta.name)}</h2>
      <button class="btn tiny" type="button" data-act="close-modal" aria-label="关闭">✕</button>
    </div>
    <img class="lightbox-img" src="${url}" alt="${esc(meta.name)}">
  `, { onClose: () => setTimeout(() => URL.revokeObjectURL(url), 300) });
}

async function downloadFile(id) {
  const meta = state.files.find((f) => f.id === id);
  if (!meta) return;
  const blob = await db.blobGet(id);
  if (!blob) {
    toast('找不到附件内容');
    return;
  }
  downloadBlob(blob, meta.name);
}

async function deleteFileFlow(id) {
  const meta = state.files.find((f) => f.id === id);
  if (!meta) return;
  const ok = await confirmDialog({
    title: '删除附件',
    message: `「${meta.name}」会从这台装置删除，无法还原。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;

  try {
    await db.fileDel(id);
  } catch (err) {
    toast('删除失败：' + err.message);
    return;
  }
  state.files = state.files.filter((f) => f.id !== id);
  toast('已删除附件');
  await render({ scroll: false });
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ==========================================================================
   弹窗
   ========================================================================== */

function openModal(html, opts = {}) {
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  root.appendChild(overlay);
  document.body.classList.add('no-scroll');

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    modalStack = modalStack.filter((fn) => fn !== close);
    if (!root.children.length) document.body.classList.remove('no-scroll');
    if (opts.onClose) opts.onClose();
  };
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  modalStack.push(close);
  translateDom(overlay);

  if (opts.focus) {
    setTimeout(() => {
      const el = overlay.querySelector(opts.focus);
      if (el) el.focus({ preventScroll: true });
    }, 80);
  }

  return { el: overlay.querySelector('.modal'), overlay, close };
}

function closeTopModal() {
  const close = modalStack[modalStack.length - 1];
  if (close) close();
}

function confirmDialog(opts = {}) {
  const {
    title = '确认',
    message = '',
    confirmText = '确定',
    cancelText = '取消',
    danger = false,
  } = opts;

  return new Promise((resolve) => {
    let done = false;
    const m = openModal(`
      <div class="modal-head"><h2>${esc(translateText(title))}</h2></div>
      <p class="hint" style="margin-bottom:14px">${esc(translateText(message))}</p>
      <div class="modal-actions">
        <button class="btn" type="button" data-confirm="0">${esc(cancelText)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-confirm="1">${esc(confirmText)}</button>
      </div>`, {
      onClose: () => {
        if (!done) {
          done = true;
          resolve(false);
        }
      },
    });

    m.el.querySelector('[data-confirm="0"]').addEventListener('click', () => {
      done = true;
      resolve(false);
      m.close();
    });
    m.el.querySelector('[data-confirm="1"]').addEventListener('click', () => {
      done = true;
      resolve(true);
      m.close();
    });
  });
}

/* ==========================================================================
   设置 / 备份 / 更新
   ========================================================================== */

function openSettings() {
  const themeChips = THEMES.map(
    ([key, label]) =>
      `<button class="chip ${state.theme === key ? 'on' : ''}" type="button" data-act="set-theme" data-theme="${key}">${label}</button>`
  ).join('');

  const m = openModal(`
    <div class="modal-head">
      <h2>设置</h2>
      <button class="btn tiny" type="button" data-act="close-modal" aria-label="关闭">✕</button>
    </div>

    <section class="set-block">
      <h3>外观</h3>
      <div class="chips">${themeChips}</div>
      <p class="hint" style="margin-top:8px">「跟随系统」会随 iOS 的深色模式自动切换。</p>
    </section>

    <section class="set-block">
      <h3>语言</h3>
      <div class="chips">
        ${LANGS.map(
          ([value, label]) =>
            `<button class="chip ${getLang() === value ? 'on' : ''}" type="button" data-act="set-lang" data-lang="${value}">${label}</button>`
        ).join('')}
      </div>
    </section>

    <section class="set-block">
      <h3>储存</h3>
      <p class="hint" id="storage-info">读取中…</p>
      <button class="btn" type="button" data-act="persist-storage">申请持久化储存</button>
      <p class="hint" id="persist-info" style="margin-top:8px"></p>
    </section>

    <section class="set-block">
      <h3>系统日历</h3>
      <p class="hint">把任务导出成 .ics（含提醒闹钟），下载后到「文件」App 点开，选「加入日历」。之后由系统日历在本机提醒，不需要服务器。</p>
      <div class="row-btns">
        <button class="btn" type="button" data-act="export-all-ics">导出全部未完成任务</button>
        <button class="btn" type="button" data-act="copy-today">复制今日清单</button>
      </div>
      <p class="hint" style="margin-top:8px">任务改动后再导出一次即可；建议汇入到专门的「Pixel Notes」日历，方便清掉重来。</p>
    </section>

    <section class="set-block">
      <h3>备份与还原</h3>
      <p class="hint">资料只存在这台装置。换装置或清除浏览器资料前，记得先汇出备份。</p>
      <div class="row-btns">
        <button class="btn" type="button" data-act="export-backup">汇出备份 JSON</button>
        <button class="btn" type="button" data-act="import-backup">汇入备份</button>
      </div>
      <input class="sr-only" type="file" id="import-file" accept=".json,application/json">
    </section>

    <section class="set-block">
      <h3>iOS 捷径</h3>
      <p class="hint">在「快捷指令」里用「打开网址」呼叫下面的链接，就能快速新建任务（可预填标题、日期、开始时间、分类）。</p>
      <p class="shortcut-url" id="shortcut-url">${esc(shortcutUrl())}</p>
      <div class="row-btns">
        <button class="btn" type="button" data-act="copy-shortcut-url">复制链接</button>
      </div>
      <p class="hint" style="margin-top:8px">参数：<code>title</code>、<code>date</code>（YYYY-MM-DD）、<code>start</code>、<code>end</code>、<code>cat</code>（work/life/study/other）、<code>remind</code>（分钟，或 <code>none</code>）。</p>
    </section>

    <section class="set-block">
      <h3>应用</h3>
      <p class="hint">Pixel Notes v1.5 · 离线优先，不需要网络。</p>
      <button class="btn" type="button" data-act="force-update">检查更新（清除快取）</button>
    </section>

    <section class="set-block">
      <h3>部署检查</h3>
      <p class="hint">品牌图示或主画面图标不见，通常是部署时漏传了 <code>icons/</code> 资料夹。点一下检查所有档案是否都在。</p>
      <button class="btn" type="button" data-act="check-assets">检查档案</button>
      <div id="asset-check" class="asset-list"></div>
    </section>

    <section class="set-block danger">
      <h3>危险区</h3>
      <p class="hint">清空全部任务、笔记与附件。</p>
      <button class="btn btn-danger" type="button" data-act="clear-all">清空全部资料</button>
    </section>
  `);

  fillStorageInfo();
  const importInput = m.el.querySelector('#import-file');
  if (importInput) importInput.addEventListener('change', handleImportFile);
}

function shortcutUrl() {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/new?title={title}&date={YYYY-MM-DD}&start={HH:mm}`;
}

function todayText() {
  const key = dayKey(Date.now());
  const list = state.tasks
    .filter((t) => dayKey(t.startAt) === key)
    .sort((a, b) => a.startAt - b.startAt);
  const lines = [`${fmtDateCN(Date.now())} 的任务`];
  if (!list.length) lines.push('（今天没有任务）');
  for (const task of list) {
    lines.push(`${task.done ? '✓' : '○'} ${fmtTime(task.startAt)} ${task.title}`);
  }
  return lines.join('\n');
}

async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const field = document.createElement('textarea');
      field.value = text;
      field.className = 'sr-only';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    toast(successMessage || '已复制');
  } catch (err) {
    toast(`复制失败：${err.message}`);
  }
}

async function copyTodayList() {
  await copyText(todayText(), '已复制今日清单');
}

async function copyShortcut() {
  await copyText(shortcutUrl(), '已复制捷径链接');
}

/* ---------- 部署检查 ---------- */

const DEPLOY_FILES = [
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './util.js',
  './ics.js',
  './md.js',
  './richtext.js',
  './i18n.js',
  './sw.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/mark.svg',
];

async function checkAssets() {
  const box = document.getElementById('asset-check');
  if (!box) return;
  box.innerHTML = '<p class="hint">检查中…</p>';

  const rows = [];
  for (const url of DEPLOY_FILES) {
    let ok = false;
    try {
      const response = await fetch(`${url}?check=${Date.now()}`, { cache: 'no-store' });
      ok = response.ok;
    } catch (err) {
      ok = false;
    }
    rows.push(`<div class="asset-row ${ok ? 'ok' : 'bad'}">${ok ? '✅' : '❌'} <code>${esc(url)}</code></div>`);
  }
  const missing = rows.filter((row) => row.includes('bad')).length;
  box.innerHTML =
    rows.join('') +
    `<p class="hint" style="margin-top:8px">${
      missing ? `有 ${missing} 个档案没找到，请重新上传完整的资料夹。` : '全部档案都在 ✓'
    }</p>`;
}

/* ---------- 导出到系统日历 ---------- */

function exportTasksICS(tasks, prefix) {
  const list = (tasks || []).filter(Boolean);
  if (!list.length) {
    toast('没有可汇出的任务');
    return;
  }
  const ics = buildICS(list, { calendarName: 'Pixel Notes' });
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  downloadBlob(blob, icsFilename(prefix));
  toast('已下载 .ics，到「文件」App 点开即可加入日历');
}

async function exportTaskICS(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  exportTasksICS([task], 'task');
}

async function exportDayICS() {
  const key = dayKey(state.selectedDay);
  const list = state.tasks.filter((t) => dayKey(t.startAt) === key && !t.done);
  exportTasksICS(list, key.replace(/-/g, ''));
}

async function exportAllICS() {
  const list = state.tasks.filter((t) => !t.done);
  exportTasksICS(list, 'all');
}

async function fillStorageInfo() {
  const el = document.getElementById('storage-info');
  if (!el) return;
  try {
    if (!navigator.storage || !navigator.storage.estimate) {
      el.textContent = tl('这个浏览器不支援储存空间查询。');
      return;
    }
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    const quotaText = quota ? tl(' / 可用约 {q}', { q: humanSize(quota) }) : '';
    el.textContent = tl('已用 {used}{quota}{persist}', {
      used: humanSize(usage),
      quota: quotaText,
      persist: persisted ? tl(' · 已持久化') : tl(' · 未持久化'),
    });
  } catch (err) {
    el.textContent = tl('无法读取储存资讯。');
  }
}

async function requestPersist() {
  const info = document.getElementById('persist-info');
  if (!navigator.storage || !navigator.storage.persist) {
    if (info) info.textContent = tl('这个浏览器不支援持久化储存。');
    return;
  }
  try {
    const ok = await navigator.storage.persist();
    if (info) info.textContent = ok ? tl('✓ 已获得持久化储存') : tl('未授予。iOS 上通常要先「加到主画面」再申请。');
    toast(ok ? tl('已获得持久化储存') : tl('未授予持久化储存'));
    await fillStorageInfo();
  } catch (err) {
    if (info) info.textContent = tl('申请失败：{msg}', { msg: err.message });
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const comma = text.indexOf(',');
      resolve(comma >= 0 ? text.slice(comma + 1) : '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, type) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
}

async function exportBackup() {
  try {
    const payload = {
      app: 'pixel-notes',
      version: 2,
      exportedAt: new Date().toISOString(),
      tasks: state.tasks,
      notes: state.notes,
      projects: state.projects,
      folders: state.folders,
      files: [],
    };
    for (const meta of state.files) {
      const blob = await db.blobGet(meta.id);
      payload.files.push({ meta, data: blob ? await blobToBase64(blob) : null });
    }
    const now = new Date();
    const name = `pixel-notes-backup-${toDateValue(now.getTime()).replace(/-/g, '')}-${pad2(now.getHours())}${pad2(now.getMinutes())}.json`;
    downloadBlob(new Blob([JSON.stringify(payload)], { type: 'application/json' }), name);
    toast('已汇出备份');
  } catch (err) {
    console.error(err);
    toast('汇出失败：' + err.message);
  }
}

async function handleImportFile(event) {
  const input = event.target;
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (err) {
    toast('汇入失败：不是有效的 JSON 档');
    return;
  }
  if (!data || data.app !== 'pixel-notes' || !Array.isArray(data.tasks)) {
    toast('汇入失败：不是 Pixel Notes 的备份档');
    return;
  }

  const fileRows = Array.isArray(data.files) ? data.files : [];
  const ok = await confirmDialog({
    title: '汇入备份',
    message: `会覆盖现有资料，并还原 ${data.tasks.length} 个任务、${(data.notes || []).length} 则笔记、${fileRows.length} 个附件。`,
    confirmText: '覆盖并还原',
    danger: true,
  });
  if (!ok) return;

  try {
    await db.clearAll();
    const payload = {
      tasks: data.tasks,
      notes: data.notes || [],
      projects: data.projects || [],
      folders: data.folders || [],
      files: [],
    };
    for (const row of fileRows) {
      if (!row || !row.meta) continue;
      payload.files.push({
        meta: row.meta,
        blob: row.data ? base64ToBlob(row.data, row.meta.type) : null,
      });
    }
    await db.importAll(payload);
    await loadData();
    closeTopModal();
    toast('已还原备份');
    await render({ scroll: false });
  } catch (err) {
    console.error(err);
    toast('还原失败：' + err.message);
  }
}

async function clearAllFlow() {
  const ok = await confirmDialog({
    title: '清空全部资料',
    message: '任务、笔记与附件都会删除，无法还原。建议先汇出备份。',
    confirmText: '确定清空',
    danger: true,
  });
  if (!ok) return;

  try {
    await db.clearAll();
    await db.metaSet('seeded', true);
  } catch (err) {
    toast('清空失败：' + err.message);
    return;
  }
  state.tasks = [];
  state.notes = [];
  state.files = [];
  state.projects = [];
  state.folders = [];
  state.editingNoteId = null;
  closeTopModal();
  toast('已清空资料');
  if (location.hash !== '#/tasks') location.hash = '#/tasks';
  else await render({ scroll: false });
}

async function forceUpdate() {
  const ok = await confirmDialog({
    title: '检查更新',
    message: '会清除本机快取并重新载入。资料不受影响，但需要连线才能抓到新版本。',
    confirmText: '清除并重载',
  });
  if (!ok) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    location.reload();
  } catch (err) {
    toast('更新失败：' + err.message);
  }
}

async function dismissHint() {
  state.hintDismissed = true;
  try {
    await db.metaSet('installHintDismissed', true);
  } catch (err) {
    /* ignore */
  }
  render({ scroll: false });
}

/* ==========================================================================
   事件
   ========================================================================== */

function bindEvents() {
  window.addEventListener('hashchange', () => {
    render();
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    // 笔记里的待办方块：点一下切换 ☐ / ☑
    const todoBox = event.target.closest('.todo-box');
    const editor = getNoteEditor();
    if (todoBox && editor && editor.contains(todoBox)) {
      event.preventDefault();
      const checked = todoBox.textContent.trim() === '☑';
      todoBox.textContent = checked ? '☐' : '☑';
      const item = todoBox.closest('li');
      if (item) item.classList.toggle('done', !checked);
      notifyEditorChanged();
      return;
    }

    // 排序模式：点卡片本体不要进专案（按卡片上的 ↑↓ 才有效）
    if (state.projectsSorting) {
      const card = event.target.closest('.project-card');
      if (card && !event.target.closest('[data-act="move-project"]')) {
        event.preventDefault();
        return;
      }
    }

    const target = event.target.closest('[data-act]');
    if (!target) return;
    if (target.tagName === 'A' && !target.dataset.act) return;
    event.preventDefault();
    onAction(target.dataset.act, target).catch((err) => {
      console.error(err);
      toast('操作失败：' + err.message);
    });
  });

  // 专案卡片拖动排序（触控 / 滑鼠都支援）
  document.addEventListener('pointerdown', (event) => {
    if (!state.projectsSorting) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-act="move-project"]')) return;
    const card = event.target.closest('.project-card[data-project-id]');
    if (!card) return;
    event.preventDefault();
    projectDrag = { card, pointerId: event.pointerId };
    card.classList.add('dragging');
    try {
      card.setPointerCapture(event.pointerId);
    } catch (err) {
      /* ignore */
    }
  });

  document.addEventListener('pointermove', (event) => {
    if (!projectDrag) return;
    const grid = projectDrag.card.parentElement;
    if (!grid) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const over = target && target.closest ? target.closest('.project-card') : null;
    if (!over || over === projectDrag.card || over.parentElement !== grid) return;
    const rect = over.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    grid.insertBefore(projectDrag.card, after ? over.nextSibling : over);
  });

  const endProjectDrag = () => {
    if (!projectDrag) return;
    projectDrag.card.classList.remove('dragging');
    projectDrag = null;
    saveProjectOrderFromDom().then(() => render({ scroll: false }));
  };
  document.addEventListener('pointerup', endProjectDrag);
  document.addEventListener('pointercancel', endProjectDrag);

  document.addEventListener('selectionchange', () => {
    rememberSelection();
    updateTableTools();
  });

  document.addEventListener('input', (event) => {
    const el = event.target;
    if (el.id === 'task-search') {
      state.query.tasks = el.value;
      updateTaskList();
    } else if (el.id === 'note-search') {
      state.query.notes = el.value;
      updateNoteList();
    } else if (el.id === 'note-title' || el.id === 'note-body') {
      scheduleNoteSave();
      if (el.id === 'note-body') updateTableTools();
    }
  });

  document.addEventListener('change', (event) => {
    const el = event.target;
    if (el.id === 'file-input') {
      const taskId = el.dataset.task;
      const files = el.files ? Array.from(el.files) : [];
      el.value = '';
      if (files.length) addFiles(taskId, files);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (modalStack.length) {
        event.preventDefault();
        closeTopModal();
      }
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey) return;
    const el = event.target;
    if (!(el instanceof HTMLElement)) return;
    if (el.id === 'f-title') {
      const modal = el.closest('.modal');
      const save = modal && modal.querySelector('[data-act="save-task"]');
      if (save) {
        event.preventDefault();
        onAction('save-task', save);
      }
      return;
    }
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && el.tagName !== 'BUTTON') {
      const row = el.closest('[data-act="open-task"], [data-act="open-note"], [data-act="preview-file"]');
      if (row) {
        event.preventDefault();
        row.click();
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state.editingNoteId) saveNoteNow();
  });

  window.addEventListener('pagehide', () => {
    if (state.editingNoteId) saveNoteNow();
  });
}

async function onAction(action, el) {
  const id = el.dataset.id || '';
  switch (action) {
    case 'close-modal':
      closeTopModal();
      return;
    case 'open-task':
      location.hash = `#/task/${encodeURIComponent(id)}`;
      return;
    case 'open-note':
      location.hash = `#/note/${encodeURIComponent(id)}`;
      return;
    case 'toggle-task':
      await toggleTask(id);
      return;
    case 'new-task':
      openTaskModal(null, {});
      return;
    case 'new-task-day':
      openTaskModal(null, { dayTs: state.selectedDay.getTime() });
      return;
    case 'new-note': {
      const folderId = state.route.name === 'folder' ? state.route.id : null;
      await createNote(null, folderId);
      return;
    }
    case 'add-note':
      await createNote(id);
      return;
    case 'new-project':
      openProjectModal();
      return;
    case 'edit-project':
      openProjectModal(projectById(id));
      return;
    case 'save-project':
      await saveProjectFromModal(el);
      return;
    case 'delete-project':
      await deleteProjectFlow(id);
      return;
    case 'toggle-archive':
      await toggleArchive(id);
      return;
    case 'open-project':
      location.hash = id ? `#/project/${encodeURIComponent(id)}` : '#/project/inbox';
      return;
    case 'toggle-project-sort':
      toggleProjectSort();
      return;
    case 'move-project':
      await moveProject(id, el.dataset.dir || '1');
      return;
    case 'project-filter':
      setProjectFilter(el.dataset.project || 'all');
      return;
    case 'go-tasks':
      location.hash = '#/tasks';
      return;
    case 'go-all':
      location.hash = '#/all';
      return;
    case 'go-notes':
      location.hash = '#/notes';
      return;
    case 'go-allnotes':
      location.hash = '#/allnotes';
      return;
    case 'new-folder':
      openFolderModal();
      return;
    case 'edit-folder':
      openFolderModal(folderById(id));
      return;
    case 'save-folder':
      await saveFolderFromModal(el);
      return;
    case 'delete-folder':
      await deleteFolderFlow(id);
      return;
    case 'move-note':
      openMoveNoteModal(id);
      return;
    case 'move-note-to':
      await moveNoteTo(id, el.dataset.folder || '');
      return;
    case 'export-note':
      if (state.editingNoteId === id) await saveNoteNow();
      openExportNoteModal(id);
      return;
    case 'export-note-format': {
      const note = state.notes.find((n) => n.id === id);
      if (el.dataset.format === 'pdf') {
        if (note) printNote(note);
      } else {
        exportNoteFormat(id, el.dataset.format || 'md');
      }
      return;
    }
    case 'edit-task': {
      const task = state.tasks.find((t) => t.id === id);
      if (task) openTaskModal(task);
      return;
    }
    case 'save-task':
      await saveTaskFromModal(el);
      return;
    case 'set-dur':
      setDurationFromChip(el);
      return;
    case 'clear-overdue':
      await clearOverdue();
      return;
    case 'delete-task-quick':
      await deleteTaskQuick(id);
      return;
    case 'export-task-ics':
      await exportTaskICS(id);
      return;
    case 'export-day-ics':
      await exportDayICS();
      return;
    case 'export-all-ics':
      await exportAllICS();
      return;
    case 'cycle-theme':
      cycleTheme();
      return;
    case 'set-theme': {
      const mode = el.dataset.theme || 'auto';
      if (!THEME_LABEL[mode]) return;
      applyTheme(mode, { silent: true });
      const modal = el.closest('.modal');
      if (modal) {
        modal.querySelectorAll('[data-act="set-theme"]').forEach((chip) => {
          chip.classList.toggle('on', chip.dataset.theme === state.theme);
        });
      }
      toast(`主题：${THEME_LABEL[mode]}`);
      return;
    }
    case 'set-lang': {
      setLang(el.dataset.lang);
      applyLangMeta();
      closeTopModal();
      render({ scroll: false });
      toast(tl('语言已切换'));
      return;
    }
    case 'rich':
      richCommand(el.dataset.cmd || 'bold');
      return;
    case 'insert-table':
      insertTableFromModal(el);
      return;
    case 'table-add-row':
      tableAddRow();
      return;
    case 'table-add-col':
      tableAddCol();
      return;
    case 'table-del':
      tableDelete();
      return;
    case 'dictate-note':
      dictateNote(el);
      return;
    case 'copy-shortcut-url':
      await copyShortcut();
      return;
    case 'copy-today':
      await copyTodayList();
      return;
    case 'check-assets':
      await checkAssets();
      return;
    case 'delete-task':
      await deleteTaskFlow(id);
      return;
    case 'trigger-file': {
      const input = document.getElementById('file-input');
      if (input) input.click();
      return;
    }
    case 'preview-file':
      await previewFile(id);
      return;
    case 'download-file':
      await downloadFile(id);
      return;
    case 'delete-file':
      await deleteFileFlow(id);
      return;
    case 'filter':
      state.filter = el.dataset.filter || 'all';
      await render({ scroll: false });
      return;
    case 'select-day':
      selectDay(el.dataset.day);
      return;
    case 'cal-prev':
      goMonth(-1);
      return;
    case 'cal-next':
      goMonth(1);
      return;
    case 'cal-today':
      state.viewMonth = new Date();
      state.selectedDay = startOfDay(Date.now());
      await render({ scroll: false });
      return;
    case 'back-tasks':
      location.hash = '#/tasks';
      return;
    case 'back-notes':
      location.hash = '#/notes';
      return;
    case 'back-task': {
      const note = state.notes.find((n) => n.id === state.editingNoteId);
      location.hash = note && note.taskId ? `#/task/${encodeURIComponent(note.taskId)}` : '#/notes';
      return;
    }
    case 'back-folder': {
      const note = state.notes.find((n) => n.id === state.editingNoteId);
      location.hash = note && note.folderId ? `#/folder/${encodeURIComponent(note.folderId)}` : '#/notes';
      return;
    }
    case 'toggle-pin':
      await togglePin(id);
      return;
    case 'delete-note':
      await deleteNoteFlow(id);
      return;
    case 'open-settings':
      openSettings();
      return;
    case 'export-backup':
      await exportBackup();
      return;
    case 'import-backup': {
      const input = document.getElementById('import-file');
      if (input) input.click();
      return;
    }
    case 'clear-all':
      await clearAllFlow();
      return;
    case 'persist-storage':
      await requestPersist();
      return;
    case 'force-update':
      await forceUpdate();
      return;
    case 'dismiss-hint':
      await dismissHint();
      return;
    case 'retry-boot':
      location.reload();
      return;
    default:
      return;
  }
}

/* ==========================================================================
   其他
   ========================================================================== */

function toast(message) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = translateText(String(message));
  root.appendChild(el);
  while (root.children.length > 3) root.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, 2200);
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname)) return;
  navigator.serviceWorker.register('./sw.js').catch((err) => {
    console.warn('Service Worker 注册失败：', err);
  });
}

boot();
