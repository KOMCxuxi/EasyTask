# Pixel Notes · 像素笔记

一个**离线优先**的 PWA：把「记事本 / 待办事项 / 日历」合成一个 App。
像素风 UI，资料全部存在本机（IndexedDB + 附件 blob），**不联网、不上传、不需要账号**。

> v1.3：
> - 待办多了**「专案」层**：专案（像资料夹，不设时间）→ 里面很多任务（各自有开始/结束时间，按时间排序）。
> - 备忘多了**「资料夹」**：笔记可以分资料夹，也能移动。
> - **每一则笔记都有「⇩ 汇出」**：可存成 Markdown / 纯文本 / 网页（.md / .txt / .html）。
> - 如果模块没载入，会显示「载入失败」跟缺哪个档案，不再是一片空白。
> - 资料库升级到 v2（自动建立 `projects` / `folders`，旧资料不受影响）。

---

## 功能

### 待办：专案 → 任务

- **待办首页**是专案卡片列表：每张卡有颜色、未完成/总数、下一个任务。
  - 固定会有「未分类」收纳还没放进专案的任务。
  - 右上角「全部任务」可以看跨专案的时间轴。
- **专案页**：专案里可新增任务（自动归这个专案）、编辑/改色/删除专案。任务按日期分组、组内按**开始时间排序**；逾期任务置顶，可单笔或全部删除。
- **任务**：日期、开始/结束时间（自动算时长 + 30 分 / 1 小时 / 1.5 小时 / 2 小时快捷钮）、分类、提醒、完成状态、专案。
- **任务详情**：这个任务的**附件**（多选上传、图片缩图、下载、删除）、**任务笔记**（富文本）、「📅 加入日历」（.ics + 提醒）。
- **删除专案**：里面的任务会移到「未分类」，不会被删掉。

### 备忘录：资料夹 + 富文本 + 汇出

- **备忘首页**是资料夹卡片：名称、笔记数、最后更新；固定「未分类」；可「全部笔记」跨资料夹搜索。
- **笔记编辑器**像 iOS 备忘录：**B / I / U / H / • / 1. / ☐ 待办 / ▦ 表格 / ― 分隔线**，格式直接显示；表格可「＋行 / ＋栏 / 删表格」；待办方块可点选。
- **汇出**：每则笔记都有「⇩ 汇出」（编辑器里、笔记列表每一列都有）：
  - **Markdown (.md)**：保留标题、清单、表格。
  - **纯文本 (.txt)**。
  - **网页 (.html)**：保留格式，可用浏览器打开或印成 PDF。
- 笔记可「移动到资料夹」；删除资料夹时笔记会移到「未分类」。

### 其他

- **日历**：月视图（周一开头）、当日议程、可导出当天 `.ics`；显示所有专案的任务。
- **主题**：跟随系统 / 浅色 / 深色，顶栏 ◐ 可切换。
- **提醒**：任务设「提前 5/10/30/60 分钟」，导出 `.ics` 后由 iOS 系统日历本机提醒（不需要服务器）。
- **iOS 捷径**：用 URL 预填新任务（可带专案），设置页可复制链接与今日清单。
- **备份**：JSON 汇出/汇入（含专案、资料夹、附件）。
- **部署检查**：设置里逐一确认 14 个工作档案（含 `icons/`）是否存在。
- **载入失败提示**：模块没载入时直接显示缺哪个档案，不再空白。

---

## 直接看截图

`tools/shots-clean/` 是干净的界面截图；`tools/shots/` 是端到端测试过程截图。

- `01-home.png` 专案首页
- `02-all-tasks.png` 全部任务
- `03-task-detail.png` 任务详情 + 附件
- `04-overdue.png` 逾期分组
- `05-project.png` 专案页
- `06-calendar.png` 日历
- `07-notes-home.png` 备忘资料夹
- `08-folder.png` 资料夹内的笔记列表（每列都有汇出按钮）
- `09-note-editor.png` 富文本编辑器
- `10-note-table.png` 编辑器里的表格
- `11-note-export.png` 笔记汇出选单
- `12-dark-home.png` 深色主题
- `13-ipad.png` iPad 版面

---

## 在电脑上先跑起来

这个 App 用了 ES modules 和 IndexedDB，**不能直接双击 `index.html`**（`file://` 会挡掉模块和储存），需要一个本机静态服务器：

```bash
cd pixel-notes
python3 -m http.server 8017
# 或：npx serve .
```

打开 <http://localhost:8017>。（`http://localhost` / `http://127.0.0.1` 都算安全来源，Service Worker 能注册。）

第一次打开会写入 3 个示例专案、2 个资料夹、4 个任务、3 则笔记；到「设置 → 清空全部资料」可清掉。

---

## 装到 iPhone / iPad 上（不需要 Mac、不需要上架）

PWA 要安装，必须先有一个 **HTTPS 网址**。免费静态托管都可以：

### 方案 A：GitHub Pages（iPad 上也能做完）

1. 在 GitHub 建一个 repository（例如 `pixel-notes`），设为 Public。
2. 进 repo → **Add file → Upload files**，把这个文件夹里的**所有文件**传上去：
   `index.html`、`styles.css`、`app.js`、`db.js`、`util.js`、`ics.js`、`md.js`、`richtext.js`、`sw.js`、`manifest.webmanifest`、`README.md`，以及整个 **`icons/`** 资料夹。
3. **Settings → Pages**：Source 选 `Deploy from a branch`，Branch 选 `main` / 根目录，保存。
4. 等一两分钟，网址会是 `https://<你的帐号>.github.io/pixel-notes/`。
5. 用 Safari 打开 → 点「分享」→「加到主画面」→「加入」。

> 品牌图示和 favicon 是内嵌的，漏掉 `icons/` 也不会破图；但**主画面图标**（manifest / apple-touch-icon）仍然要 `icons/` 里的 PNG。
> 上传完打开 App → 设置 →「部署检查」可以确认每个档案都在。

### 方案 B：Netlify Drop（电脑上最快）

打开 <https://app.netlify.com/drop>，把整个 `pixel-notes` 文件夹拖进去，马上得到 HTTPS 网址。之后在 Safari 里「加到主画面」。

### 更新版本时

1. 整套重新上传（不要只传改动的档案；这次就有新增 `richtext.js`）。
2. Safari → 设置 → Safari → 高级 → 网站资料 → 删除该网站资料。
3. 重开网址；或在 App 里「设置 → 检查更新（清除快取）」。
4. `sw.js` 的 `CACHE` 已升到 `pixel-notes-v4`。

---

## 提醒：为什么是「导出到系统日历」而不是 App 内通知

iOS PWA 的硬限制：

- Safari **没有**本机定时通知 API（Notification Triggers 提案已放弃，WebKit 从未支持）。
- iOS Web Push **必须由服务器**在提醒时间推送；没有服务器就没有后台通知。
- Service Worker 不能常驻，App 关掉后没有 JS 在跑，也没有 Background Sync。

所以提醒走 **.ics + VALARM**：

1. 任务里设「提前 5 / 10 / 30 / 60 分钟」。
2. 任务详情「📅 加入日历」（或日历页「导出这天」、设置「导出全部未完成任务」）。
3. `.ics` 会落在「文件」App；点开 →「加入日历」→ 选「Pixel Notes」日历。
4. 到时间由 **iOS 系统日历本机提醒**，完全离线。

任务改动后要重新导出；iOS 有时会对同一 `UID` 产生重复活动，建议都汇入专门的「Pixel Notes」日历，重来就整个删掉。

要「App 自己在背景提醒」只能改成原生 App（SwiftUI + `UNUserNotificationCenter`）。

---

## iOS 捷径（Shortcuts）

用「打开网址」把任务带进 App：

```
https://你的网址/#/new?title=买菜&date=2026-11-02&start=18:00&end=19:00&cat=life&remind=10&project=生活
```

| 参数 | 说明 |
| --- | --- |
| `title` | 任务标题 |
| `date` | 日期 `YYYY-MM-DD` |
| `start` / `end` | 开始 / 结束时间 `HH:mm` |
| `cat` | `work` / `life` / `study` / `other` |
| `remind` | 提前几分钟；`0` = 准时；`none` = 不提醒 |
| `project` | 专案名称或 id（可选；找不到就放未分类） |

打开链接会自动弹出「新任务」并预填，按「建立任务」即可。设置页可复制链接与「今日清单」。

---

## 语音输入

- **iOS / iPadOS**：Safari 不开放网页语音识别。请在笔记编辑页点输入框，用**系统键盘上的 🎤 听写**。
- **桌面 Chrome / Edge** 等支援 `SpeechRecognition`：点编辑器 🎤 可直接听写。

---

## 资料、备份与限制

**存在哪里**：IndexedDB（数据库 `pixel-notes`，版本 2）。
资料表：`tasks`、`notes`、`files`、`blobs`、`meta`、`projects`、`folders`。

**笔记格式**：v1.2 起存 HTML（`note.html`）+ 纯文字（`note.body`）。旧版 Markdown 笔记打开时自动转换显示，存一次就变新格式。

**升级**：v1.3 的 DB 版本是 2，会自动建立 `projects` / `folders`；旧任务/笔记会在「未分类」，不会丢失。

**容量**：Safari 单来源配额通常约 1GB 起，可在设置 → 储存查看；加到主画面后不受 7 天清理规则影响。仍建议定期汇出备份。

**备份**：设置 → 汇出备份 JSON（含专案、资料夹、附件）；汇入会**覆盖**现有资料。

**限制**：

- 没有跨装置同步；iPhone / iPad 各一份。
- 不会读写系统日历/提醒事项，只能汇出 `.ics`。
- 附件不会出现在「文件」App，只能在该 App 或按「下载」导出。
- 关闭 App 后不会背景同步或提醒（提醒交给系统日历）。
- 上架 App Store / Widget / Spotlight 需要原生 App。
- 语音识别在 iOS 要靠键盘听写。
- 富文本用 `contenteditable` + `execCommand`；复杂网页粘贴会简化成白名单标签。

**隐私**：没有第三方请求；「部署检查」只抓自己站上的档案；Service Worker 只快取同源文件。

---

## 开发者笔记

### 文件结构

```
index.html            页面骨架 + 内嵌品牌图标 + 载入失败检查
styles.css            像素风样式（浅/深色变量、专案卡片、富文本）
app.js                路由、渲染、专案/资料夹、富文本编辑、汇出、.ics、主题…（UI 主程序）
db.js                 IndexedDB 存取层（DB v2）
util.js               日期 / 时长 / 提醒 / 逾期 / 转义等纯函数
ics.js                iCalendar 产生器（UTC、VALARM、折行）
md.js                 轻量 Markdown 渲染（旧笔记转换用）
richtext.js           HTML 白名单清理、HTML→纯文字、HTML→Markdown（汇出用）
sw.js                 离线快取（CACHE 版本）
manifest.webmanifest  PWA manifest
icons/                图标（tools/make_icons.py 生成）
tools/test-util.mjs   日期/格式化测试
tools/test-core.mjs   提醒/逾期/.ics/Markdown 测试
tools/smoke.mjs       端到端测试（70 项检查，截图到 tools/shots/）
tools/shots-clean.mjs 生成干净截图（tools/shots-clean/）
```

### 资料模型

| store | 内容 | 关键栏位 |
| --- | --- | --- |
| `projects` | 专案（不设时间） | `id, name, color, createdAt, updatedAt` |
| `tasks` | 任务 | `id, title, startAt, endAt, cat, projectId, done, remind, createdAt, updatedAt` |
| `folders` | 笔记资料夹 | `id, name, createdAt, updatedAt` |
| `notes` | 笔记（`taskId` 为空 = 独立笔记） | `id, taskId, folderId, title, body, html, pinned, createdAt, updatedAt` |
| `files` | 附件元资料 | `id, taskId, name, type, size, createdAt` |
| `blobs` | 附件本体 | out-of-line key = 附件 id |
| `meta` | 设定 | `key, value` |

主题存在 `localStorage` 的 `pixel-notes-theme`（`auto`/`light`/`dark`）；`#/new?...` 是捷径进入点。

### 跑测试

```bash
node tools/test-util.mjs
node tools/test-core.mjs

# 端到端（先起静态服务器 + 装 Chrome）
python3 -m http.server 8017 --directory .
node tools/smoke.mjs
```

端到端会实际点按钮、建专案/资料夹、切主题、打字、按格式、插表格、汇出 .ics 与笔记、备份还原、断网重载，并截图到 `tools/shots/`。

### 已知兼容性

- 目标：iOS / iPadOS Safari 16+、桌面 Chrome / Safari。
- 端到端是桌面 Chrome 无头环境（含 iPhone 390×844、iPad 820×1180 视口、iOS UA 模拟）；**iOS 实机待验证**。真机上最可能需微调的是日期/时间输入框、键盘听写、contenteditable 长按选字。
- 用了 `100dvh`、`env(safe-area-inset-*)`、`contenteditable`、`execCommand`、可选链等，iOS 15.4+ 基本支持。
