# 本地兜底海报设计说明（v0.7.7）

当真实网页截图失败、截图质量检测判定为条状/空白、公开封面图无法下载，或公开封面质量过低时，插件会使用 `createDesignedFallbackPoster()` 在本地 Canvas 中生成一张稳定的 16:9 海报封面。

## 设计目标

- 与参考设计图中的海报墙风格保持一致：圆角、玻璃感、柔和蓝紫渐变、轻量信息标签。
- 只生成“海报封面区”，不重复绘制 HTML 卡片已有的底部标题区、选择按钮和更多按钮，避免重复 UI。
- 避免白底横线、加载条、骨架屏等“条状海报”再次进入缓存。
- 不依赖外部图片、远程字体或第三方接口，保证离线可用和隐私安全。
- 根据域名与标题稳定生成主题色，刷新后同一个书签保持相同视觉风格。

## 视觉结构

1. 16:9 封面背景
   - 稳定主题渐变。
   - 柔和光斑、暗角和斜向纹理。

2. 玻璃浏览器壳层
   - 半透明网页容器。
   - 顶部地址栏和浏览器圆点装饰。
   - 中央域名缩写 Logo。

3. 标题与信息胶囊
   - 主标题最多两行。
   - 域名和文件夹胶囊。
   - 底部半透明状态带，标记“本地封面”。

## 相关代码

- `createDesignedFallbackPoster(bookmark, options)`：入口函数，输出本地 16:9 封面 data URL。
- `fallbackPosterTheme(domain, title)`：根据域名和标题生成稳定主题色。
- `drawFallbackBackground()`：绘制基础渐变和暗角。
- `drawFallbackDecor()`：绘制光斑和斜向纹理。
- `drawFallbackBrowserShell()`：绘制玻璃浏览器壳层。
- `drawFallbackHero()`：绘制 Logo、标题和信息胶囊。
- `drawFallbackStatusBand()`：绘制底部状态带。
- `inspectPosterImageQuality()`：拦截空白、细条、低信息量截图，防止异常海报写入缓存。

## 缓存迁移

本版本将缩略图 schema 升级为 `poster-local-design-v5`，会丢弃旧版本截图缓存和旧兜底卡片，重新生成新的本地设计海报。
