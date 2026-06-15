# Contributing / 贡献指南

感谢你愿意改进 BookmarkWall。这个项目是浏览器扩展，代码变更经常会影响书签、权限、截图和本地数据，所以贡献时请尽量保持改动小而清晰。

## 开始之前

1. Fork 仓库并创建功能分支。
2. 在 Chrome / Edge 中通过“加载已解压的扩展程序”加载项目根目录。
3. 修改后刷新扩展，再验证对应功能。
4. 提交前运行检查：

```bash
npm run check
npm test
```

## 建议的 PR 类型

- Bug fix：修复明确可复现的问题。
- Feature：增加独立功能，建议先开 issue 说明动机和交互。
- Docs：改进 README、隐私说明、测试说明或开发文档。
- Refactor：保持行为不变的结构调整，请说明为什么值得改。
- Test：补充或修正自动测试。

## 代码约定

- 保持原生 HTML / CSS / JavaScript 架构，不引入构建系统，除非 issue 中已经讨论确认。
- 不在扩展运行时加载远程脚本、远程字体或远程 iconfont。
- 图标优先使用本地 SVG path 或本地资源。
- 书签的移动、删除、重命名和 AI 批量应用必须保留确认、备份提醒或撤销能力。
- AI 功能必须默认关闭，并且只在用户主动配置和触发后发送必要数据。
- 真实截图相关逻辑必须尊重首次授权和停止队列能力。

## 文档约定

如果 PR 改动了用户可见行为、权限、隐私边界、AI 数据发送或截图策略，请同步更新相关文档：

- `README.md`
- `docs/PRIVACY.md`
- `docs/DEVELOPMENT.md`
- `docs/TESTING.md`
- `docs/RELEASE_NOTES.md`

## 提交 PR 前检查

- [ ] 已运行 `npm run check`
- [ ] 已运行 `npm test`
- [ ] 已在 Chrome 或 Edge 中手动加载并验证核心流程
- [ ] 没有提交 `dist/`、`.playwright-mcp/`、`Ref/`、本地缓存或私密配置
- [ ] 如涉及权限、AI 或截图，已更新隐私/开发文档

## 报告问题

提交 issue 时请尽量包含：

- 浏览器名称和版本
- 扩展版本
- 复现步骤
- 期望结果和实际结果
- 控制台错误或截图

请不要在 issue 中公开 API Key、个人书签导出文件或包含隐私信息的截图。
