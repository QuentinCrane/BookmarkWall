# v0.7.9 首页布局与授权修复说明

本版本修复两个关键问题：

1. 未授权生成真实海报时，首页不再渲染大量“堆叠浏览器线框”占位，改为轻量本地预览封面。
2. 首次打开插件时不会主动访问网页、不会启动并发截图，必须用户在新手引导中明确勾选同意后才会开始生成真实海报。

## 首页本地预览封面

在没有真实截图缓存时，`renderCard()` 会调用 `renderLocalCover()` 生成纯 HTML/CSS 的本地封面。该封面不包含外部图片请求，不加载 Google favicon，也不会访问书签网页，因此不会在 300+ 书签页面造成大量网络请求和卡顿。

本地封面结构包括：

- 顶部轻量浏览器地址栏；
- 域名稳定主题渐变；
- 域名缩写 Logo；
- 标题与域名；
- “本地预览 / 同意后生成真实海报”状态提示。

## 卡片尺寸约束

最后覆盖规则位于 `src/styles.css` 中 `v0.7.9 homepage stability` 段落。核心约束：

- 大卡片宽度 260px；
- 海报封面高度 146px；
- 底部文字区高度 92px；
- 标题最多两行；
- 标签区单行隐藏溢出；
- 网格使用固定列宽，避免 `1fr` 拉伸导致视觉拥挤。

## 授权逻辑

`renderThumbnailGuide()` 在没有 `posterConsentGranted` 时只显示“查看引导并授权”，不会直接显示“生成当前可见海报”。

自动截图入口仍由以下判断保护：

```js
if (this.hasPosterGenerationConsent()) {
  setTimeout(() => this.kickoffAutoPosters('initial'), 900);
}
```

同时 `scheduleVisiblePosterGeneration()` 和 `kickoffAutoPosters()` 均会再次检查授权状态。
