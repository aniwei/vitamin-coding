# @vitamin/assistant-ui 设计说明

## 设计目标

- 预留为 Vitamin 助手级 UI 组件库，提供可嵌入的智能助手界面。
- 与 `@vitamin/web-ui` 互补：web-ui 是完整 Web 应用，assistant-ui 是可嵌入组件。

## 非目标

- 当前为占位包，暂无源代码实现。

## 当前状态

包已创建并发布占位版本，等待后续开发：
- `package.json` 已定义包名和基本依赖
- 无 `src/` 目录
- 无构建/测试流程

## 后续规划

- 提供 `<AssistantPanel />` 可嵌入聊天面板
- 提供 `<AssistantButton />` 浮动触发按钮
- 支持主题定制
- 与 `@vitamin/service` WebSocket 通信
