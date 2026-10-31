# Pixel Notes · 像素笔记

一个**离线优先**的 PWA：把「记事本 / 待办事项 / 日历」合成一个 App。
像素风 UI，资料全部存在本机（IndexedDB + 附件 blob），**不联网、不上传、不需要账号**。

> v1.1 新增：深色 / 浅色主题、导出到系统日历（.ics + 提醒闹钟）、逾期任务快速删除、笔记 Markdown 工具与表格预览、iOS 捷径快速建任务、语音输入提示。

---

## 功能

- **待办**：新建任务时选日期、开始/结束时间（自动算时长，也有 30 分 / 1 小时 / 1.5 小时 / 2 小时的快捷钮）、分类（工作 / 生活 / 学习 / 其他）、提醒时间、完成状态。
- **任务详情页**（点任务进入）：
  - 这个任务的**附件**：可一次选多个文件（照片、PDF、任意档案），存在本机，图片有缩图可预览，可下载、可删除。
  - 这个任务的**笔记**：一个任务可以有很多则笔记，点进去是独立的编辑页。
  - 显示日期、时段、时长、分类、提醒；可编辑、可标记完成、可删除（会连同笔记和附件一起删）。
  - **📅 加入日历**：把这个任务导出成 `.ics`，导入 iOS 日历后由系统在本机提醒。
- **逾期任务**：过期未完成的任务会自动收进最上面的「逾期」分组，可以单笔按 `×` 快速删除，也可以「全部删除」一次清掉（会连同笔记和附件）。
- **日历**：月视图（周一开头），每天用小色块显示任务分类；点某天看当日议程；可直接在那天新增任务；可「导出这天」的 `.ics`。
- **备忘录**：独立的笔记列表，可搜索、可置顶；自动储存。
  - 编辑工具列：粗体、斜体、标题、清单、待办清单、**表格**、引用、程式码。
  - 「预览」模式会把 Markdown 渲染成表格 / 清单 / 标题等排版。
- **主题**：跟随系统 / 浅色 / 深色，顶栏的 ◐ 按钮可快速切换，设置里也能选。
- **备份**：设置里可汇出完整 JSON（含附件内容，base64），也可汇入还原。
- **离线**：Service Worker 快取整个 App，加到主画面后断网也能打开。
- **搜索**：待办页可搜任务标题，也会搜任务里的笔记内容。

分类颜色：工作 = 蓝、生活 = 绿、学习 = 黄、其他 = 紫。

## 直接看截图

`tools/shots-clean/` 是干净的界面截图；`tools/shots/` 是端到端测试过程截图。

- `tools/shots-clean/01-tasks.png` 待办列表（浅色）
- `tools/shots-clean/02-task-modal.png` 新任务（含提醒设定）
- `tools/shots-clean/03-task-detail.png` 任务详情 + 附件
- `tools/shots-clean/04-overdue.png` 逾期分组 + 快速删除
- `tools/shots-clean/05-calendar.png` 日历 + 当日议程
- `tools/shots-clean/07-note-editor.png` 笔记编辑器（Markdown 工具列）
- `tools/shots-clean/08-note-preview.png` 笔记预览（表格）
- `tools/shots-clean/09-dark-tasks.png` 深色主题
- `tools/shots-clean/10-ipad.png` iPad 版面

---

## 在电脑上先跑起来

这个 App 用了 ES modules 和 IndexedDB，**不能直接双击 `index.html`**（`file://` 会挡掉模块和储存），需要一个本机静态服务器：

```bash
cd pixel-notes
python3 -m http.server 8017
# 或：npx serve .
```

然后打开 <http://localhost:8017>。（端口随意，`http://localhost` 和 `http://127.0.0.1` 都算安全来源，Service Worker 能注册。）

第一次打开会写入 3 个示例任务和 2 则示例笔记，点开看看，再到「设置 → 清空全部资料」清掉即可。

---

## 装到 iPhone / iPad 上（不需要 Mac、不需要上架）

PWA 要安装，必须先有一个 **HTTPS 网址**。免费静态托管都可以，下面是最省事的两种：

### 方案 A：GitHub Pages（iPad 上也能做完）

1. 在 GitHub 建一个 repository（例如 `pixel-notes`），设为 Public。
2. 进 repo → **Add file → Upload files**，把这个文件夹里的**所有文件**（`index.html`、`styles.css`、`app.js`、`db.js`、`util.js`、`ics.js`、`md.js`、`sw.js`、`manifest.webmanifest`、`icons/`）传上去。
3. **Settings → Pages**：Source 选 `Deploy from a branch`，Branch 选 `main` / 根目录，保存。
4. 等一两分钟，网址会是 `https://<你的帐号>.github.io/pixel-notes/`。
5. 用 Safari 打开 → 点「分享」→「加到主画面」→「加入」。

### 方案 B：Netlify Drop（电脑上最快）

打开 <https://app.netlify.com/drop>，把整个 `pixel-notes` 文件夹拖进去，马上得到一个 HTTPS 网址。之后在 Safari 里「加到主画面」。

### 加到主画面之后

- 从主画面图标打开 = 独立窗口、没有 Safari 工具栏，像普通 App。
- 断网也能用（第一次打开时已经快取好）。
- 想更新：重新上传新版本 → 到 App 里「设置 → 检查更新（清除快取）」再重载。
  （自己改代码时，记得把 `sw.js` 里的 `CACHE` 版本名加一，例如 `pixel-notes-v3`。）

---

## 提醒：为什么是「导出到系统日历」而不是 App 内通知

这是 iOS PWA 的硬限制，不是偷懒：

- Safari **没有**「本机定时通知」API（Notification Triggers 提案已被放弃，WebKit 从未支持）。
- iOS 的 Web Push **必须由服务器**在提醒时间发一条推送；没有服务器就没有后台通知。
- Service Worker 不能常驻，App 关掉后没有任何 JS 在跑，也没有 Background Sync。

所以这个 App 的提醒走 **.ics + VALARM** 这条路：

1. 任务里设定「提前 5 / 10 / 30 / 60 分钟」。
2. 点任务详情页的「📅 加入日历」（或日历页「导出这天」、设置「导出全部未完成任务」）。
3. 下载的 `.ics` 会落在「文件」App（下载项目）。
4. 点开它 →「加入日历」→ 选「Pixel Notes」日历。
5. 之后到时间由 **iOS 系统日历本机提醒**，完全不需要网络或服务器。

注意：任务改动后要重新导出一次；iOS 有时会对同一 `UID` 的活动产生重复项，建议都汇入专门的「Pixel Notes」日历，需要重来就整个日历删掉重建。

如果要「App 自己在背景弹通知」，只能改成原生 App（SwiftUI + `UNUserNotificationCenter`）。网页做不到。

---

## iOS 捷径（Shortcuts）怎么配合

PWA 不能直接读写「提醒事项」，但捷径可以借由 URL 把资料带进来。做法：

1. 打开「快捷指令」→「+」→ 新增「打开网址」动作。
2. 网址填下面这种格式（设置页有现成链接可复制）：

```
https://你的网址/#/new?title=买菜&date=2026-11-02&start=18:00&end=19:00&cat=life&remind=10
```

3. 把标题、日期等换成捷径变量（例如「询问输入」或「剪贴板」），就能做成：
   - 「快速记任务」捷径：输入一句话 → 打开 App 并预填标题。
   - 桌面小工具 / Siri：「帮我记一个任务」。
   - 收到讯息时把内容转成任务。

支持的参数：

| 参数 | 说明 |
| --- | --- |
| `title` | 任务标题 |
| `date` | 日期 `YYYY-MM-DD` |
| `start` / `end` | 开始 / 结束时间 `HH:mm` |
| `cat` | `work` / `life` / `study` / `other` |
| `remind` | 提前几分钟；`0` = 准时；`none` = 不提醒 |

打开链接会自动弹出「新任务」并预填，按「建立任务」即可。设置页还有「复制今日清单」，可把今天的任务贴到捷径、备忘录或讯息里。

---

## 语音输入

- **iOS / iPadOS**：Safari 不开放网页端的语音识别 API。请在笔记编辑页点输入框，用**系统键盘上的 🎤 听写按钮**，说完直接变成文字。这是 iOS 上最稳的方式，完全本机处理。
- **桌面 / 部分浏览器**（Chrome、Edge 等支援 `SpeechRecognition`）：点编辑器的 🎤 按钮可以直接开始听写，说完再点一次停止。

---

## 资料、备份与限制

**存在哪里**：浏览器的 IndexedDB（数据库名 `pixel-notes`）。任务、笔记、附件元资料一个库，附件本体存在 `blobs` 里。

**容量**：Safari 对单一来源的配额通常从约 1GB 起、可随使用增长，实际值可在「设置 → 储存」看到。加到主画面后，资料不受 Safari「7 天没用就清掉网站数据」规则影响；仍建议偶尔汇出备份。设置里可以「申请持久化储存」。

**备份**：设置 → 汇出备份 JSON。iOS 上会存到「文件」App（下载项目里），可以再丢进 iCloud Drive。汇入会用备份**覆盖**现有资料。

**这个版本的已知限制**（都是 PWA 在 iOS 上的先天限制，不是 bug）：

- **没有跨装置同步**。iPhone 和 iPad 各自一份；要同步得加后端或改成原生。
- **不会读写系统「日历 / 提醒事项」**，只能汇出 `.ics` 让系统日历汇入。
- **附件的实体文件不会出现在「文件」App**，只能在这个 App 里看，或按「下载」导出。
- **关闭 App 后不会在背景同步或提醒**（提醒由汇出的系统日历负责）。
- **App Store 上架 / Widget / Spotlight** 需要原生 App，PWA 做不到。
- **语音识别**在 iOS 上要靠系统键盘听写。

**隐私**：App 内没有任何 `fetch` / XHR / 第三方 CDN。所有资源都在这个资料夹里，Service Worker 只快取同源文件。

---

## 开发者笔记

### 文件结构

```
index.html            页面骨架（顶栏、主题切换、容器、FAB）
styles.css            像素风样式（浅色/深色 CSS 变量、硬边框、方块阴影）
app.js                路由、渲染、弹窗、事件、主题、日历导出、逾期处理（UI 主程序）
db.js                 IndexedDB 存取层
util.js               纯函数（日期、时长、日历网格、提醒/逾期判断、转义…）
ics.js                iCalendar (.ics) 产生器（UTC 时间、VALARM 提醒、75 octet 折行）
md.js                 轻量 Markdown 渲染（表格、清单、待办、引用、程式码…）
sw.js                 离线快取（改版本时改 CACHE 名）
manifest.webmanifest  PWA manifest
icons/                图标（由 tools/make_icons.py 生成）
tools/make_icons.py   用 Pillow 画 16×16 像素图标并导出 PNG/SVG
tools/test-util.mjs   日期 / 格式化纯函数测试
tools/test-core.mjs   提醒 / 逾期 / .ics / Markdown 测试
tools/smoke.mjs       无头 Chrome + CDP 端到端测试（截图到 tools/shots/）
tools/shots-clean.mjs 生成干净的宣传截图（tools/shots-clean/）
```

### 资料模型

| store | 内容 | 关键栏位 |
| --- | --- | --- |
| `tasks` | 任务 | `id, title, startAt, endAt, cat, done, remind, createdAt, updatedAt` |
| `notes` | 笔记（`taskId` 为空 = 独立备忘录） | `id, taskId, title, body, pinned, createdAt, updatedAt` |
| `files` | 附件元资料 | `id, taskId, name, type, size, createdAt` |
| `blobs` | 附件本体（out-of-line key = 附件 id） | — |
| `meta` | 设定 / 示例资料标记 | `key, value` |

主题存在 `localStorage` 的 `pixel-notes-theme`（`auto` / `light` / `dark`），让页面载入时先套用、避免闪一下。

### 跑测试

```bash
# 纯函数测试
node tools/test-util.mjs
node tools/test-core.mjs

# 端到端（先在本机起静态服务器 + 装 Chrome）
python3 -m http.server 8017 --directory .
node tools/smoke.mjs
```

端到端测试会实际点按钮、切主题、打字、插入表格、上传附件、导出 .ics、汇出/汇入备份、删除逾期任务、断网重载，并把截图存到 `tools/shots/`。

### 已知的兼容性

- 目标浏览器：iOS / iPadOS Safari（16 以上较稳）、桌面 Chrome / Safari。
- 端到端测试是在桌面 Chrome 无头环境跑的（含 iPhone 390×844 与 iPad 820×1180 视口、iOS UA 模拟）；**iOS 实机待验证**。真机上最可能需要微调的是日期/时间输入框与听写按钮的原生外观。
- 用了 `100dvh`、`env(safe-area-inset-*)`、`Element.closest`、可选链等特性，iOS 15.4+ 基本都支持。
