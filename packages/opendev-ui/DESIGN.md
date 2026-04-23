# @vitamin/web-ui 设计说明

## 设计目标

- 提供 Vitamin 的 Web 前端界面：聊天、代码百科、追踪分析。
- 基于 React 18 + Vite + Tailwind CSS 构建。
- 通过 WebSocket + HTTP API 与 `@vitamin/service` 通信。

## 非目标

- 不实现后端业务逻辑。
- 不直接调用 Agent（通过 HTTP/WebSocket 间接交互）。

## 实现原理

### 页面结构

3 个核心页面：
- **Chat**：主聊天界面，支持消息流、工具调用展示、任务列表
- **CodeWiki**：代码文档可视化
- **TraceAnalysis**：Agent 执行追踪分析

### 状态管理

基于 Zustand 的模块化 store：

| Store | 职责 |
|-------|------|
| `chatStore` | 消息列表、输入状态、会话管理 |
| `devtoolsStore` | 调试面板状态、断点管理 |
| `fileChangesStore` | 文件变更追踪 |
| `logsStore` | 日志展示 |
| `statusStore` | Agent 状态、连接状态 |
| `subagentsStore` | 子 Agent 状态 |
| `toastStore` | 通知消息 |
| `todoStore` | 任务列表 |
| `traceStore` | 执行追踪数据 |

### API 通信层

- `client.ts`：HTTP API 客户端（Fetch 封装）
- `websocket.ts`：WebSocket 客户端（自动重连 + 事件类型映射）
- `devtools.ts`：调试 API 客户端

### 组件架构

```
Layout/                  # 全局布局（导航、侧边栏）
  ├── Chat/              # 聊天页面组件
  │     ├── MessageList  # 消息列表渲染
  │     ├── MessageItem  # 单条消息（文本/工具/代码）
  │     ├── InputArea    # 输入区域
  │     └── ToolCall     # 工具调用展示
  ├── CodeWiki/          # 代码百科组件
  ├── Devtools/          # 调试面板组件
  ├── Settings/          # 设置面板
  ├── TraceAnalysis/     # 追踪分析组件
  └── ui/                # 基础 UI 组件库
```

### 流图可视化

基于 `@xyflow/react`（原 React Flow）实现执行流可视化：
- Agent 执行节点
- 工具调用边
- 分支和并行路径

## 实现流程

```
用户打开 Web UI
       |
  WebSocket.connect() → @vitamin/service
       |
  订阅会话事件
       |
  用户输入消息 → POST /api/chat
       |
  SSE 流式接收响应
       |
  chatStore 更新 → React 重渲染
       |
  消息流展示 + 工具调用动画
       |
  WebSocket 事件 → 各 store 更新
       |
  实时状态同步
```

## 模块分层

| 目录 | 职责 |
|------|------|
| `src/pages/` | Chat / CodeWiki / TraceAnalysis 页面 |
| `src/components/` | 按功能域组织的组件 |
| `src/stores/` | Zustand 状态管理 |
| `src/api/` | HTTP + WebSocket 通信 |
| `src/hooks/` | React Hooks |
| `src/utils/` | 工具函数 |
| `src/types/` | 类型定义 |

## 入口与依赖

- **入口**：`src/main.tsx`
- **内部依赖**：无（通过 HTTP/WebSocket 与后端通信）
- **外部依赖**：`react`、`react-dom`、`vite`、`tailwindcss`、`zustand`、`@xyflow/react`、`lucide-react`

## 测试策略

- 以 Storybook / E2E 测试为主
