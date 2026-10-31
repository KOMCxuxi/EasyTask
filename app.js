// app.js — Pixel Notes 前端主程序
// 纯前端、离线优先：资料全部存在 IndexedDB，附件存 blob，不需要任何伺服器。

import { db } from './db.js';
import { buildICS, icsFilename } from './ics.js';
import { renderMarkdown } from './md.js';
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
} from './util.js';

const MARK = './icons/mark.svg';

const CAT = {
  work: { label: '工作', color: '#4d9de0' },
  life: { label: '生活', color: '#3ddc97' },
  study: { label: '学习', color: '#ffd23f' },
  other: { label: '其他', color: '#a06cd5' },
};

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
  route: { name: 'tasks' },
  viewMonth: new Date(),
  selectedDay: startOfDay(Date.now()),
  filter: 'all',
  query: { tasks: '', notes: '' },
  editingNoteId: null,
  noteMode: 'edit',
  noteModeId: null,
  theme: 'auto',
  urls: [],
  hintDismissed: false,
};

let modalStack = [];
let noteSaveTimer = null;
let dictation = null;

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
  button.setAttribute('aria-label', `主题：${THEME_LABEL[state.theme]}（点击切换）`);
  button.title = `主题：${THEME_LABEL[state.theme]}（点击切换）`;
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

async function boot() {
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
        <img class="mark" src="${MARK}" alt="">
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
  registerSW();
}

async function loadData() {
  const [tasks, notes, files] = await Promise.all([db.tasksAll(), db.notesAll(), db.filesAll()]);
  state.tasks = tasks || [];
  state.notes = notes || [];
  state.files = files || [];
}

/** 第一次打开时放几个示例，方便马上看到效果 */
async function seedIfNeeded() {
  if (await db.metaGet('seeded')) return;

  const today = startOfDay(Date.now());
  const at = (dayOffset, hour, minute) => {
    const d = addDays(today, dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
  };
  const now = Date.now();

  const t1 = {
    id: uid(), title: '欢迎使用：点开这个任务',
    startAt: at(0, 9, 0), endAt: at(0, 10, 0),
    cat: 'work', done: 0, createdAt: now, updatedAt: now,
  };
  const t2 = {
    id: uid(), title: '整理这周的待办',
    startAt: at(0, 14, 0), endAt: at(0, 15, 30),
    cat: 'life', done: 0, createdAt: now, updatedAt: now,
  };
  const t3 = {
    id: uid(), title: '周末采购清单',
    startAt: at(1, 11, 0), endAt: at(1, 12, 0),
    cat: 'other', done: 0, createdAt: now, updatedAt: now,
  };
  const n1 = {
    id: uid(), taskId: t1.id, title: '这个任务里的笔记',
    body: '每个任务都能有自己的笔记和附件。\n\n点「＋ 任务笔记」再写一则；点「＋ 附件」把照片或文件放进来。\n资料只存在这台装置，记得偶尔到设置里汇出备份。',
    pinned: 0, createdAt: now, updatedAt: now,
  };
  const n2 = {
    id: uid(), taskId: null, title: '灵感速记',
    body: '独立备忘录放在这里：\n- 想看的书\n- 想买的东西\n- 随手记下的一句话',
    pinned: 1, createdAt: now, updatedAt: now,
  };

  for (const task of [t1, t2, t3]) await db.taskPut(task);
  for (const note of [n1, n2]) await db.notePut(note);
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
  if (name === 'tasks' || name === 'calendar' || name === 'notes') return { name };
  if (name === 'new') return { name: 'new', params: new URLSearchParams(queryPart) };
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
  return preset;
}

function updateTabs(route) {
  const map = { tasks: 'tasks', task: 'tasks', calendar: 'calendar', notes: 'notes', note: 'notes' };
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
    state.noteMode = 'edit';
    state.noteModeId = null;
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
  state.route = viewRoute;
  updateTabs(viewRoute);
  revokeUrls();

  let html = '';
  try {
    if (viewRoute.name === 'tasks') html = renderTasks();
    else if (viewRoute.name === 'calendar') html = renderCalendar();
    else if (viewRoute.name === 'notes') html = renderNotes();
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
    const show =
      viewRoute.name === 'tasks' || viewRoute.name === 'calendar' || viewRoute.name === 'notes';
    fab.hidden = !show;
    fab.dataset.act =
      viewRoute.name === 'notes' ? 'new-note' : viewRoute.name === 'calendar' ? 'new-task-day' : 'new-task';
    fab.setAttribute('aria-label', viewRoute.name === 'notes' ? '新增备忘录' : '新增任务');
  }

  postRender(viewRoute);

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
    setSaveState('✓ 已储存');
    if (!note.title && !note.body) {
      const title = document.getElementById('note-title');
      if (title) setTimeout(() => title.focus({ preventScroll: true }), 90);
    }
  }
}

/* ---------- 共用片段 ---------- */

function emptyState(title, text) {
  return `<div class="empty">
    <img class="mark" src="${MARK}" alt="">
    <h2>${esc(title)}</h2>
    <p>${esc(text)}</p>
  </div>`;
}

function notFoundPage(message, href) {
  return `<section class="page"><div class="empty">
    <img class="mark" src="${MARK}" alt="">
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

function renderTasks() {
  return `<section class="page">
    <div class="page-head">
      <div>
        <h1>待办</h1>
        <p class="sub" id="task-sub">${esc(taskSummary())}</p>
      </div>
      <button class="btn btn-primary" type="button" data-act="new-task">＋ 新任务</button>
    </div>
    ${installHintHTML()}
    <div class="toolbar">
      <div class="search-wrap">
        <span class="search-ico" aria-hidden="true">⌕</span>
        <input id="task-search" class="input" type="search" placeholder="搜索任务或笔记…" value="${esc(state.query.tasks)}" autocomplete="off">
      </div>
      <div class="chips">
        ${FILTERS.map(([key, label]) => `<button class="chip ${state.filter === key ? 'on' : ''}" type="button" data-act="filter" data-filter="${key}">${label}</button>`).join('')}
      </div>
    </div>
    <div id="task-list">${taskListHTML()}</div>
  </section>`;
}

function taskSummary() {
  return `${state.tasks.length} 项 · ${state.tasks.filter((t) => !t.done).length} 项未完成`;
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

function taskListHTML() {
  const query = state.query.tasks.trim().toLowerCase();
  const { noteCount, fileCount, noteText } = buildCountMaps();
  const todayKey = dayKey(Date.now());
  const now = Date.now();

  const filtered = state.tasks.filter((t) => {
    if (state.filter === 'undone' && t.done) return false;
    if (state.filter === 'done' && !t.done) return false;
    if (state.filter === 'today' && dayKey(t.startAt) !== todayKey) return false;
    if (query) {
      const haystack = `${t.title} ${noteText[t.id] || ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
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

  let html = '';
  if (state.filter !== 'done') {
    if (overdueList.length) {
      html += `<div class="group overdue-group">
        <div class="group-head">
          <span>逾期</span><span class="line"></span><span class="count">${overdueList.length}</span>
          <button class="btn tiny btn-danger" type="button" data-act="clear-overdue">全部删除</button>
        </div>
        ${overdueList
          .map((t) => taskRowHTML(t, noteCount, fileCount, { quickDelete: true }))
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
          ${rows.map((t) => taskRowHTML(t, noteCount, fileCount)).join('')}
        </div>`;
      }
    } else if (!overdueList.length) {
      html += emptyState('没有未完成的任务', '按「＋ 新任务」开始记录，或换个筛选条件看看。');
    }

    if (done.length) {
      html += `<div class="group">
        <div class="group-head"><span>已完成</span><span class="line"></span><span class="count">${done.length}</span></div>
        ${done.map((t) => taskRowHTML(t, noteCount, fileCount)).join('')}
      </div>`;
    }
  } else {
    html += done.length
      ? done.map((t) => taskRowHTML(t, noteCount, fileCount)).join('')
      : emptyState('还没有已完成的任务', '完成任务后会自动收在这里。');
  }

  return html;
}

function taskRowHTML(task, noteCount, fileCount, opts = {}) {
  const c = catOf(task.cat);
  const overdue = isOverdue(task);
  const trailing = opts.quickDelete
    ? `<button class="row-del" type="button" data-act="delete-task-quick" data-id="${task.id}" aria-label="删除任务" title="删除任务">×</button>`
    : '<span class="chev" aria-hidden="true">›</span>';
  return `<div class="task-row ${task.done ? 'done' : ''}" style="--c:${c.color}" data-act="open-task" data-id="${task.id}" role="button" tabindex="0">
    <button class="check ${task.done ? 'on' : ''}" type="button" data-act="toggle-task" data-id="${task.id}" aria-label="${task.done ? '标记为未完成' : '标记为完成'}">✓</button>
    <div class="t-body">
      <div class="t-title">${esc(task.title)}</div>
      <div class="t-meta">
        <span class="dot" style="--c:${c.color}"></span>
        <span class="mono">${esc(fmtRange(task.startAt, task.endAt))}</span>
        <span class="dim">${esc(c.label)}</span>
        ${overdue ? '<span class="badge warn">逾期</span>' : ''}
        ${fileCount[task.id] ? `<span class="badge">附件 ${fileCount[task.id]}</span>` : ''}
        ${noteCount[task.id] ? `<span class="badge">笔记 ${noteCount[task.id]}</span>` : ''}
      </div>
    </div>
    ${trailing}
  </div>`;
}

function updateTaskList() {
  const list = document.getElementById('task-list');
  if (!list) return;
  list.innerHTML = taskListHTML();
  const sub = document.getElementById('task-sub');
  if (sub) sub.textContent = taskSummary();
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

  const weekHead = ['一', '二', '三', '四', '五', '六', '日']
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
        <p class="sub">${esc(fmtDateCN(state.selectedDay))} · ${dayTasks.length} 项</p>
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
    <span class="agenda-title">${esc(task.title)}</span>
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

function renderNotes() {
  const standalone = state.notes.filter((n) => !n.taskId);
  return `<section class="page">
    <div class="page-head">
      <div>
        <h1>备忘录</h1>
        <p class="sub" id="note-sub">${standalone.length} 则 · 独立笔记</p>
      </div>
      <button class="btn btn-primary" type="button" data-act="new-note">＋ 新备忘</button>
    </div>
    <div class="toolbar">
      <div class="search-wrap">
        <span class="search-ico" aria-hidden="true">⌕</span>
        <input id="note-search" class="input" type="search" placeholder="搜索备忘…" value="${esc(state.query.notes)}" autocomplete="off">
      </div>
    </div>
    <div id="note-list">${noteListHTML()}</div>
  </section>`;
}

function noteListHTML() {
  const query = state.query.notes.trim().toLowerCase();
  const list = state.notes
    .filter((n) => !n.taskId)
    .filter((n) => {
      if (!query) return true;
      return `${n.title} ${n.body}`.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      if (Boolean(b.pinned) !== Boolean(a.pinned)) return b.pinned - a.pinned;
      return b.updatedAt - a.updatedAt;
    });

  if (!list.length) {
    return emptyState('还没有备忘录', '按「＋ 新备忘」随手记点什么。');
  }
  return list.map((n) => noteRowHTML(n, true)).join('');
}

function noteRowHTML(note, showPin) {
  return `<div class="note-row" role="button" tabindex="0" data-act="open-note" data-id="${note.id}">
    <div class="note-row-head">
      <span class="n-title">${esc(note.title || '无标题笔记')}</span>
      ${showPin && note.pinned ? '<span class="badge">置顶</span>' : ''}
    </div>
    <div class="n-prev">${esc(notePreview(note))}</div>
    <div class="n-time">${esc(fmtUpdated(note.updatedAt))}</div>
  </div>`;
}

function updateNoteList() {
  const list = document.getElementById('note-list');
  if (!list) return;
  list.innerHTML = noteListHTML();
  const sub = document.getElementById('note-sub');
  if (sub) sub.textContent = `${state.notes.filter((n) => !n.taskId).length} 则 · 独立笔记`;
}

/* ---------- 笔记编辑器 ---------- */

function renderNoteEditor(id) {
  const note = state.notes.find((n) => n.id === id);
  if (!note) return notFoundPage('这则笔记不存在', '#/notes');

  state.editingNoteId = note.id;
  const backAct = note.taskId ? 'back-task' : 'back-notes';
  const backLabel = note.taskId ? '‹ 任务' : '‹ 备忘';
  const preview = state.noteMode === 'preview' && state.noteModeId === note.id;
  const previewHtml = renderMarkdown(note.body) || '<p class="empty-inline">这则笔记还是空的，按「✎ 编辑」开始写。</p>';

  return `<section class="editor">
    <div class="editor-bar">
      <button class="btn tiny" type="button" data-act="${backAct}">${backLabel}</button>
      <span class="save-state" id="save-state">已储存</span>
      <span class="spacer"></span>
      <button class="btn tiny" type="button" data-act="toggle-preview">${preview ? '✎ 编辑' : '👁 预览'}</button>
      ${note.taskId ? '' : `<button class="btn tiny" type="button" data-act="toggle-pin" data-id="${note.id}">${note.pinned ? '取消置顶' : '置顶'}</button>`}
      <button class="btn tiny btn-danger" type="button" data-act="delete-note" data-id="${note.id}">删除</button>
    </div>
    ${preview
      ? ''
      : `<div class="md-toolbar" role="toolbar" aria-label="笔记格式工具">
      <button class="tool" type="button" data-act="md-insert" data-md="bold" title="粗体" aria-label="粗体">B</button>
      <button class="tool" type="button" data-act="md-insert" data-md="italic" title="斜体" aria-label="斜体"><em>I</em></button>
      <button class="tool" type="button" data-act="md-insert" data-md="heading" title="标题" aria-label="标题">H</button>
      <button class="tool" type="button" data-act="md-insert" data-md="list" title="清单" aria-label="清单">•</button>
      <button class="tool" type="button" data-act="md-insert" data-md="task" title="待办" aria-label="待办清单">☐</button>
      <button class="tool" type="button" data-act="md-insert" data-md="table" title="插入表格" aria-label="插入表格">▦</button>
      <button class="tool" type="button" data-act="md-insert" data-md="quote" title="引用" aria-label="引用">❝</button>
      <button class="tool" type="button" data-act="md-insert" data-md="code" title="程式码" aria-label="程式码">‹›</button>
      <span class="spacer"></span>
      <button class="tool" id="btn-dictate" type="button" data-act="dictate-note" title="语音输入（iOS 请用键盘上的 🎤 听写）" aria-label="语音输入">🎤</button>
    </div>`}
    <input id="note-title" class="note-title" type="text" placeholder="标题" value="${esc(note.title)}" autocomplete="off">
    ${preview
      ? `<div class="md-preview" id="note-preview">${previewHtml}</div>`
      : `<textarea id="note-body" class="note-body" placeholder="开始输入… 支援 Markdown：**粗体**、- 清单、| 表格 |" spellcheck="false">${esc(note.body)}</textarea>`}
    <div class="editor-foot">
      <span id="note-count">${charCount(note.body)} 字</span>
      <div class="foot-right">
        <span class="md-hint">${isIOS() ? '语音：用键盘 🎤 听写' : '支援 Markdown 与表格'}</span>
        <span id="note-updated">更新于 ${esc(fmtUpdated(note.updatedAt))}</span>
      </div>
    </div>
  </section>`;
}

/** 在文字游标处插入 Markdown 样板 */
function mdInsert(kind) {
  const textarea = document.getElementById('note-body');
  if (!textarea) return;
  const start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : textarea.value.length;
  const end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : start;
  const selected = textarea.value.slice(start, end);

  let insert = '';
  switch (kind) {
    case 'bold':
      insert = `**${selected || '粗体'}**`;
      break;
    case 'italic':
      insert = `*${selected || '斜体'}*`;
      break;
    case 'heading':
      insert = `## ${selected || '标题'}`;
      break;
    case 'quote':
      insert = (selected || '引用')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      break;
    case 'list':
      insert = (selected || '项目一\n项目二')
        .split('\n')
        .map((line) => `- ${line}`)
        .join('\n');
      break;
    case 'task':
      insert = (selected || '待办一\n待办二')
        .split('\n')
        .map((line) => `- [ ] ${line}`)
        .join('\n');
      break;
    case 'code':
      insert = selected ? `\`${selected}\`` : '```\n\n```';
      break;
    case 'table':
      insert = '| 项目 | 内容 | 备注 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |';
      break;
    default:
      return;
  }

  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  textarea.value = `${before}${insert}${after}`;
  const caret = before.length + insert.length;
  textarea.focus();
  textarea.setSelectionRange(caret, caret);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 编辑 / 预览切换 */
async function togglePreview() {
  if (state.editingNoteId) {
    await saveNoteNow();
    const id = state.editingNoteId;
    const isPreview = state.noteMode === 'preview' && state.noteModeId === id;
    state.noteMode = isPreview ? 'edit' : 'preview';
    state.noteModeId = isPreview ? null : id;
  }
  await render({ scroll: false });
  if (state.noteMode === 'edit') {
    const body = document.getElementById('note-body');
    if (body) setTimeout(() => body.focus({ preventScroll: true }), 60);
  }
}

/** 语音输入：支援的浏览器直接用 SpeechRecognition；iOS 上提示用系统键盘听写 */
function dictateNote(button) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    const textarea = document.getElementById('note-body');
    if (textarea) textarea.focus();
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
    if (!finalText) return;
    const field = document.getElementById('note-body');
    if (!field) return;
    const position = field.selectionStart ?? field.value.length;
    field.value = `${field.value.slice(0, position)}${finalText}${field.value.slice(position)}`;
    const caret = position + finalText.length;
    field.setSelectionRange(caret, caret);
    field.dispatchEvent(new Event('input', { bubbles: true }));
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
  if (el) el.textContent = text;
}

function updateEditorFoot(note) {
  const count = document.getElementById('note-count');
  const updated = document.getElementById('note-updated');
  if (count) count.textContent = `${charCount(note.body)} 字`;
  if (updated) updated.textContent = `更新于 ${fmtUpdated(note.updatedAt)}`;
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
  const bodyEl = document.getElementById('note-body');
  let changed = false;
  if (titleEl && note.title !== titleEl.value) {
    note.title = titleEl.value;
    changed = true;
  }
  if (bodyEl && note.body !== bodyEl.value) {
    note.body = bodyEl.value;
    changed = true;
  }
  if (!changed) {
    setSaveState('✓ 已储存');
    return;
  }
  note.updatedAt = Date.now();
  try {
    await db.notePut(note);
    setSaveState('✓ 已储存');
    updateEditorFoot(note);
  } catch (err) {
    console.error(err);
    setSaveState('储存失败');
    toast('笔记储存失败：' + err.message);
  }
}

async function createNote(taskId) {
  const now = Date.now();
  const note = {
    id: uid(),
    taskId: taskId || null,
    title: '',
    body: '',
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
    location.hash = note.taskId ? `#/task/${encodeURIComponent(note.taskId)}` : '#/notes';
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

  return `<section class="page detail">
    <div class="detail-top">
      <button class="btn tiny" type="button" data-act="back-tasks">‹ 待办</button>
      <span class="badge ${task.done ? 'ok' : ''}">${task.done ? '已完成' : '进行中'}</span>
    </div>
    <h1 class="detail-title ${task.done ? 'done' : ''}">${esc(task.title)}</h1>
    <div class="chips meta-chips">
      <span class="chip static"><span class="dot" style="--c:${c.color}"></span>${esc(c.label)}</span>
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
      ${notes.length ? `<div class="notes">${notes.map((n) => noteRowHTML(n, false)).join('')}</div>` : '<p class="empty-inline">在任务里写笔记，回头一看就懂。</p>'}
    </section>

    <section class="panel danger">
      <div class="panel-head"><h2>危险区</h2></div>
      <p class="hint" style="margin-bottom:10px">删除任务会一并删除它的 ${notes.length} 则笔记和 ${files.length} 个附件，无法还原。</p>
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
      <div class="f-name" title="${esc(meta.name)}">${esc(meta.name)}</div>
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
    location.hash = '#/tasks';
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
  const list = state.tasks.filter((t) => isOverdue(t));
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
      <div class="dur-line"><span id="f-dur">时长 ${esc(fmtDuration((endAt - startAt) / 60000))}</span><span class="warn-text" id="f-warn"></span></div>
      <div class="dur-chips">
        <button class="btn tiny" type="button" data-act="set-dur" data-dur="30">30 分</button>
        <button class="btn tiny" type="button" data-act="set-dur" data-dur="60">1 小时</button>
        <button class="btn tiny" type="button" data-act="set-dur" data-dur="90">1.5 小时</button>
        <button class="btn tiny" type="button" data-act="set-dur" data-dur="120">2 小时</button>
      </div>
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
    durEl.textContent = '时长 —';
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
  durEl.textContent = `时长 ${fmtDuration(minutes)}`;
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
      <div class="modal-head"><h2>${esc(title)}</h2></div>
      <p class="hint" style="margin-bottom:14px">${esc(message)}</p>
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
      <p class="hint">Pixel Notes v1.1 · 离线优先，不需要网络。</p>
      <button class="btn" type="button" data-act="force-update">检查更新（清除快取）</button>
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
  return `${base}#/new?title={标题}&date={YYYY-MM-DD}&start={HH:mm}`;
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
      el.textContent = '这个浏览器不支援储存空间查询。';
      return;
    }
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    el.textContent = `已用 ${humanSize(usage)}${quota ? ` / 可用约 ${humanSize(quota)}` : ''}${persisted ? ' · 已持久化' : ' · 未持久化'}`;
  } catch (err) {
    el.textContent = '无法读取储存资讯。';
  }
}

async function requestPersist() {
  const info = document.getElementById('persist-info');
  if (!navigator.storage || !navigator.storage.persist) {
    if (info) info.textContent = '这个浏览器不支援持久化储存。';
    return;
  }
  try {
    const ok = await navigator.storage.persist();
    if (info) info.textContent = ok ? '✓ 已获得持久化储存' : '未授予。iOS 上通常要先「加到主画面」再申请。';
    toast(ok ? '已获得持久化储存' : '未授予持久化储存');
    await fillStorageInfo();
  } catch (err) {
    if (info) info.textContent = '申请失败：' + err.message;
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
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: state.tasks,
      notes: state.notes,
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
    const payload = { tasks: data.tasks, notes: data.notes || [], files: [] };
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
    const target = event.target.closest('[data-act]');
    if (!target) return;
    if (target.tagName === 'A' && !target.dataset.act) return;
    event.preventDefault();
    onAction(target.dataset.act, target).catch((err) => {
      console.error(err);
      toast('操作失败：' + err.message);
    });
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
    case 'new-note':
      await createNote(null);
      return;
    case 'add-note':
      await createNote(id);
      return;
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
    case 'md-insert':
      mdInsert(el.dataset.md || 'bold');
      return;
    case 'toggle-preview':
      await togglePreview();
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
  el.textContent = message;
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
