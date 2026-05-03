# @x-mars/opendev-ui 设计说明

## 设计目标

- 提供 X-Mars 的 Web 前端界面：聊天、代码百科、追踪分析、调试面板。
- 基于 Vue 3 + Vite + Tailwind CSS 构建（采用 Composition API）。
- 通过 WebSocket + HTTP API 与 `@x-mars/service` 实时通信。
- 提供 Agent 执行状态的可视化（消息流、工具调用、子 Agent 追踪）。

## 非目标

- 不实现后端业务逻辑。
- 不直接调用 Agent（通过 HTTP/WebSocket 间接交互）。

## 实现原理

### 页面结构

3 个核心页面：

| 页面              | 功能                                                     |
| ----------------- | -------------------------------------------------------- |
| **Chat**          | 主聊天界面，消息流展示、工具调用可视化、任务列表         |
| **CodeWiki**      | 代码文档可视化（文件结构、符号引用关系）                 |
| **TraceAnalysis** | Agent 执行追踪分析（执行时间线、token 用量、工具调用图） |

### 状态管理（Pinia Stores）

基于 Pinia 的模块化 store：

| Store              | 职责                                      |
| ------------------ | ----------------------------------------- |
| `chatStore`        | 消息列表、输入状态、当前会话 ID           |
| `sessionStore`     | 多会话管理（列表/创建/删除/切换）         |
| `devtoolsStore`    | 调试面板状态、断点列表                    |
| `fileChangesStore` | 文件变更追踪（diff 显示）                 |
| `logsStore`        | 日志条目展示                              |
| `statusStore`      | Agent 状态机状态、WebSocket 连接状态      |
| `subagentsStore`   | 子 Agent 状态（用于 orchestrator/swarm）  |
| `toastStore`       | 全局通知消息（success / warning / error） |
| `todoStore`        | 任务列表（与 Agent write_todos 工具同步） |
| `traceStore`       | 执行追踪数据（turn 记录 + token 统计）    |

### API 通信层（src/api/）

- `client.ts`：HTTP API 客户端（fetch 封装，统一错误处理）
- `websocket.ts`：WebSocket 客户端，支持：
  - 自动重连（指数退避，最多 5 次）
  - 事件类型映射（JSON 消息反序列化为类型安全对象）
  - 订阅/取消订阅会话事件流
- `devtools.ts`：调试 API 客户端（断点管理/快照拉取/步进控制）

### 组件架构

```
src/
  ├── pages/
  │   ├── Chat.vue            # 聊天页面
  │   ├── CodeWiki.vue        # 代码百科页面
  │   └── TraceAnalysis.vue   # 追踪分析页面
  ├── components/
  │   ├── layout/             # 全局布局（导航/侧边栏）
  │   ├── chat/
  │   │   ├── MessageList     # 消息列表滚动容器
  │   │   ├── MessageItem     # 单条消息（文本/工具调用/代码块）
  │   │   ├── InputArea       # 输入框 + 提交按钮
  │   │   └── ToolCallCard    # 工具调用展示卡（状态/参数/输出）
  │   ├── devtools/           # 调试面板（断点/快照/步进）
  │   ├── settings/           # 设置面板
  │   ├── trace/              # 追踪可视化（时间线/图）
  │   └── ui/                 # 基础 UI 组件（Button/Modal/Toast 等）
  ├── stores/                 # Pinia stores
  ├── api/                    # HTTP + WebSocket 通信
  ├── composables/            # Vue Composables（useWebSocket / useChat 等）
  └── types/                  # 类型定义
```

### WebSocket 事件处理

接收来自 `@x-mars/service` 的事件：

```typescript
// 事件格式
{ type: string, sessionId: string, data: unknown, timestamp: number }

// 关键事件类型
'stream_chunk'       → chatStore.appendChunk()
'tool_call_start'    → chatStore.addToolCallEntry(pending)
'tool_call_end'      → chatStore.updateToolCallEntry(result)
'status_change'      → statusStore.setStatus()
'messages_updated'   → chatStore.syncMessages()
'turn_end'           → traceStore.recordTurn()
```

## 调用链路

### 用户发送消息

```
用户在 InputArea 输入并提交
       │
  chatStore.sendMessage(text)
       │
  POST /chat { sessionId, message: text }
       │
  响应：SSE 流式 chunks（text/event-stream）
       │
  每个 chunk → chatStore.appendChunk() → 渲染
       │
  同时 WebSocket 收到 tool_call_start/end 等事件
       │
  相关 store 更新 → Vue 响应式重渲染
```

### WebSocket 连接与重连

```
App.mount()
       │
  websocket.connect(WS_URL)
       │
  握手成功 → statusStore.setConnected(true)
       │
  发送 { type: 'subscribe', sessionId }
       │
  接收事件流...
       │
  连接断开 → 指数退避重试（1s/2s/4s/8s/16s）
       │
  重连成功 → 重新订阅所有活跃会话
```

## 模块分层

| 目录/文件                  | 职责                                     |
| -------------------------- | ---------------------------------------- |
| `src/pages/`               | Chat / CodeWiki / TraceAnalysis 页面组件 |
| `src/components/chat/`     | 聊天相关组件（消息/输入/工具调用）       |
| `src/components/devtools/` | 调试面板组件                             |
| `src/stores/`              | Pinia 状态管理（9个 store）              |
| `src/api/client.ts`        | HTTP API 客户端                          |
| `src/api/websocket.ts`     | WebSocket 客户端（自动重连）             |
| `src/api/devtools.ts`      | 调试 API 客户端                          |
| `src/composables/`         | Vue Composables                          |
| `src/types/`               | 类型定义                                 |
| `src/main.ts`              | Vue 应用入口（挂载 + Pinia + Router）    |
| `vite.config.ts`           | Vite 构建配置（含 proxy 到后端）         |
| `tailwind.config.js`       | Tailwind 样式配置                        |

## 入口与依赖

- **入口**：`src/main.ts`
- **内部依赖**：无（通过 HTTP/WebSocket 与 `@x-mars/service` 通信）
- **外部依赖**：`vue`、`vite`、`tailwindcss`、`pinia`、`vue-router`、`lucide-vue-next`

## 测试策略

- 以 Vitest 组件测试 + E2E 测试（Playwright）为主
- 覆盖：store 状态逻辑、WebSocket 事件处理、关键组件渲染

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

| Store              | 职责                         |
| ------------------ | ---------------------------- |
| `chatStore`        | 消息列表、输入状态、会话管理 |
| `devtoolsStore`    | 调试面板状态、断点管理       |
| `fileChangesStore` | 文件变更追踪                 |
| `logsStore`        | 日志展示                     |
| `statusStore`      | Agent 状态、连接状态         |
| `subagentsStore`   | 子 Agent 状态                |
| `toastStore`       | 通知消息                     |
| `todoStore`        | 任务列表                     |
| `traceStore`       | 执行追踪数据                 |

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
  WebSocket.connect() → @x-mars/service
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

| 目录              | 职责                                 |
| ----------------- | ------------------------------------ |
| `src/pages/`      | Chat / CodeWiki / TraceAnalysis 页面 |
| `src/components/` | 按功能域组织的组件                   |
| `src/stores/`     | Zustand 状态管理                     |
| `src/api/`        | HTTP + WebSocket 通信                |
| `src/hooks/`      | React Hooks                          |
| `src/utils/`      | 工具函数                             |
| `src/types/`      | 类型定义                             |

## 入口与依赖

- **入口**：`src/main.tsx`
- **内部依赖**：无（通过 HTTP/WebSocket 与后端通信）
- **外部依赖**：`react`、`react-dom`、`vite`、`tailwindcss`、`zustand`、`@xyflow/react`、`lucide-react`

## 测试策略

- 以 Storybook / E2E 测试为主

## 模块设计基线

### 设计目的

提供浏览器端运行界面，承载会话、聊天、工具事件、TODO、状态和 devtools 的可视化交互。

### 接口设计

- `src/api/*`：REST/WebSocket 客户端。
- `components/Chat` / `Layout` / `Devtools`：主要交互组件。
- `stores/*`：前端状态模型。
- `vite build`：构建静态资源到 service 可托管目录。

### 方法论

UI 只消费 service 暴露的协议事件，不直接触碰 Agent 内部对象；本地状态以 store 管理，网络边界以 api 层隔离。

### 实现逻辑

页面启动后建立 WebSocket，加载会话与工作区状态；用户输入发送到 service；流式事件更新消息、工具状态和调试面板。

### 流程逻辑图

```mermaid
flowchart TD
  A[Browser UI] --> B[REST api]
  A --> C[WebSocket]
  B --> D[@x-mars/service]
  C --> D
  D --> E[AgentSession events]
  E --> F[stores]
  F --> G[components render]
```
