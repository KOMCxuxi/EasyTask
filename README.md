# Pixel Notes · 像素笔记

一个**离线优先**的 PWA：把「记事本 / 待办事项 / 日历」合成一个 App。
像素风 UI，资料全部存在本机（IndexedDB + 附件 blob），**不联网、不上传、不需要账号**。

> 这是给个人自用的版本：单机、无同步。换装置或清除浏览器资料前，请先用「设置 → 汇出备份」。

---

## 功能

- **待办**：新建任务时选日期、开始/结束时间（自动算时长，也有 30 分 / 1 小时 / 1.5 小时 / 2 小时的快捷钮）、分类（工作 / 生活 / 学习 / 其他）、完成状态。
- **任务详情页**（点任务进入）：
  - 这个任务的**附件**：可一次选多个文件（照片、PDF、任意档案），存在本机，图片有缩图可预览，可下载、可删除。
  - 这个任务的**笔记**：一个任务可以有很多则笔记，点进去是独立的编辑页。
  - 显示日期、时段、时长、分类；可编辑、可标记完成、可删除（会连同笔记和附件一起删）。
- **日历**：月视图（周一开头），每天用小色块显示任务分类；点某天看当日议程；可直接在那天新增任务。
- **备忘录**：独立的笔记列表，可搜索、可置顶；自动储存（打字停下来 0.5 秒后写入）。
- **备份**：设置里可汇出完整 JSON（含附件内容，base64），也可汇入还原。
- **离线**：Service Worker 快取整个 App，加到主画面后断网也能打开。
- **搜索**：待办页可搜任务标题，也会搜任务里的笔记内容。

分类颜色：工作 = 蓝、生活 = 绿、学习 = 黄、其他 = 紫。

## 直接看截图

`tools/shots-clean/` 是干净的界面截图；`tools/shots/` 是端到端测试过程截图。

- `tools/shots-clean/01-tasks.png` 待办列表
- `tools/shots-clean/03-calendar.png` 日历 + 当日议程
- `tools/shots-clean/06-task-detail.png` 任务详情 + 附件
- `tools/shots-clean/05-note-editor.png` 笔记编辑器
- `tools/shots-clean/07-ipad.png` iPad 版面
- `tools/shots/14-ios-install-hint.png` iPhone 上的安装提示

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
2. 进 repo → **Add file → Upload files**，把这个文件夹里的**所有文件**（`index.html`、`styles.css`、`app.js`、`db.js`、`util.js`、`sw.js`、`manifest.webmanifest`、`icons/`）传上去。
3. **Settings → Pages**：Source 选 `Deploy from a branch`，Branch 选 `main` / 根目录，保存。
4. 等一两分钟，网址会是 `https://<你的帐号>.github.io/pixel-notes/`。
5. 用 Safari 打开 → 点「分享」→「加到主画面」→「加入」。

### 方案 B：Netlify Drop（电脑上最快）

打开 <https://app.netlify.com/drop>，把整个 `pixel-notes` 文件夹拖进去，马上得到一个 HTTPS 网址。之后在 Safari 里「加到主画面」。

### 加到主画面之后

- 从主画面图标打开 = 独立窗口、没有 Safari 工具栏，像普通 App。
- 断网也能用（第一次打开时已经快取好）。
- 想更新：重新上传新版本 → 到 App 里「设置 → 检查更新（清除快取）」再重载。
  （自己改代码时，记得把 `sw.js` 里的 `CACHE` 版本名加一，例如 `pixel-notes-v2`。）

---

## 资料、备份与限制

**存在哪里**：浏览器的 IndexedDB（数据库名 `pixel-notes`）。任务、笔记、分类、附件元资料一个库，附件本体存在 `blobs` 里。

**容量**：Safari 对单一来源的配额通常从约 1GB 起、可随使用增长，实际值可在「设置 → 储存」看到。加到主画面后，资料不受 Safari「7 天没用就清掉网站数据」规则影响；仍建议偶尔汇出备份。设置里可以「申请持久化储存」。

**备份**：设置 → 汇出备份 JSON。iOS 上会存到「文件」App（下载项目里），可以再丢进 iCloud Drive。汇入会用备份**覆盖**现有资料。

**这个版本的已知限制**（都是 PWA 在 iOS 上的先天限制，不是 bug）：

- **没有跨装置同步**。iPhone 和 iPad 各自一份；要同步得加后端或改成原生。
- **不会读写系统「日历 / 提醒事项」**。日历是 App 内的视图；之后可以加 `.ics` 汇出，把任务导进系统日历。
- **附件的实体文件不会出现在「文件」App**，只能在这个 App 里看，或按「下载」导出。
- **关闭 App 后不会在背景同步或提醒**。iOS 的 Web Push 需要服务器，与本版「不联网」的定位冲突，所以没做。
- **App Store 上架 / Widget / Spotlight** 需要原生 App，PWA 做不到。

**隐私**：App 内没有任何 `fetch` / XHR / 第三方 CDN。所有资源都在这个资料夹里，Service Worker 只快取同源文件。

---

## 开发者笔记

### 文件结构

```
index.html            页面骨架（顶栏、容器、FAB）
styles.css            像素风样式（纸感底 + 硬边框 + 方块阴影）
app.js                路由、渲染、弹窗、事件（UI 主程序）
db.js                 IndexedDB 存取层
util.js               纯函数（日期、时长、日历网格、转义…）
sw.js                 离线快取（改版本时改 CACHE 名）
manifest.webmanifest  PWA manifest
icons/                图标（由 tools/make_icons.py 生成）
tools/make_icons.py   用 Pillow 画 16×16 像素图标并导出 PNG/SVG
tools/test-util.mjs   纯函数单元测试
tools/smoke.mjs       无头 Chrome + CDP 端到端测试（会截图到 tools/shots/）
```

### 资料模型

| store | 内容 | 关键栏位 |
| --- | --- | --- |
| `tasks` | 任务 | `id, title, startAt, endAt, cat, done, createdAt, updatedAt` |
| `notes` | 笔记（`taskId` 为空 = 独立备忘录） | `id, taskId, title, body, pinned, createdAt, updatedAt` |
| `files` | 附件元资料 | `id, taskId, name, type, size, createdAt` |
| `blobs` | 附件本体（out-of-line key = 附件 id） | — |
| `meta` | 设定 / 示例资料标记 | `key, value` |

### 跑测试

```bash
# 纯函数测试
node tools/test-util.mjs

# 端到端（先在本机起静态服务器 + 装 Chrome）
python3 -m http.server 8017 --directory .
node tools/smoke.mjs
```

端到端测试会实际点按钮、打字、上传附件、汇出/汇入备份、断网重载，并把截图存到 `tools/shots/`。

想重新拍干净的宣传截图（不带 toast）：

```bash
node tools/shots-clean.mjs
```

截图会写到 `tools/shots-clean/`（需要本机静态服务器和 Chrome）。

### 已知的兼容性

- 目标浏览器：iOS / iPadOS Safari（16 以上较稳）、桌面 Chrome / Safari。
- 端到端测试是在桌面 Chrome 无头环境跑的（含 iPhone 390×844 与 iPad 820×1180 视口、iOS UA 模拟）；**iOS 实机待验证**。真机上最可能需要微调的是日期/时间输入框的原生外观。
- 用了 `100dvh`、`env(safe-area-inset-*)`、`Element.closest`、可选链等特性，iOS 15.4+ 基本都支持。
