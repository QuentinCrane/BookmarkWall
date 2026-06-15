# Chrome / Edge 商店上架材料草案

## 名称

书签海报墙 BookmarkWall

## 一句话简介

把杂乱的浏览器书签整理成真实网页截图海报墙，支持备份、搜索、去重、并发截图和可选 AI 预整理。

## 简短描述

BookmarkWall 是一款 Chrome / Edge 书签整理插件。它会在用户确认后读取浏览器原生书签，并用真实网页截图生成海报卡片，帮助用户快速识别、备份、筛选、移动和整理书签。

## 详细描述

你的书签栏是否已经堆满了多年收藏的网站，却很难判断哪些还有效、哪些重复、哪些应该归类？BookmarkWall 将浏览器原生书签展示为现代海报墙，用真实网页截图帮助你更直观地整理收藏内容。

核心能力：

- 首次打开先显示清晰引导，确认前不读取书签、不截图、不整理
- 一键导出全部书签 HTML / JSON，整理前先做好本地备份
- 用真实网页截图生成书签海报，失败时降级为公开网页封面或本地 fallback
- 支持搜索、文件夹浏览、最近添加、未分类、重复书签检测
- 支持多选、拖拽移动、编辑、删除和撤销
- 截图任务支持 1-63 并发设置，默认保守，队列状态可见
- AI 预整理默认关闭，只有用户主动配置并触发时才运行

隐私承诺：

- 书签、截图缓存和设置保存在本机浏览器扩展存储中
- 插件不会把书签、截图、API Key 上传到开发者服务器
- AI 功能为可选功能，只会向用户自己配置的 AI 服务商发送必要书签信息
- 用户可随时导出备份、清除截图缓存和清除 AI 推荐记录

## 权限用途

- `bookmarks`：读取与整理浏览器原生书签
- `storage` / `unlimitedStorage`：保存本地设置、截图缓存和 AI 建议
- `tabs` / `activeTab`：打开截图标签页、捕获可见区域、恢复原标签页
- `scripting`：截图前滚动页面到顶部，提高截图稳定性
- `debugger`：使用 Chrome DevTools Protocol 生成真实网页截图
- `http://*/*` / `https://*/*`：访问书签对应网页以生成截图或读取公开封面

## 截图建议

1. 首次引导页：展示三栏流程、安全备份和截图确认
2. 首页 Dashboard：展示真实网页海报墙、侧栏和顶部工具栏
3. 设置页：展示截图引擎、并发设置、备份和隐私说明
4. AI 预整理结果：展示建议列表和确认操作

当前可用截图文件：

- `docs/screenshots/bookmarkwall-onboarding-final.png`
- `docs/screenshots/bookmarkwall-dashboard-final.png`
- `docs/screenshots/bookmarkwall-settings-final.png`
- `docs/screenshots/bookmarkwall-ai-final.png`

## 隐私政策摘要

BookmarkWall 本地优先处理书签数据。除用户主动配置并触发 AI 预整理外，插件不会向第三方发送书签信息。真实截图保存在本地扩展存储中，可由用户清除。完整说明见 `docs/PRIVACY.md`。
