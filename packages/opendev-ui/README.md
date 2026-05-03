# @x-mars/web-ui

## 模块定位

X-Mars 的 Web 前端界面，基于 React 18 + Vite + Tailwind CSS 构建，提供聊天、代码百科、追踪分析三大页面。

## 核心功能

| 页面          | 功能                                       |
| ------------- | ------------------------------------------ |
| Chat          | 聊天界面（消息流、工具调用展示、任务列表） |
| CodeWiki      | 代码文档可视化                             |
| TraceAnalysis | Agent 执行追踪分析（@xyflow/react 流图）   |

## 技术栈

- **框架**: React 18 + TypeScript
- **构建**: Vite
- **样式**: Tailwind CSS
- **状态**: Zustand（9 个模块化 store）
- **通信**: HTTP API + WebSocket（自动重连）
- **可视化**: @xyflow/react

## 目录概览

```
src/
  main.tsx              # 应用入口
  pages/                # 3 个核心页面
  components/
    Chat/               # 聊天组件
    CodeWiki/           # 代码百科
    Devtools/           # 调试面板
    Layout/             # 布局
    Settings/           # 设置
    TraceAnalysis/      # 追踪分析
    ui/                 # 基础组件
  stores/               # Zustand 状态管理
  api/                  # HTTP + WebSocket 客户端
  hooks/                # React Hooks
  utils/                # 工具函数
  types/                # 类型定义
```

## 开发命令

```bash
pnpm --filter @x-mars/web-ui dev       # Vite 开发服务器
pnpm --filter @x-mars/web-ui build     # 生产构建
pnpm --filter @x-mars/web-ui preview   # 预览构建产物
```

## 关联包

通过 HTTP/WebSocket 与 `@x-mars/service` 通信。
