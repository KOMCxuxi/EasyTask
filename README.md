# Pixel Notes · 像素笔记

一个**离线优先**的 PWA：把「记事本 / 待办事项 / 日历」合成一个 App。
像素风 UI，资料全部存在本机（IndexedDB + 附件 blob），**不联网、不上传、不需要账号**。

> v1.7：
> - **笔记编辑器对齐 Apple 备忘录**：段落样式（标题／大标题／小标题／内文）、粗体斜体下划线删除线、四色荧光笔、清除荧光、清除格式、整篇还原、贴上纯文字、复原／重做。
> - **整篇文字大小 A−／A＋**：每则笔记记住自己的字号（80%–180%），从别处贴进来的文字也会被正规化，不会再突然变小。
> - **手机工具列重做**：常用按钮改成横向滑动；段落、字号、荧光、清除格式收进「Aa」面板，不再挤在一起或重叠。
> - **移除「申请持久化储存」按钮**：Safari 的 `persist()` 可能被拒绝，不能当作保证；改为清楚说明「备份才可靠」，并保留储存用量显示。
> - **新的主画面图标**：深色像素笔记本 + 绿色勾；iOS 用 `app-icon-180.png`，manifest 用 192/512/1024 与 maskable。
>
> v1.6：
> - **修掉「更新后还看到旧版 / 一片空白」**：Service Worker 改成**网路优先**（`pixel-notes-v7`），并会自动删掉旧快取；启动失败时会显示**缺哪些档案**和「**清除快取并重新载入**」按钮，不再只有空白。
> - **iOS 捷径限制**：网址捷径一定会在 Safari 开新页面，打不开主画面 App；改为建议用**剪贴板快速新增**（设置 → iOS 捷径）。
> - **旧示范资料移民**：早期版本的简体示范任务／笔记，会在升级后自动转成目前语言（English 或香港繁體）；你自己输入的内容不会被改。
>
> v1.5：
> - **介面语言切换**：设置 → 语言，可选 **English（预设）** 或 **繁體中文（香港用词）**，立即切换并记住选择。
> - 所有介面文字、日期、时长、「几分钟前」、按钮、空状态、确认框都会跟着换语言；使用者输入的内容不会被翻译。
> - 专案卡片可**拖动排序**（也有 ↑↓ 按钮）与**封存 / 取消封存**；「全部任务」有**按专案筛选** chip。
> - 笔记可汇出 **Markdown / 纯文本 / 网页 / PDF（列印 / 存到文件）**。

---

## 功能

### 待办：专案 → 任务

- **待办首页**是专案卡片列表：每张卡有颜色、未完成/总数、下一个任务。
  - 固定会有「未分类」收纳还没放进专案的任务。
  - 右上角「全部任务」可以看跨专案的时间轴。
  - 「排序」可进入拖拽模式（触控/滑鼠都可拖，也有 ↑↓ 按钮），排好按「完成」。
  - 专案可**封存**，封存的会收在首页下方「已封存」区，随时可取消封存。
- **专案页**：专案里可新增任务（自动归这个专案）、编辑/改色/封存/删除专案。任务按日期分组、组内按**开始时间排序**；逾期任务置顶，可单笔或全部删除。
- **任务**：日期、开始/结束时间（自动算时长 + 30 分 / 1 小时 / 1.5 小时 / 2 小时快捷钮）、分类、提醒、完成状态、专案。
- **任务详情**：这个任务的**附件**（多选上传、图片缩图、下载、删除）、**任务笔记**（富文本）、「📅 加入日历」（.ics + 提醒）。
- **删除专案**：里面的任务会移到「未分类」，不会被删掉。

### 备忘录：资料夹 + 富文本 + 汇出

- **备忘首页**是资料夹卡片：名称、笔记数、最后更新；固定「未分类」；可「全部笔记」跨资料夹搜索。
- **笔记编辑器**像 iOS 备忘录：常用工具列（Aa / B / I / U / S / 荧光笔 / • / 1. / ☐ / ▦ / 🎤）可横向滑动；**Aa** 面板有：
  - **段落**：标题 / 大标题 / 小标题 / 内文
  - **文字大小**：整篇 A− / A＋（80%–180%，每则笔记记住）
  - **荧光笔**：黄 / 粉红 / 绿 / 蓝，可清除
  - **清除格式 / 整篇还原 / 贴上纯文字 / 复原 / 重做**
  - 从别处贴上的文字会先正规化（去掉来源字级、颜色、多余标签），不会再突然变小。
  - 表格可「＋行 / ＋栏 / 删表格」；待办方块可点选。
- **汇出**：每则笔记都有「⇩ 汇出」（编辑器里、笔记列表每一列都有）：
  - **Markdown (.md)**：保留标题、清单、表格。
  - **纯文本 (.txt)**。
  - **网页 (.html)**：保留格式，可用浏览器打开或印成 PDF。
  - **PDF（列印 / 存到文件）**：打开系统列印对话框；iOS 上点「分享」→「储存到文件」即可存成 PDF。
- 笔记可「移动到资料夹」；删除资料夹时笔记会移到「未分类」。

### 其他

- **全部任务**：跨专案时间轴，多了**按专案筛选**的 chip（全部专案 / 各专案 / 未分类）。
- **日历**：月视图（周一开头）、当日议程、可导出当天 `.ics`；显示所有专案的任务。
- **主题**：跟随系统 / 浅色 / 深色，顶栏 ◐ 可切换。
- **提醒**：任务设「提前 5/10/30/60 分钟」，导出 `.ics` 后由 iOS 系统日历本机提醒（不需要服务器）。
- **iOS 捷径**：剪贴板快速新增任务；另有 Safari 内 URL 预填（受 iOS 限制，不会打开主画面 App，详见下文）。
- **备份**：JSON 汇出/汇入（含专案、资料夹、附件）。
- **部署检查**：设置里逐一确认 17 个工作档案（含 `icons/`）是否存在。
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
- `14-format-sheet.png` Aa 段落／字号／荧光笔面板
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
   `index.html`、`styles.css`、`app.js`、`db.js`、`util.js`、`ics.js`、`md.js`、`richtext.js`、`i18n.js`、`sw.js`、`manifest.webmanifest`、`README.md`，以及整个 **`icons/`** 资料夹。
3. **Settings → Pages**：Source 选 `Deploy from a branch`，Branch 选 `main` / 根目录，保存。
4. 等一两分钟，网址会是 `https://<你的帐号>.github.io/pixel-notes/`。
5. 用 Safari 打开 → 点「分享」→「加到主画面」→「加入」。

> 顶栏品牌图和 favicon 有内嵌版本；但**主画面图标**仍然要 `icons/` 里的 PNG（`app-icon-180.png` 给 iOS、`app-icon-192/512.png` 给 manifest、`app-icon-maskable-512.png` 给 Android）。
> 上传完打开 App → 设置 →「部署检查」可以确认每个档案都在。
> 如果主画面还是旧图标：**删除旧图 → 清除网站资料 → 重新「加到主画面」**；图标档名已换成 `app-icon-*`，iOS 会重新抓取。

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

> **重要（iOS 限制）**：iOS 不允许用网址直接打开「加到主画面」的 Web App。快捷指令的「打开网址」一定会在 **Safari 开一个新页面**，而 Safari 和主画面 App 的储存是分开的，所以在那边建立的任务**不会**出现在主画面 App 里。

### 建议做法：剪贴板流程

1. 在「快捷指令」新增动作 **「拷贝到剪贴板」**：
   - 第一行：任务标题
   - 第二行（可选）：`2026-11-02 18:00`
2. 回到已加到主画面的 Pixel Notes → 设置 → **iOS 捷径 → 📋 从剪贴板新增任务**。
3. 会打开「新任务」并预填标题／时间，确认后建立，资料留在同一个 App。

### 进阶：在 Safari 内用网址预填（只会在 Safari 生效）

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

打开链接会弹出「新任务」并预填；这个流程只适用于 **Safari 里的那一份资料**，不会打开主画面 App。设置页可复制链接与「今日清单」。

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

**容量与保留**：Safari 单来源配额通常约 1GB 起，可在设置 → 储存查看。加到主画面通常可避开 Safari 对「一段时间没开」网站的清理，但**系统仍可能在空间不足时清掉资料**；唯一可靠的做法是定期汇出备份。

**备份**：设置 → 汇出备份 JSON（含专案、资料夹、附件）；汇入会**覆盖**现有资料。

**限制**：

- 没有跨装置同步；iPhone / iPad 各一份。
- 不会读写系统日历/提醒事项，只能汇出 `.ics`。
- 附件不会出现在「文件」App，只能在该 App 或按「下载」导出。
- 关闭 App 后不会背景同步或提醒（提醒交给系统日历）。
- 上架 App Store / Widget / Spotlight 需要原生 App。
- 语音识别在 iOS 要靠键盘听写。
- 富文本用 `contenteditable` + `execCommand`；贴上内容会先经过 `sanitizePasteHtml()`，去掉来源网站的字级、颜色与多余标签，再存成白名单 HTML（含 `<mark>` 荧光）。

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
icons/                图标（app-icon-*；tools/make_icons.py 生成）
tools/test-util.mjs   日期/格式化测试
tools/test-core.mjs   提醒/逾期/.ics/Markdown 测试
tools/smoke.mjs       端到端测试（94 项检查，截图到 tools/shots/）
tools/test-migrate.mjs 旧简体示范资料 → English / 繁體 迁移测试
tools/scan-i18n.mjs   英文模式残留中文扫描
tools/check-zh.mjs    繁體模式残留简体扫描
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

主题存在 `localStorage` 的 `pixel-notes-theme`（`auto`/`light`/`dark`）；`#/new?...` 是 Safari 内的捷径进入点（不会打开主画面 App）。

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
- 端到端测试是桌面 Chrome 无头环境（iPhone 390×844、iPad 820×1180 视口、iOS UA 模拟）；**iOS 实机待验证**。
- 用了 `100dvh`、`env(safe-area-inset-*)`、`contenteditable`、`execCommand`、可选链等，iOS 15.4+ 基本支持。

### 语言

- 默认 **English**；设置里可切到 **繁體中文**（香港用词，例如「設定 / 檔案 / 儲存 / 列印」）。
- 语言选择存在 localStorage（pixel-notes-lang），下次打开会沿用。
- 日期、星期、月份、时长、相对时间都由 Intl / 语言感知格式化，不会中英混排。
