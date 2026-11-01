// i18n.js — 介面語言：English（預設）/ 香港繁體中文
// 程式碼保留中文原文，渲染後由 translateDom() 換成目標語言；使用者內容用 data-raw 標記。
export const LANGS = [['en', 'English'], ['zh-Hant', '繁體中文']];
const LANG_KEY = 'pixel-notes-lang';
let current = 'en';

export const getLang = () => current;
export const isZh = () => current === 'zh-Hant';
export function initLang() {
  let saved = 'en';
  try { saved = localStorage.getItem(LANG_KEY) || 'en'; } catch (err) { /* ignore */ }
  current = LANGS.some(([id]) => id === saved) ? saved : 'en';
}
export function setLang(lang) {
  current = LANGS.some(([id]) => id === lang) ? lang : 'en';
  try { localStorage.setItem(LANG_KEY, current); } catch (err) { /* ignore */ }
}

const HK_PHRASES = [
  ['设置', '設定'], ['文件', '檔案'], ['网络', '網絡'], ['信息', '資訊'], ['软件', '軟件'],
  ['默认', '預設'], ['保存', '儲存'], ['视频', '影片'], ['复制', '複製'], ['搜索', '搜尋'],
  ['支持', '支援'], ['鼠标', '滑鼠'], ['屏幕', '螢幕'], ['标签', '標籤'], ['计划', '計劃'],
  ['打印', '列印'], ['后台', '後台'], ['关系', '關係'], ['这里', '這裡'], ['里面', '裡面'],
  ['哪里', '哪裡'], ['台', '臺'], ['裏', '裡'],
];

const HANT_PAIRS = (
  '们們 个個 为為 这這 说說 时時 间間 关關 开開 门門 问問 题題 头頭 长長 见見 现現 实實 际際 场場 处處 ' +
  '务務 专專 项項 页頁 标標 签簽 资資 夹夾 档檔 汇匯 储儲 设設 记記 笔筆 历曆 览覽 视視 检檢 验驗 语語 ' +
  '读讀 写寫 输輸 图圖 画畫 录錄 权權 边邊 达達 过過 运運 还還 进進 远遠 选選 择擇 种種 类類 别別 统統 ' +
  '级級 线線 网網 络絡 软軟 体體 电電 脑腦 频頻 单單 张張 双雙 号號 码碼 术術 报報 备備 复復 杂雜 简簡 ' +
  '显顯 隐隱 应應 该該 与與 于於 后後 发發 变變 决決 确確 认認 识識 觉覺 岁歲 动動 态態 无無 数數 据據 ' +
  '库庫 删刪 错錯 误誤 传傳 讯訊 听聽 声聲 响響 启啟 闭閉 质質 办辦 链鏈 载載 转轉 蓝藍 绿綠 黄黃 么麼 ' +
  '义義 习習 乡鄉 书書 买買 卖賣 云雲 亚亞 产產 亲親 亿億 仅僅 从從 仓倉 仪儀 价價 众眾 优優 会會 伤傷 ' +
  '余餘 侠俠 侣侶 侦偵 侧側 债債 倾傾 偿償 儿兒 党黨 兰蘭 兴興 养養 兽獸 内內 冈岡 军軍 农農 冯馮 冲衝 ' +
  '况況 冻凍 净淨 准準 凉涼 减減 凑湊 划劃 则則 刚剛 创創 剧劇 劝勸 劳勞 势勢 勋勳 匀勻 区區 医醫 华華 ' +
  '协協 卫衛 厂廠 厅廳 厉厲 压壓 厌厭 县縣 参參 叙敘 叠疊 叹嘆 吓嚇 吗嗎 吨噸 吴吳 吕呂 员員 呛嗆 呜嗚 ' +
  '咏詠 哑啞 哗嘩 唤喚 啸嘯 喷噴 团團 园園 围圍 圆圓 圣聖 坏壞 块塊 坚堅 坛壇 坝壩 坟墳 垄壟 垒壘 垦墾'
).split(' ');

const HANT_MAP = {};
for (const pair of HANT_PAIRS) {
  if (pair.length === 2) HANT_MAP[pair[0]] = pair[1];
}

export function toHant(text) {
  let out = String(text);
  for (const [from, to] of HK_PHRASES) out = out.split(from).join(to);
  let converted = '';
  for (const ch of out) converted += HANT_MAP[ch] || ch;
  return converted;
}

const EN = {
  '待办': 'Tasks', '日历': 'Calendar', '备忘': 'Notes', '设置': 'Settings', '主题': 'Theme',
  '全部': 'All', '未完成': 'Open', '已完成': 'Done', '今天': 'Today', '明天': 'Tomorrow',
  '昨天': 'Yesterday', '逾期': 'Overdue', '全部任务': 'All tasks', '全部笔记': 'All notes',
  '全部删除': 'Delete all', '＋ 新任务': '+ New task', '＋ 新专案': '+ New project',
  '＋ 新备忘': '+ New note', '＋ 新资料夹': '+ New folder', '＋ 这天': '+ This day',
  '‹ 专案': '‹ Projects', '‹ 资料夹': '‹ Folders', '‹ 备忘': '‹ Notes', '‹ 任务': '‹ Task',
  '排序': 'Sort', '完成': 'Done', '封存': 'Archive', '取消封存': 'Unarchive', '已封存': 'Archived',
  '全部专案': 'All projects', '未分类': 'Unsorted', '编辑': 'Edit', '删除': 'Delete',
  '储存': 'Save', '保存': 'Save', '取消': 'Cancel', '关闭': 'Close', '确定': 'OK',
  '重新载入': 'Reload', '汇出': 'Export', '移动': 'Move', '复制': 'Copy', '复制链接': 'Copy link',
  '下载': 'Download', '预览': 'Preview', '专案': 'Project', '资料夹': 'Folder', '分类': 'Category',
  '提醒': 'Reminder', '附件': 'Attachments', '笔记': 'Notes', '任务笔记': 'Task notes',
  '危险区': 'Danger zone', '进行中': 'In progress', '标记完成': '✓ Mark done',
  '标记未完成': '↺ Mark open', '编辑任务': 'Edit task', '新任务': 'New task',
  '建立任务': 'Create task', '删除任务': 'Delete task', '删除这个任务': 'Delete this task',
  '删除专案': 'Delete project', '删除资料夹': 'Delete folder', '删除笔记': 'Delete note',
  '标题': 'Title', '日期': 'Date', '开始': 'Start', '结束': 'End', '外观': 'Appearance',
  '语言': 'Language', '储存空间': 'Storage', '申请持久化储存': 'Request persistent storage',
  '系统日历': 'System calendar', '备份与还原': 'Backup & restore', '汇出备份 JSON': 'Export backup JSON',
  '汇入备份': 'Import backup', 'iOS 捷径': 'iOS Shortcuts', '应用': 'App',
  '检查更新（清除快取）': 'Check for updates (clear cache)', '部署检查': 'Deployment check',
  '检查档案': 'Check files', '清空全部资料': 'Erase all data', '全部档案都在 ✓': 'All files found ✓',
  '检查中…': 'Checking…', '读取中…': 'Loading…', '加到主画面': 'Add to Home Screen',
  '知道了': 'Got it', '还没有专案': 'No projects yet', '还没有备忘录': 'No notes yet',
  '还没有已完成的任务': 'No completed tasks yet', '没有符合的任务': 'No matching tasks',
  '没有符合的笔记': 'No matching notes', '这个专案还没有任务': 'No tasks in this project yet',
  '这个资料夹还没有笔记': 'No notes in this folder yet', '没有可汇出的任务': 'No tasks to export',
  '没有待办任务': 'No open tasks', '已储存': '✓ Saved', '• 未储存': '• Unsaved',
  '储存失败': 'Save failed', '语音输入': 'Voice input', '汇出笔记': 'Export note',
  '移动到资料夹': 'Move to folder', '插入表格': 'Insert table', '行数': 'Rows', '栏数': 'Columns',
  '插入': 'Insert', '表格': 'Table', '＋行': '+ Row', '＋栏': '+ Column', '删表格': 'Delete table',
  '粗体': 'Bold', '斜体': 'Italic', '下划线': 'Underline', '大标题': 'Heading',
  '项目符号': 'Bullet list', '编号清单': 'Numbered list', '待办清单': 'Checklist', '分隔线': 'Divider',
  '新专案': 'New project', '编辑专案': 'Edit project', '名称': 'Name',
  '例如：工作、部落格、装修': 'e.g. Work, Blog, Renovation', '颜色': 'Color',
  '建立专案': 'Create project', '新资料夹': 'New folder', '编辑资料夹': 'Edit folder',
  '例如：灵感、工作、读书': 'e.g. Ideas, Work, Reading', '建立资料夹': 'Create folder',
  '蓝': 'Blue', '绿': 'Green', '黄': 'Yellow', '紫': 'Purple', '橙': 'Orange',
  '工作': 'Work', '生活': 'Life', '学习': 'Study', '其他': 'Other', '不提醒': 'No reminder',
  '准时': 'On time', '提前 5 分钟': '5 min before', '提前 10 分钟': '10 min before',
  '提前 30 分钟': '30 min before', '提前 1 小时': '1 hour before', '提前 2 小时': '2 hours before',
  'Markdown (.md)': 'Markdown (.md)', '纯文本 (.txt)': 'Plain text (.txt)', '网页 (.html)': 'Web page (.html)',
  'PDF（列印 / 存到文件）': 'PDF (Print / Save to Files)', '开始输入…': 'Start typing…',
  '搜寻任务或笔记…': 'Search tasks or notes…', '搜寻所有笔记…': 'Search all notes…',
  '上个月': 'Previous month', '下个月': 'Next month', '时长 —': 'Duration —',
  '今天没有任务）': 'No tasks today.)', '已删除任务': 'Task deleted', '已删除笔记': 'Note deleted',
  '已删除附件': 'Attachment deleted', '已移动笔记': 'Note moved', '已汇出笔记': 'Note exported',
  '已汇出备份': 'Backup exported', '已还原备份': 'Backup restored', '已清空资料': 'All data erased',
  '已建立专案': 'Project created', '已更新专案': 'Project updated',
  '已删除专案，任务已移到未分类': 'Project deleted; tasks moved to Unsorted',
  '已封存专案': 'Project archived', '已取消封存': 'Project unarchived',
  '已建立资料夹': 'Folder created', '已更新资料夹': 'Folder updated',
  '已删除资料夹，笔记已移到未分类': 'Folder deleted; notes moved to Unsorted',
  '已置顶': 'Pinned', '已取消置顶': 'Unpinned', '已获得持久化储存': 'Persistent storage granted',
  '未授予持久化储存': 'Persistent storage not granted',
  '这个浏览器不支援持久化储存。': 'This browser does not support persistent storage.',
  '这个浏览器不支援储存空间查询。': 'Storage usage is not available in this browser.',
  '无法读取储存资讯。': 'Could not read storage info.',
  '已复制今日清单': 'Today’s list copied', '已复制捷径链接': 'Shortcut link copied',
  '没有逾期任务': 'No overdue tasks', '找不到附件内容': 'Attachment content not found',
  '这个文件类型无法预览，请下载后用其他 App 打开': 'This file type cannot be previewed. Download it and open it in another app.',
  '这个浏览器不支持列印，请改用 HTML 汇出': 'This browser cannot print; use HTML export instead.',
  '开始听写…说完再点一次停止': 'Listening… tap again to stop',
  'iOS Safari 不开放网页语音识别，请用键盘上的「🎤」系统听写': 'Safari on iOS does not expose speech recognition. Use the 🎤 dictation key on the keyboard.',
  '提醒会写进汇出的日历文件，由系统日历执行；App 本身不会在背景通知。': 'Reminders are written into the exported calendar file and handled by the system calendar. The app itself cannot notify in the background.',
  '{n} 项 · {m} 项未完成': '{n} total · {m} open', '{n} 则': '{n} note(s)',
  '{n} 则 · {m} 个资料夹': '{n} note(s) · {m} folder(s)', '{n} 个逾期任务': '{n} overdue task(s)',
  '附件 {n}': 'Files {n}', '笔记 {n}': 'Notes {n}', '有 {n} 个逾期任务': '{n} overdue task(s)',
  '{n} 项': '{n} task(s)', '{n} 字': '{n} chars', '更新于 {time}': 'Updated {time}',
  '时长 {value}': 'Duration {value}', '主题：{name}（点击切换）': 'Theme: {name} (tap to switch)',
  '「{title}」会下载到「文件」App。': '“{title}” will download to the Files app.',
  '已用 {used}{quota}{persist}': 'Used {used}{quota}{persist}',
  ' / 可用约 {q}': ' / ~{q} available', ' · 已持久化': ' · persisted', ' · 未持久化': ' · not persisted',
  '申请失败：{msg}': 'Request failed: {msg}',
  '删除任务会一并删除它的 {notes} 则笔记和 {files} 个附件，无法还原。': 'This will also delete its {notes} note(s) and {files} attachment(s). This cannot be undone.',
  '⇩ 汇出': '⇩ Export', '置顶': 'Pin', '✓ 已储存': '✓ Saved', '支援表格、清单与粗体': 'Tables, lists & bold',
  '保留标题、清单与表格，方便搬到别的笔记软体': 'Keeps headings, lists and tables for moving to another notes app',
  '只要文字，任何地方都能打开': 'Plain text — opens anywhere',
  '保留格式，可用浏览器打开或印成 PDF': 'Keeps formatting; open in a browser or print to PDF',
  '打开系统列印对话框，可存成 PDF 或直接印出来': 'Opens the system print dialog; save as PDF or print',
  '✓ 标记完成': '✓ Mark done', '✎ 编辑': '✎ Edit', '＋ 任务笔记': '+ Task note', '＋ 附件': '+ Attachments',
  '📅 加入日历': '📅 Add to calendar',
  '把和这个任务相关的文件放在这里，存在这台装置上。': 'Put files related to this task here — they stay on this device.',
  '30 分': '30m', '1 小时': '1h', '1.5 小时': '1.5h', '2 小时': '2h',
  '跟随系统': 'System', '浅色': 'Light', '深色': 'Dark',
  '「跟随系统」会随 iOS 的深色模式自动切换。': '“System” follows the iOS dark mode setting.',
  '把任务导出成 .ics（含提醒闹钟），下载后到「文件」App 点开，选「加入日历」。之后由系统日历在本机提醒，不需要服务器。': 'Export tasks as .ics (with reminder alarms), open the file in the Files app and choose “Add to Calendar”. The system calendar then reminds you locally — no server needed.',
  '导出全部未完成任务': 'Export all open tasks', '复制今日清单': 'Copy today’s list',
  '任务改动后再导出一次即可；建议汇入到专门的「Pixel Notes」日历，方便清掉重来。': 'Re-export after changes. Import into a dedicated “Pixel Notes” calendar so you can clear it easily.',
  '资料只存在这台装置。换装置或清除浏览器资料前，记得先汇出备份。': 'Data lives only on this device. Export a backup before switching devices or clearing website data.',
  '在「快捷指令」里用「打开网址」呼叫下面的链接，就能快速新建任务（可预填标题、日期、开始时间、分类）。': 'In Shortcuts, use “Open URL” with the link below to create a task quickly (title, date, start time and category can be pre-filled).',
  '参数：': 'Parameters: ', '（分钟，或': ' (minutes, or ',
  'Pixel Notes v1.5 · 离线优先，不需要网络。': 'Pixel Notes v1.5 · offline-first, no network needed.',
  '品牌图示或主画面图标不见，通常是部署时漏传了': 'If the brand mark or home screen icon is missing, you probably forgot to upload',
  ' 资料夹。点一下检查所有档案是否都在。': ' folder. Tap to check that every file is there.',
  '资料夹。点一下检查所有档案是否都在。': ' folder. Tap to check that every file is there.',
  '清空全部任务、笔记与附件。': 'Erase all tasks, notes and attachments.',
  '笔记格式工具': 'Note formatting toolbar',
  '语音输入（iOS 请用键盘上的 🎤 听写）': 'Voice input (on iOS use the 🎤 dictation key)',
  '搜索任务或笔记…': 'Search tasks or notes…', '要做什么？': 'What needs doing?',
  '新增专案': 'New project', '新增任务': 'New task', '新增资料夹': 'New folder', '新增备忘录': 'New note',
  '标记为完成': 'Mark as done', '标记为未完成': 'Mark as open',
  '主选单': 'Main menu', 'Pixel Notes 首页': 'Pixel Notes home',
  '导出这天': 'Export this day', '语言已切换': 'Language switched',
  '今天的任务': 'Today’s tasks', '未授予。iOS 上通常要先「加到主画面」再申请。': 'Not granted. On iOS, add the app to the Home Screen first, then try again.',
  '✓ 已获得持久化储存': '✓ Persistent storage granted',
  '取消置顶': 'Unpin', '还没有笔记': 'No notes yet', '去处理': 'Review',
  '封存专案': 'Archive project', '取消封存专案': 'Unarchive project',
};

export function translateText(text) {
  const value = String(text ?? '');
  if (current === 'zh-Hant') return toHant(value);
  if (!/[\u4e00-\u9fff]/.test(value)) return value;
  return EN[value] || value;
}

export function tl(template, vars) {
  let out = translateText(String(template));
  if (vars) out = out.replace(/\{(\w+)\}/g, (match, key) => (vars[key] === undefined ? match : String(vars[key])));
  return out;
}

export function translateDom(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent) continue;
    if (parent.closest('[data-raw], script, style, textarea, [contenteditable="true"], #print-root')) continue;
    const raw = node.nodeValue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const translated = translateText(trimmed);
    if (translated !== trimmed) node.nodeValue = raw.replace(trimmed, translated);
  }
  for (const element of root.querySelectorAll('[placeholder], [title], [aria-label]')) {
    if (element.closest('[data-raw], #print-root')) continue;
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      const trimmed = value.trim();
      const translated = translateText(trimmed);
      if (translated !== trimmed) element.setAttribute(attr, value.replace(trimmed, translated));
    }
  }
}
