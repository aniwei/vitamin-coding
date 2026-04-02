# 断点调试服务与调试面板 — 技术方案

> **范围**: `@vitamin/service` (后端调试路由) + `@vitamin/web-ui` (前端调试面板)  
> **基础**: `@vitamin/devtools` (Worker 线程调试器、断点管理、协议)  
> **日期**: 2026-04-03

---

## 1. 背景与目标

### 1.1 现状

`@vitamin/devtools` 已具备完整的断点调试运行时：

| 能力 | 位置 | 描述 |
|------|------|------|
| 24 种断点类型 | `protocol.ts` | 覆盖 Agent 循环、Tool 执行、Session/Prompt 生命周期 |
| `Breakpoints` 状态管理 | `tools/breakpoints.ts` | enable/disable/list/set per-point |
| `DevtoolsDebugger` 公开 API | `tools/debugger.ts` | pause()、listBreakpoints()、shouldPause() |
| `DevtoolsService` Worker 线程 | `service.ts` + `service-worker.ts` | HTTP/WS 控制面，`Atomics.wait` 同步阻塞 |
| `DebugSnapshot` 快照协议 | `protocol.ts` | turn / point / frameDepth / messagesCount / tokenUsage |
| `DebugCommand` 控制指令 | `protocol.ts` | next / step / over / continue / stop |

**但当前缺失**：

1. `@vitamin/service` 无调试路由 — Web 客户端无法管理断点或接收暂停事件
2. `@vitamin/web-ui` 无调试面板 — 用户无法可视化断点状态/发送控制指令
3. Devtools Worker WS (`/:serviceId/inspect`) 与 Service WS (`/ws`) 是两条独立通道，需要桥接

### 1.2 目标

```
┌──────────────────────────────────────────────────────────────┐
│  Web-UI                                                      │
│ ┌──────────┬─────────────────────────────┬─────────────────┐ │
│ │ Sessions │       ChatInterface         │  DebugPanel     │ │
│ │ Sidebar  │                             │  (右侧面板)      │ │
│ │          │                             │ ┌─────────────┐ │ │
│ │          │                             │ │ 断点列表     │ │ │
│ │          │                             │ │ ☑ loop_start │ │ │
│ │          │                             │ │ ☑ model_bfr  │ │ │
│ │          │                             │ │ ☐ tool_after │ │ │
│ │          │                             │ ├─────────────┤ │ │
│ │          │                             │ │ 运行時快照   │ │ │
│ │          │                             │ │ Turn: 3      │ │ │
│ │          │                             │ │ Point: ...   │ │ │
│ │          │                             │ │ Depth: 1     │ │ │
│ │          │                             │ ├─────────────┤ │ │
│ │          │                             │ │ 控制按钮     │ │ │
│ │          │                             │ │ ▶ ⏭ ⏩ ⏹   │ │ │
│ │          │                             │ └─────────────┘ │ │
│ └──────────┴─────────────────────────────┴─────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. 总体架构

```
                          ┌────────────────────────────┐
                          │     @vitamin/devtools       │
                          │  ┌──────────────────────┐  │
                          │  │  DevtoolsDebugger     │  │
                          │  │  Breakpoints          │  │
                          │  │  DevtoolsService      │  │
                          │  │  (Worker + Atomics)    │  │
                          │  └──────────┬───────────┘  │
                          └─────────────┼──────────────┘
                                        │ devtools 实例引用
                          ┌─────────────▼──────────────┐
                          │    @vitamin/service         │
                          │  ┌──────────────────────┐  │
                          │  │  CodingService        │  │
                          │  │  + debug routes       │  │
                          │  │  + debug WS bridge    │  │
                          │  └──────────┬───────────┘  │
                          └─────────────┼──────────────┘
                              HTTP REST │ WS events
                          ┌─────────────▼──────────────┐
                          │     @vitamin/web-ui         │
                          │  ┌──────────────────────┐  │
                          │  │  DebugPanel           │  │
                          │  │  useDebugStore        │  │
                          │  │  debug WS handlers    │  │
                          │  └──────────────────────┘  │
                          └────────────────────────────┘
```

### 2.1 关键设计决策

| 决策 | 方案 | 理由 |
|------|------|------|
| 调试面板位置 | ChatPage 最右侧可折叠面板 | 与 Sessions Sidebar (左) 对称，不干扰主聊天区 |
| 通信通道 | 复用 Service 的 `/ws` 通道 + REST | 避免客户端维护两条 WS 连接，降低复杂度 |
| 断点管理 API | REST `/api/debug/breakpoints/*` | 断点操作是幂等的 CRUD，适合 REST |
| 暂停/恢复控制 | WS 双向消息 | 实时性要求高，暂停事件需 push，控制指令需即时送达 |
| 调试状态存储 | Zustand store (`useDebugStore`) | 与现有 chat/status/subagents store 统一 |

### 2.2 不做

- **不改动 `@vitamin/devtools` 核心** — Worker/Atomics 阻塞机制已稳定
- **不新增独立 WS 端点** — 复用 `/ws` 通道，扩展消息类型
- **不做断点条件表达式** — V1 仅支持 enable/disable per-point

---

## 3. `@vitamin/service` — 调试路由与桥接层

### 3.1 新增文件

```
packages/service/src/
├── routes/
│   └── debug.ts              ← 新增: REST 调试路由
├── debug-bridge.ts           ← 新增: Devtools WS → Service WS 桥接
├── types.ts                  ← 扩展: 新增调试相关 WS 消息类型
└── coding-service.ts         ← 修改: 集成 debug routes + bridge
```

### 3.2 REST 路由 — `routes/debug.ts`

```typescript
// GET  /api/debug/status          — 调试器连接状态
// GET  /api/debug/breakpoints     — 列出所有断点及状态
// PUT  /api/debug/breakpoints/:point — 设置单个断点 enable/disable
// POST /api/debug/breakpoints/enable-all  — 启用全部
// POST /api/debug/breakpoints/disable-all — 禁用全部
// POST /api/debug/command         — 发送调试指令 (next/step/over/continue/stop)
```

#### 路由实现

```typescript
import { Hono } from 'hono'
import type { Devtools } from '@vitamin/devtools'
import type { BreakpointPoint } from '@vitamin/devtools'

export function createDebugRoute(devtools: Devtools | null): Hono {
  const app = new Hono()

  // 调试器状态
  app.get('/status', (c) => {
    return c.json({
      enabled: devtools !== null,
      connected: devtools !== null,
    })
  })

  // 需要 devtools 实例的路由守卫
  app.use('/*', async (c, next) => {
    if (!devtools) {
      return c.json({ error: 'debugger not enabled' }, 503)
    }
    await next()
  })

  // 列出全部断点
  app.get('/breakpoints', (c) => {
    const list = devtools!.debugger.listBreakpoints()
    return c.json({ breakpoints: list })
  })

  // 设置单个断点
  app.put('/breakpoints/:point', async (c) => {
    const point = c.req.param('point') as BreakpointPoint
    const { enabled } = await c.req.json<{ enabled: boolean }>()
    const result = devtools!.debugger.setBreakpoint(point, enabled)
    return c.json({ breakpoint: result })
  })

  // 批量启用/禁用
  app.post('/breakpoints/enable-all', (c) => {
    devtools!.debugger.enableAllBreakpoints()
    return c.json({ status: 'ok' })
  })

  app.post('/breakpoints/disable-all', (c) => {
    devtools!.debugger.disableAllBreakpoints()
    return c.json({ status: 'ok' })
  })

  // 发送调试指令 — 转发给 Devtools Worker
  app.post('/command', async (c) => {
    const command = await c.req.json<{ type: string; seq?: number }>()
    // command 会通过 debug-bridge 转发到 Devtools Worker WS
    return c.json({ status: 'ok', command: command.type })
  })

  return app
}
```

### 3.3 DebugBridge — `debug-bridge.ts`

桥接 Devtools Worker WS ↔ Service WebSocketManager：

```typescript
import WebSocket from 'ws'
import { createLogger } from '@vitamin/shared'
import type { WebSocketManager } from './websocket-manager'
import type { Devtools } from '@vitamin/devtools'
import type { DebugCommand } from '@vitamin/devtools'

const logger = createLogger('@vitamin/service:debug-bridge')

/**
 * 将 Devtools Worker 的 WS 事件桥接到 Service 的 WebSocketManager。
 *
 * 方向:
 *   Devtools Worker WS → (paused event) → Service WS → Web-UI
 *   Web-UI → (debug command) → Service WS → Devtools Worker WS
 */
export class DebugBridge {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly devtools: Devtools,
    private readonly wsManager: WebSocketManager,
  ) {}

  /** 连接到 Devtools Worker 的 inspect WS */
  attach(): void {
    this.connect()
  }

  /** 断开桥接 */
  detach(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  /** 向 Devtools Worker WS 发送调试指令 */
  sendCommand(command: DebugCommand): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(command))
    } else {
      logger.warn('debug bridge not connected, command dropped')
    }
  }

  private connect(): void {
    // DevtoolsService 暴露 WS URL: ws://host:port/:serviceId/inspect
    const inspectUrl = this.devtools.debugger.serviceUrl
      .replace(/\/command\/debugger\/paused$/, '/inspect')
      .replace('http://', 'ws://')

    this.ws = new WebSocket(inspectUrl)

    this.ws.on('open', () => {
      logger.info('debug bridge connected to devtools worker')
    })

    this.ws.on('message', (data: Buffer) => {
      try {
        const event = JSON.parse(data.toString())
        this.handleDevtoolsEvent(event)
      } catch {
        logger.warn('invalid message from devtools worker')
      }
    })

    this.ws.on('close', () => {
      logger.info('debug bridge disconnected, scheduling reconnect')
      this.scheduleReconnect()
    })

    this.ws.on('error', (err) => {
      logger.warn(`debug bridge error: ${err.message}`)
    })
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => this.connect(), 2000)
  }

  /**
   * 将 Devtools Worker 的调试事件转换为 Service WS 消息格式，
   * 广播给所有 Web-UI 客户端。
   */
  private handleDevtoolsEvent(event: Record<string, unknown>): void {
    switch (event.type) {
      case 'Agent.debugger.paused':
        this.wsManager.broadcast({
          type: 'debug_paused',
          data: {
            point: (event.snapshot as Record<string, unknown>)?.point,
            snapshot: event.snapshot as Record<string, unknown>,
            timestamp: new Date().toISOString(),
          },
        })
        break

      case 'Debugger.command':
        // Worker 广播的指令确认，转发给 UI 以同步状态
        this.wsManager.broadcast({
          type: 'debug_command',
          data: {
            command: event.command as Record<string, unknown>,
            timestamp: new Date().toISOString(),
          },
        })
        break

      default:
        break
    }
  }
}
```

### 3.4 类型扩展 — `types.ts`

```typescript
// 在现有 WebSocketEventType 中追加:
export type WebSocketEventType =
  | /* ...existing 28 types... */
  | 'debug_paused'       // Devtools → 客户端: Agent 在断点暂停
  | 'debug_resumed'      // Devtools → 客户端: Agent 已恢复执行
  | 'debug_command'      // 双向: 调试指令确认
  | 'debug_breakpoints'  // 服务端 → 客户端: 断点列表变更推送

// 在现有 WebSocketClientMessageType 中追加:
export type WebSocketClientMessageType =
  | /* ...existing 8 types... */
  | 'debug_command'           // 客户端 → 服务端: 发送调试指令
  | 'debug_set_breakpoint'    // 客户端 → 服务端: 设置断点
  | 'debug_subscribe'         // 客户端 → 服务端: 订阅调试事件
```

### 3.5 `CodingService` 集成

```typescript
// coding-service.ts 修改要点:

export interface CodingServiceOptions {
  // ...existing fields...
  /** @vitamin/devtools 实例，传入后启用调试能力 */
  devtools?: Devtools
}

export class CodingService {
  private debugBridge: DebugBridge | null = null

  constructor(ctx: VitaminContext, options: CodingServiceOptions) {
    // ...existing init...
    
    // 注册调试路由
    this.app.route('/api/debug', createDebugRoute(options.devtools ?? null))

    // 创建调试桥接
    if (options.devtools) {
      this.debugBridge = new DebugBridge(options.devtools, this.ws)
    }

    // 扩展 WS 客户端消息处理
    this.ws.onClientMessage((clientId, message) => {
      if (message.type === 'debug_command') {
        this.handleDebugCommand(message.data)
        return
      }
      this.handleClientMessage(clientId, message)
    })
  }

  async start(): Promise<void> {
    // ...existing start logic...
    this.debugBridge?.attach()
  }

  async stop(): Promise<void> {
    this.debugBridge?.detach()
    // ...existing stop logic...
  }

  private handleDebugCommand(data: Record<string, unknown>): void {
    if (!this.debugBridge) return
    this.debugBridge.sendCommand({
      type: data.type as string,
      seq: (data.seq as number) ?? 0,
      ...(data.depth !== undefined ? { depth: data.depth as number } : {}),
    } as any)
  }
}
```

---

## 4. `@vitamin/web-ui` — 调试面板

### 4.1 新增文件

```
packages/web-ui/src/
├── components/
│   └── Debug/
│       ├── DebugPanel.tsx           ← 主面板容器 (右侧可折叠)
│       ├── BreakpointList.tsx       ← 断点列表 (带分组 + 开关)
│       ├── SnapshotViewer.tsx       ← 暂停时的运行时快照
│       ├── DebugControls.tsx        ← 调试控制按钮 (continue/next/step/stop)
│       └── DebugStatusBadge.tsx     ← TopBar 中的调试状态指示器
├── stores/
│   └── debug.ts                    ← Zustand 调试状态 store
├── api/
│   └── debug.ts                    ← REST + WS 调试 API 客户端
└── types/
    └── debug.ts                    ← 调试相关类型定义
```

### 4.2 类型定义 — `types/debug.ts`

```typescript
// 与 @vitamin/devtools/protocol.ts 对齐
export const BREAKPOINT_CATEGORIES = {
  'Agent 循环': [
    'loop_start', 'model_before', 'model_after',
    'tool_before', 'tool_after', 'loop_end',
    'loop_cleanup', 'agent_aborted', 'agent_error', 'agent_done',
  ],
  '循环注入': [
    'steering_check', 'follow_up_check', 'context_transform',
  ],
  'Tool 执行': [
    'tool_resolve', 'tool_validate', 'tool_hook_before', 'tool_hook_after',
  ],
  'Session/Prompt': [
    'prompt_before', 'prompt_after', 'context_build',
    'messages_persist', 'session_create', 'session_fork', 'session_restore',
  ],
} as const

export type BreakpointPoint = string

export interface Breakpoint {
  point: BreakpointPoint
  enabled: boolean
}

export interface DebugSnapshot {
  turn: number
  point: BreakpointPoint
  frameDepth: number
  messagesCount: number
  lastToolName?: string
  tokenUsage?: { input: number; output: number }
  metadata?: Record<string, string | number | boolean | null>
}

export type DebugCommandType = 'next' | 'step' | 'over' | 'continue' | 'stop'
```

### 4.3 API 客户端 — `api/debug.ts`

```typescript
const BASE = '/api/debug'

export async function fetchDebugStatus(): Promise<{ enabled: boolean; connected: boolean }> {
  const res = await fetch(`${BASE}/status`)
  return res.json()
}

export async function fetchBreakpoints(): Promise<Breakpoint[]> {
  const res = await fetch(`${BASE}/breakpoints`)
  const data = await res.json()
  return data.breakpoints
}

export async function setBreakpoint(point: string, enabled: boolean): Promise<Breakpoint> {
  const res = await fetch(`${BASE}/breakpoints/${point}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  const data = await res.json()
  return data.breakpoint
}

export async function enableAllBreakpoints(): Promise<void> {
  await fetch(`${BASE}/breakpoints/enable-all`, { method: 'POST' })
}

export async function disableAllBreakpoints(): Promise<void> {
  await fetch(`${BASE}/breakpoints/disable-all`, { method: 'POST' })
}

// WS 指令通过 WebSocket 客户端发送 (非 REST)
```

### 4.4 Zustand Store — `stores/debug.ts`

```typescript
import { create } from 'zustand'
import type { Breakpoint, DebugSnapshot, DebugCommandType } from '../types/debug'
import * as debugApi from '../api/debug'

interface DebugState {
  // 连接状态
  enabled: boolean
  connected: boolean

  // 面板可见性
  panelOpen: boolean

  // 断点列表
  breakpoints: Breakpoint[]
  loadingBreakpoints: boolean

  // 暂停状态
  paused: boolean
  currentSnapshot: DebugSnapshot | null
  snapshotHistory: DebugSnapshot[]     // 最近 N 个快照

  // Actions
  togglePanel: () => void
  openPanel: () => void
  closePanel: () => void

  fetchStatus: () => Promise<void>
  fetchBreakpoints: () => Promise<void>
  toggleBreakpoint: (point: string) => Promise<void>
  enableAll: () => Promise<void>
  disableAll: () => Promise<void>

  // WS 事件处理
  handlePaused: (snapshot: DebugSnapshot) => void
  handleResumed: () => void

  // 调试指令 (通过 WS 发送)
  sendCommand: (type: DebugCommandType) => void
}

export const useDebugStore = create<DebugState>((set, get) => ({
  enabled: false,
  connected: false,
  panelOpen: false,
  breakpoints: [],
  loadingBreakpoints: false,
  paused: false,
  currentSnapshot: null,
  snapshotHistory: [],

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),

  fetchStatus: async () => {
    const status = await debugApi.fetchDebugStatus()
    set({ enabled: status.enabled, connected: status.connected })
  },

  fetchBreakpoints: async () => {
    set({ loadingBreakpoints: true })
    const breakpoints = await debugApi.fetchBreakpoints()
    set({ breakpoints, loadingBreakpoints: false })
  },

  toggleBreakpoint: async (point) => {
    const bp = get().breakpoints.find((b) => b.point === point)
    if (!bp) return
    const updated = await debugApi.setBreakpoint(point, !bp.enabled)
    set((s) => ({
      breakpoints: s.breakpoints.map((b) =>
        b.point === point ? updated : b,
      ),
    }))
  },

  enableAll: async () => {
    await debugApi.enableAllBreakpoints()
    set((s) => ({
      breakpoints: s.breakpoints.map((b) => ({ ...b, enabled: true })),
    }))
  },

  disableAll: async () => {
    await debugApi.disableAllBreakpoints()
    set((s) => ({
      breakpoints: s.breakpoints.map((b) => ({ ...b, enabled: false })),
    }))
  },

  handlePaused: (snapshot) => {
    set((s) => ({
      paused: true,
      currentSnapshot: snapshot,
      snapshotHistory: [...s.snapshotHistory.slice(-49), snapshot],
    }))
  },

  handleResumed: () => {
    set({ paused: false, currentSnapshot: null })
  },

  sendCommand: (type) => {
    // 由 websocket.ts 实际发送
    // wsClient.send({ type: 'debug_command', data: { type, seq: Date.now() } })
  },
}))
```

### 4.5 WebSocket 集成 — 扩展 `api/websocket.ts`

在现有 `WebSocketClient` 的事件分发中加入调试事件处理：

```typescript
// api/websocket.ts 追加 handler 注册

import { useDebugStore } from '../stores/debug'

// 在 connect() 后注册调试事件 handler:
wsClient.on('debug_paused', (data) => {
  useDebugStore.getState().handlePaused(data.snapshot)
  // 自动展开调试面板
  useDebugStore.getState().openPanel()
})

wsClient.on('debug_resumed', () => {
  useDebugStore.getState().handleResumed()
})

wsClient.on('debug_breakpoints', (data) => {
  // 服务端推送的断点变更（多客户端同步场景）
  useDebugStore.setState({ breakpoints: data.breakpoints })
})
```

### 4.6 组件设计

#### 4.6.1 `DebugPanel.tsx` — 主面板

```
┌─── DebugPanel (w-80, 右侧可折叠) ──────────┐
│ ┌─ Header ────────────────────────────────┐ │
│ │ 🔧 调试器           [折叠按钮]          │ │
│ │ ● 已连接 / ○ 未启用                     │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─ DebugControls (暂停时显示) ────────────┐ │
│ │  ▶ Continue  ⏭ Next  ⤵ Step  ⏹ Stop   │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─ SnapshotViewer (暂停时显示) ───────────┐ │
│ │  Point:  model_before                   │ │
│ │  Turn:   3                              │ │
│ │  Depth:  1                              │ │
│ │  Msgs:   12                             │ │
│ │  Tool:   read_file                      │ │
│ │  Tokens: 1,234 in / 567 out            │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─ BreakpointList ────────────────────────┐ │
│ │ [Enable All] [Disable All]              │ │
│ │                                         │ │
│ │ ▸ Agent 循环 (10)                  6/10 │ │
│ │   ☑ loop_start                          │ │
│ │   ☑ model_before                        │ │
│ │   ☑ model_after                         │ │
│ │   ☐ tool_before                         │ │
│ │   ...                                   │ │
│ │                                         │ │
│ │ ▸ 循环注入 (3)                     3/3  │ │
│ │ ▸ Tool 执行 (4)                    2/4  │ │
│ │ ▸ Session/Prompt (7)               7/7  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─ Snapshot History (可展开) ─────────────┐ │
│ │  #3  model_before  T=3  12:34:56       │ │
│ │  #2  tool_after    T=2  12:34:51       │ │
│ │  #1  loop_start    T=1  12:34:45       │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**样式要点**:

- 宽度 `w-80` (320px)，与 `SessionsSidebar` 的 288px 相近
- 暗色背景 `bg-bg-100`，与整体主题一致
- 折叠/展开动画 `transition-all duration-250`，与 `SessionsSidebar` 一致
- 暂停状态时顶部高亮 amber/yellow 闪烁指示

#### 4.6.2 `BreakpointList.tsx`

```tsx
// 按 BREAKPOINT_CATEGORIES 分组
// 每组 collapsible (默认展开)
// 每个断点一行: checkbox + point 名称
// 当前暂停的 point 高亮标记
// 组标题显示 启用数/总数
```

#### 4.6.3 `SnapshotViewer.tsx`

```tsx
// 仅在 paused = true 时渲染
// key-value 网格布局展示 DebugSnapshot 字段
// metadata 字段可展开为 JSON 树
// tokenUsage 显示 bar 进度条
```

#### 4.6.4 `DebugControls.tsx`

```tsx
// 4 个操作按钮:
// Continue (▶)  — { type: 'continue' }
// Next (⏭)     — { type: 'next' }     运行到下一个断点
// Step (⤵)     — { type: 'step' }     单步
// Stop (⏹)     — { type: 'stop' }     终止执行

// 快捷键绑定:
// F5 — Continue
// F10 — Next
// F11 — Step
// Shift+F5 — Stop
```

#### 4.6.5 `DebugStatusBadge.tsx`

在 `TopBar` 右侧显示调试状态徽章：

```tsx
// 三种状态:
// 1. 未启用: 灰色 "Debug Off"
// 2. 运行中: 绿色圆点 "Debug"
// 3. 已暂停: 闪烁 amber 圆点 "Paused at {point}" — 点击展开面板
```

### 4.7 ChatPage 布局修改

```tsx
// pages/ChatPage.tsx

export function ChatPage() {
  const { panelOpen } = useDebugStore()

  return (
    <div className="h-screen flex flex-col bg-bg-100">
      <TopBar onOpenCommandPalette={openCommandPalette} />
      <div className="flex-1 flex overflow-hidden">
        <SessionsSidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-bg-000">
          <ChatInterface />
        </main>
        {/* 调试面板 — 最右侧 */}
        <DebugPanel />
      </div>
      {/* ...modals... */}
    </div>
  )
}
```

`DebugPanel` 内部根据 `panelOpen` 控制宽度切换：

```tsx
<aside
  className={`
    flex flex-col border-l border-border-200
    transition-all duration-250 overflow-hidden
    ${panelOpen ? 'w-80' : 'w-0'}
  `}
>
  {panelOpen && <DebugPanelContent />}
</aside>
```

---

## 5. 数据流

### 5.1 断点管理流

```
  Web-UI                   Service                    Devtools
    │                         │                          │
    │ PUT /api/debug/         │                          │
    │   breakpoints/model_before                         │
    │ { enabled: false }      │                          │
    │ ───────────────────────>│                          │
    │                         │  devtools.debugger       │
    │                         │   .setBreakpoint(        │
    │                         │     'model_before',      │
    │                         │     false)               │
    │                         │ ─────────────────────────>
    │                         │                          │ Breakpoints.set()
    │                         │                          │ (in-memory Map)
    │  200 { breakpoint }     │                          │
    │ <───────────────────────│                          │
    │                         │                          │
    │  Zustand: update state  │                          │
```

### 5.2 暂停/恢复流

```
  Agent (main thread)     Devtools Worker       Service              Web-UI
    │                         │                    │                    │
    │ invariant(() =>         │                    │                    │
    │  devtools.debugger      │                    │                    │
    │   .pause(snapshot))     │                    │                    │
    │                         │                    │                    │
    │  Atomics.wait ──────────│                    │                    │
    │  (blocked)              │                    │                    │
    │                         │ WS: Agent.debugger │                    │
    │                         │   .paused          │                    │
    │                         │ ─────────────────> │                    │
    │                         │                    │ DebugBridge:       │
    │                         │                    │  handleDevtoolsEvent
    │                         │                    │                    │
    │                         │                    │ WS broadcast:      │
    │                         │                    │  debug_paused      │
    │                         │                    │ ──────────────────>│
    │                         │                    │                    │ handlePaused()
    │                         │                    │                    │ 展开 DebugPanel
    │                         │                    │                    │ 展示 SnapshotViewer
    │                         │                    │                    │
    │                         │                    │                    │ 用户点击 Continue
    │                         │                    │                    │
    │                         │                    │  WS: debug_command │
    │                         │                    │ <──────────────────│
    │                         │                    │                    │
    │                         │                    │ DebugBridge:       │
    │                         │  WS: { type:       │  sendCommand()     │
    │                         │    'continue' }    │                    │
    │                         │ <───────────────── │                    │
    │                         │                    │                    │
    │                         │ resolvePause():    │                    │
    │                         │  Atomics.store(1)  │                    │
    │                         │  Atomics.notify()  │                    │
    │                         │                    │                    │
    │  Atomics.wait returns   │                    │                    │
    │  (unblocked, continue)  │                    │                    │
    │ ───────────────────────>│                    │                    │
```

---

## 6. 实现计划

### Phase 1: Service 调试路由 (后端)

| 任务 | 文件 | 说明 |
|------|------|------|
| 1.1 | `service/src/types.ts` | 扩展 WS 消息类型 |
| 1.2 | `service/src/routes/debug.ts` | REST 断点管理 + 状态查询 |
| 1.3 | `service/src/debug-bridge.ts` | Devtools WS ↔ Service WS 桥接 |
| 1.4 | `service/src/coding-service.ts` | 集成 debug route + bridge |
| 1.5 | `service/src/index.ts` | 导出新增类型 |

### Phase 2: Web-UI 调试面板 (前端)

| 任务 | 文件 | 说明 |
|------|------|------|
| 2.1 | `web-ui/src/types/debug.ts` | 调试类型定义 |
| 2.2 | `web-ui/src/api/debug.ts` | REST API 客户端 |
| 2.3 | `web-ui/src/stores/debug.ts` | Zustand store |
| 2.4 | `web-ui/src/api/websocket.ts` | 注册调试 WS 事件 handler |
| 2.5 | `web-ui/src/components/Debug/BreakpointList.tsx` | 断点列表组件 |
| 2.6 | `web-ui/src/components/Debug/SnapshotViewer.tsx` | 快照查看器 |
| 2.7 | `web-ui/src/components/Debug/DebugControls.tsx` | 调试控制按钮 |
| 2.8 | `web-ui/src/components/Debug/DebugPanel.tsx` | 面板容器 |
| 2.9 | `web-ui/src/components/Debug/DebugStatusBadge.tsx` | TopBar 状态徽章 |
| 2.10 | `web-ui/src/pages/ChatPage.tsx` | 集成 DebugPanel (右侧) |
| 2.11 | `web-ui/src/components/Layout/TopBar.tsx` | 集成 DebugStatusBadge |

### Phase 3: 联调与测试

| 任务 | 说明 |
|------|------|
| 3.1 | Vite 开发代理增加 `/api/debug` 前缀 |
| 3.2 | 端到端联调: 启动 Agent → 命中断点 → 面板暂停 → 点击 Continue → 恢复 |
| 3.3 | 补充 `service/tests/debug-routes.test.ts` |
| 3.4 | 快捷键绑定测试 (F5/F10/F11/Shift+F5) |

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Devtools Worker WS 连接延迟 | 首次断点 event 可能丢失 | DebugBridge 自动重连 + 首次 attach 等待 Worker 就绪 |
| 多 Web-UI 客户端同时发 command | 竞态: 多个 continue 指令 | Service 侧 dedup: 同一 pause 只接受第一个 command |
| DebugPanel 占用屏幕空间 | 小屏幕体验差 | 可折叠设计 + 记忆面板状态 |
| Agent Atomics 阻塞时间过长 | 面板无响应感 | 显示阻塞秒数计时器 + Stop 按钮随时可用 |
| devtools 未启用时 | 面板无数据 | `/api/debug/status` 返回 `enabled: false`，面板显示 "调试器未启用" 占位 |
