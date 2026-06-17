# 开发文档

## 架构

```text
index.html
  ↓
src/app.js
  ├─ BookmarkAdapter：读写 Chrome/Edge 原生书签
  ├─ Poster Engine：真实截图 / 网页封面 / favicon 生成海报
  ├─ AIService：OpenAI-Compatible / 本地模拟预整理
  ├─ Drag & Batch：拖拽、多选、批量移动、撤销
  └─ Settings：AI、截图、缓存和显示设置
```

## 真实截图引擎

### 1. 增强 CDP 模式

默认策略：`debugger-cdp`。

流程：

```text
chrome.tabs.create(about:blank, active:false)
chrome.tabs.group / chrome.tabGroups.update(折叠的“BookmarkWall 截图工作区”)
chrome.debugger.attach(tab)
Page.enable / Network.enable
Emulation.setDeviceMetricsOverride
Page.navigate(bookmark.url)
等待 load / network idle / timeout
Runtime.evaluate(scrollTo(0,0))
Page.captureScreenshot
压缩 dataURL
Posterizer 智能裁剪 / 去白边 / 白底增强
保存缓存
chrome.debugger.detach
chrome.tabs.remove
```

CDP 模式会把扩展打开的临时标签页自动收进一个折叠的浏览器 Tab Group。Chrome / Edge 的完整“工作区”不是通用扩展 API，这里使用 Tab Group 达到隔离和减少标签栏干扰的效果。

### 2. 临时窗口模式

CDP 失败或用户手动选择时使用。

```text
chrome.windows.create(popup)
chrome.tabs.update(url)
等待 complete
chrome.scripting.executeScript(scrollTo top)
chrome.tabs.captureVisibleTab
压缩缓存
关闭窗口
```

### 3. 降级策略

真实截图失败后依次尝试：

1. `og:image`
2. `twitter:image`
3. favicon
4. 模拟网页占位海报

## 权限

`debugger` 权限用于 CDP 截图。由于真实网页截图是核心功能，v0.6.0 默认声明该权限。
`tabGroups` 权限用于把 CDP 临时标签自动收进折叠的截图工作区，避免批量截图时在标签栏展开大量临时页面。

## 首次使用安全门

首次打开时，`App.init()` 只读取本地设置和截图缓存，不立即读取浏览器书签树。未完成当前版本引导时会先渲染锁定态和 onboarding：

```text
读取设置 / 缓存
  ↓
显示新手引导
  ↓
用户可先导出 HTML / JSON 备份
  ↓
点击进入管理后读取 bookmarks
  ↓
勾选截图同意并点击生成后才访问网页并截图
```

这保证首次打开不会未经说明就扫描书签、访问网页或启动截图队列。

## 测试

```bash
npm run check
npm test
```

## v0.6.0 Posterizer 管线

真实截图不再直接塞进卡片，而是先进入 Posterizer：

```text
原始首屏截图
  ↓
检测内容区域 / 去白边
  ↓
按 16:9 裁剪
  ↓
白底网页增强：模糊背景 + 清晰主体叠层
  ↓
压缩为本地 JPEG 海报缓存
```

并发截图由 `generateScreenshotPosters()` 内部 Worker Pool 管理：

```text
截图队列
  ├─ Worker 1：CDP / fallback
  ├─ Worker 2：CDP / fallback
  ├─ Worker 3：可选
  └─ Worker N：可选，受设置页 1-63 限制
```

默认并发为 4，设置页和首次引导均支持 1-63 的滑块与数字输入。高并发会提升速度，但会占用更多网络、CPU、内存和标签页资源，因此默认值保持保守。
