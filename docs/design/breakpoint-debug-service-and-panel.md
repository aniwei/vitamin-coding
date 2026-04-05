# 断点调试服务与调试面板 — 技术方案

> **范围**: `@vitamin/devtools` (Atomics 协议升级) + `@vitamin/service` (调试/日志路由) + `@vitamin/web-ui` (调试面板 + 日志面板)  
> **基础**: `@vitamin/devtools` (Worker 线程调试器、断点管理、协议)  
> **日期**: 2026-04-03  
> **修订**: v2 — 新增日志面板、Atomics 回写协议

---

## 1. 背景与目标

### 1.1 现状

`@vitamin/devtools` 已具备完整的断点调试运行时：

| 能力 | 位置 | 描述 |
|------|------|------|
| 24 种断点类型 | `protocol.ts` | 覆盖 Agent 循环、Tool 执行、Session/Prompt 生命周期 |
| `Breakpoints` 状态管理 | `tools/breakpoints.ts` | enable/disable/list/set per-point |
| `Debugger` 公开 API | `tools/debugger.ts` | pause()、listBreakpoints()、shouldPause() |
| `DevtoolsService` Worker 线程 | `service.ts` + `service-worker.ts` | HTTP/WS 控制面，`Atomics.wait` 同步阻塞 |
| `DebugSnapshot` 快照协议 | `protocol.ts` | turn / point / frameDepth / messagesCount / tokenUsage |
| `DebugCommand` 控制指令 | `protocol.ts` | next / step / over / continue / stop |
| `DevtoolsLogger` | `tools/logger.ts` + `routes/logger.ts` | broadcast 日志到 Worker WS 客户端 |

**当前缺失**：

1. `@vitamin/service` 无调试路由 — Web 客户端无法管理断点或接收暂停事件
2. `@vitamin/service` 无日志路由 — Web 客户端无法接收运行时日志流
3. `@vitamin/web-ui` 无调试面板 — 用户无法可视化断点状态/发送控制指令
4. `@vitamin/web-ui` 无日志面板 — 用户无法实时查看 Agent/Tool/Session 运行日志
5. Devtools Worker WS (`/:serviceId/inspect`) 与 Service WS (`/ws`) 是两条独立通道，需要桥接
6. **Atomics 协议过于简单** — 当前 `SharedArrayBuffer` 仅 1 个 `Int32` (0=pending, 1=resumed)，无法携带回写数据；用户在暂停时无法修改快照/注入消息并回传给 Agent 线程

### 1.2 目标

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  Web-UI                                                                       │
│ ┌──────────┬─────────────────────────────┬──────────────────────────────────┐ │
│ │ Sessions │       ChatInterface         │  右侧面板 (Tab 切换)              │ │
│ │ Sidebar  │                             │ ┌────────────┬─────────────────┐ │ │
│ │          │                             │ │ 🔧 调试     │ 📋 日志          │ │ │
│ │          │                             │ ├────────────┴─────────────────┤ │ │
│ │          │                             │ │ [调试 Tab]                   │ │ │
│ │          │                             │ │  断点列表 (分组+开关)         │ │ │
│ │          │                             │ │  运行时快照                   │ │ │
│ │          │                             │ │  快照编辑器 (回写上下文)       │ │ │
│ │          │                             │ │  控制按钮 ▶ ⏭ ⏩ ⏹          │ │ │
│ │          │                             │ │                              │ │ │
│ │          │                             │ │ [日志 Tab]                   │ │ │
│ │          │                             │ │  实时日志流                   │ │ │
│ │          │                             │ │  级别过滤 / 模块过滤          │ │ │
│ │          │                             │ │  搜索 / 自动滚动              │ │ │
│ │          │                             │ └──────────────────────────────┘ │ │
│ └──────────┴─────────────────────────────┴──────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 总体架构

```
                          ┌────────────────────────────┐
                          │     @vitamin/devtools       │
                          │  ┌──────────────────────┐  │
                          │  │  Debugger     │  │
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
| 调试面板位置 | Chat 最右侧可折叠面板 | 与 Sessions Sidebar (左) 对称，不干扰主聊天区 |
| 通信通道 | 复用 Service 的 `/ws` 通道 + REST | 避免客户端维护两条 WS 连接，降低复杂度 |
| 断点管理 API | REST `/api/debug/breakpoints/*` | 断点操作是幂等的 CRUD，适合 REST |
| 暂停/恢复控制 | WS 双向消息 | 实时性要求高，暂停事件需 push，控制指令需即时送达 |
| 调试状态存储 | Zustand store (`useDebugStore`) | 与现有 chat/status/subagents store 统一 |

### 2.2 需要改动 `@vitamin/devtools`

- **升级 Atomics 协议** — 从 1-int 信号量升级为结构化共享内存，支持携带回写 payload
- **扩展 `DebugSnapshot`** — 增加 `messages` / `systemPrompt` / `context` 可编辑字段
- **`Debugger.pause()` 返回值变更** — 从 `void` 变为 `PauseResult`，携带回写数据

### 2.3 不做

- **不新增独立 WS 端点** — 复用 `/ws` 通道，扩展消息类型
- **不做断点条件表达式** — V1 仅支持 enable/disable per-point

---

## 3. `@vitamin/devtools` — Atomics 回写协议升级

### 3.1 问题分析

当前 `DevtoolsService.pause()` 的共享内存结构：

```
SharedArrayBuffer (4 bytes)
┌─────────────┐
│ Int32[0]    │  0 = WAKE_PENDING, 1 = WAKE_RESUMED
└─────────────┘
```

主线程 `Atomics.wait(state, 0, 0)` → Worker 收到 command → `Atomics.store(state, 0, 1)` + `Atomics.notify()` → 主线程唤醒。

**局限**：只有一个 bit 的信息量（恢复/未恢复），无法传递：
- 用户在 UI 修改的快照数据（如编辑 systemPrompt）
- 注入的消息（如插入用户 steering message）
- 修改的 metadata（如覆盖 temperature/maxTokens）

### 3.2 升级方案：分层共享内存

```
SharedArrayBuffer (动态大小)
┌──────────────────────────────────────────────────────┐
│ Header (固定 12 bytes)                                │
│ ┌──────────┬──────────┬──────────┐                   │
│ │ Int32[0] │ Int32[1] │ Int32[2] │                   │
│ │ state    │ command  │ payload  │                   │
│ │ flag     │ type     │ length   │                   │
│ └──────────┴──────────┴──────────┘                   │
│                                                      │
│ Payload region (可变长度)                              │
│ ┌────────────────────────────────────────────────┐   │
│ │ Uint8Array — UTF-8 encoded JSON string         │   │
│ │ (PauseResumePayload serialized)                │   │
│ └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

**字段说明**：

| 偏移 | 字段 | 类型 | 说明 |
|------|------|------|------|
| `Int32[0]` | state | 0/1/2 | 0=PENDING, 1=RESUMED, 2=RESUMED_WITH_PAYLOAD |
| `Int32[1]` | commandType | enum | 0=continue, 1=next, 2=step, 3=over, 4=stop |
| `Int32[2]` | payloadLength | uint32 | Payload JSON 字节长度 (0 表示无回写) |
| `byte[12..]` | payload | Uint8Array | UTF-8 JSON 字符串 (`PauseResumePayload`) |

### 3.3 协议类型定义 — `protocol.ts` 扩展

```typescript
// ─── 现有 DebugSnapshot 扩展 ───
export interface DebugSnapshot {
  turn: number
  point: BreakpointPoint
  frameDepth: number
  messagesCount: number
  lastToolName?: string
  tokenUsage?: { input: number; output: number }
  metadata?: Record<string, string | number | boolean | null>

  // ─── V2: 可编辑上下文 (暂停时发送给 UI, 恢复时可回写) ───
  /** 当前系统提示词 (仅在 model_before / prompt_before 断点携带) */
  systemPrompt?: string
  /** 当前消息上下文摘要 (最后 N 条消息的精简表示) */
  messagesSummary?: MessageSummaryItem[]
  /** 当前 LLM 参数 */
  llmParams?: {
    temperature?: number
    maxTokens?: number
    thinkingLevel?: string
  }
}

export interface MessageSummaryItem {
  index: number
  role: 'user' | 'assistant' | 'tool_result' | 'system'
  preview: string        // 前 200 字符
  toolName?: string      // tool_result 消息的工具名
  tokenEstimate?: number // 粗略 token 估算
}

// ─── V2: 回写载荷 ───
export interface PauseResumePayload {
  /** 修改后的系统提示词 (undefined = 不修改) */
  systemPrompt?: string
  /** 注入的消息 (追加到当前消息列表尾部) */
  injectMessages?: InjectedMessage[]
  /** 要删除的消息索引 (从 messagesSummary 中选取) */
  removeMessageIndices?: number[]
  /** 覆盖的 LLM 参数 */
  llmParams?: {
    temperature?: number
    maxTokens?: number
    thinkingLevel?: string
  }
  /** 自由 metadata 回写 */
  metadata?: Record<string, string | number | boolean | null>
}

export interface InjectedMessage {
  role: 'user' | 'system'
  content: string
}

// ─── V2: pause() 返回值 ───
export interface PauseResult {
  /** 恢复时使用的调试指令 */
  command: DebugCommand
  /** 用户回写的 payload (如果有修改) */
  payload: PauseResumePayload | null
}

// ─── 共享内存常量 ───
export const WAKE_PENDING    = 0
export const WAKE_RESUMED    = 1
export const WAKE_WITH_PAYLOAD = 2

export const COMMAND_CONTINUE = 0
export const COMMAND_NEXT     = 1
export const COMMAND_STEP     = 2
export const COMMAND_OVER     = 3
export const COMMAND_STOP     = 4

/** 共享内存 Header 固定长度 (3 × Int32 = 12 bytes) */
export const SAB_HEADER_SIZE = 12

/** 默认 payload 区域预分配大小 */
export const SAB_DEFAULT_PAYLOAD_SIZE = 64 * 1024  // 64KB
```

### 3.4 `DevtoolsService.pause()` 升级

```typescript
// service.ts — pause 方法改造

pause(snapshot: DebugSnapshot): PauseResult {
  // 预分配: 12 bytes header + 64KB payload 区
  const totalSize = SAB_HEADER_SIZE + SAB_DEFAULT_PAYLOAD_SIZE
  const sab = new SharedArrayBuffer(totalSize)
  const header = new Int32Array(sab, 0, 3)  // state, commandType, payloadLength
  const payloadRegion = new Uint8Array(sab, SAB_HEADER_SIZE)

  // 发送给 Worker
  this.worker?.postMessage({
    type: 'paused',
    snapshot,
    shared: sab,
  })

  // 同步阻塞等待恢复
  Atomics.wait(header, 0, WAKE_PENDING)

  const stateValue = Atomics.load(header, 0)

  if (stateValue !== WAKE_RESUMED && stateValue !== WAKE_WITH_PAYLOAD) {
    throw new Error(`Devtools pause resumed with unexpected state: ${stateValue}`)
  }

  // 读取 command type
  const commandTypeInt = Atomics.load(header, 1)
  const command = this.decodeCommand(commandTypeInt)

  // 读取 payload (如果有)
  let payload: PauseResumePayload | null = null
  if (stateValue === WAKE_WITH_PAYLOAD) {
    const payloadLength = Atomics.load(header, 2)
    if (payloadLength > 0) {
      const jsonBytes = payloadRegion.slice(0, payloadLength)
      const jsonStr = new TextDecoder().decode(jsonBytes)
      payload = JSON.parse(jsonStr) as PauseResumePayload
    }
  }

  return { command, payload }
}

private decodeCommand(typeInt: number): DebugCommand {
  const seq = Date.now()
  switch (typeInt) {
    case COMMAND_NEXT:     return { type: 'next', seq }
    case COMMAND_STEP:     return { type: 'step', seq }
    case COMMAND_OVER:     return { type: 'over', seq, depth: 0 }
    case COMMAND_STOP:     return { type: 'stop', seq }
    case COMMAND_CONTINUE:
    default:               return { type: 'continue', seq }
  }
}
```

### 3.5 Worker 端 `resolvePause()` 升级

```typescript
// service-worker.ts — resolvePause 改造

interface PendingPause {
  kind: 'shared'
  flag: SharedArrayBuffer
}

private resolvePause(command: DebugCommand, payload?: PauseResumePayload): void {
  const pause = this.pauses.shift()

  if (!pause) {
    this.broadcast(JSON.stringify({ type: 'Debugger.command', command }))
    return
  }

  const header = new Int32Array(pause.flag, 0, 3)
  const payloadRegion = new Uint8Array(pause.flag, SAB_HEADER_SIZE)

  // 写入 command type
  const commandInt = this.encodeCommandType(command.type)
  Atomics.store(header, 1, commandInt)

  // 写入 payload (如果有)
  if (payload && Object.keys(payload).length > 0) {
    const jsonStr = JSON.stringify(payload)
    const jsonBytes = new TextEncoder().encode(jsonStr)

    if (jsonBytes.length > payloadRegion.length) {
      // payload 超出预分配区域，截断并 warn
      // 实际场景中 64KB 足够; 后续可以考虑动态扩容
      console.warn(`Payload size ${jsonBytes.length} exceeds SAB capacity ${payloadRegion.length}`)
    } else {
      payloadRegion.set(jsonBytes)
      Atomics.store(header, 2, jsonBytes.length)
      Atomics.store(header, 0, WAKE_WITH_PAYLOAD)
      Atomics.notify(header, 0, 1)
      return
    }
  }

  // 无 payload 的普通恢复
  Atomics.store(header, 0, WAKE_RESUMED)
  Atomics.notify(header, 0, 1)
}

private encodeCommandType(type: string): number {
  switch (type) {
    case 'next':     return COMMAND_NEXT
    case 'step':     return COMMAND_STEP
    case 'over':     return COMMAND_OVER
    case 'stop':     return COMMAND_STOP
    case 'continue':
    default:         return COMMAND_CONTINUE
  }
}
```

Worker WS `handleConnection` 也需要升级，接收带 `payload` 的 command：

```typescript
ws.on('message', (data: Buffer) => {
  let parsed: unknown = null
  try { parsed = JSON.parse(data.toString()) } catch { return }

  const msg = parsed as Record<string, unknown>
  const command = this.normalizeCommand(msg)
  if (!command) return

  // 提取可选 payload
  const payload = msg.payload as PauseResumePayload | undefined
  this.resolvePause(command, payload)
})
```

### 3.6 `Debugger.pause()` 返回值变更

```typescript
// tools/debugger.ts

/**
 * 暂停执行。返回 PauseResult:
 * - command: 恢复时的控制指令
 * - payload: 用户回写的上下文修改 (null 表示无修改)
 */
pause(snapshot: DebugSnapshot): PauseResult | undefined {
  if (this.shouldPause(snapshot.point)) {
    logger.debug({ snapshot }, 'Pausing execution at breakpoint')
    return this.service.pause(snapshot)
  }
  return undefined
}
```

### 3.7 Agent 调用端适配 (`work-loop.ts`)

```typescript
// work-loop.ts — model_before 断点处的示例改造

invariant(() => {
  const result = devtools?.debugger.pause({
    turn: turnIndex,
    point: 'model_before',
    frameDepth: 0,
    messagesCount: messages.length,
    tokenUsage: lastTokenUsage,
    // V2: 携带可编辑上下文
    systemPrompt,
    messagesSummary: summarizeMessages(messages, 10), // 最后 10 条
    llmParams: { temperature, maxTokens, thinkingLevel },
  })

  // V2: 处理回写 payload
  if (result?.payload) {
    const p = result.payload
    if (p.systemPrompt !== undefined) {
      systemPrompt = p.systemPrompt
    }
    if (p.injectMessages?.length) {
      for (const msg of p.injectMessages) {
        messages.push({ role: msg.role, content: msg.content } as AgentMessage)
      }
    }
    if (p.removeMessageIndices?.length) {
      // 从高到低删除，避免索引偏移
      const sorted = [...p.removeMessageIndices].sort((a, b) => b - a)
      for (const idx of sorted) {
        if (idx >= 0 && idx < messages.length) messages.splice(idx, 1)
      }
    }
    if (p.llmParams) {
      if (p.llmParams.temperature !== undefined) temperature = p.llmParams.temperature
      if (p.llmParams.maxTokens !== undefined) maxTokens = p.llmParams.maxTokens
      if (p.llmParams.thinkingLevel !== undefined) thinkingLevel = p.llmParams.thinkingLevel as any
    }
  }

  // V2: 处理 stop 指令
  if (result?.command.type === 'stop') {
    throw new AbortError(result.command.reason ?? 'Stopped by debugger')
  }

  return true
}, `Turn ${turnIndex} before model stream`)
```

辅助函数：

```typescript
function summarizeMessages(messages: AgentMessage[], lastN: number): MessageSummaryItem[] {
  const start = Math.max(0, messages.length - lastN)
  return messages.slice(start).map((msg, i) => ({
    index: start + i,
    role: msg.role,
    preview: typeof msg.content === 'string'
      ? msg.content.slice(0, 200)
      : JSON.stringify(msg.content).slice(0, 200),
    toolName: msg.role === 'tool_result' ? (msg as any).toolCallId : undefined,
    tokenEstimate: Math.ceil((typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length) / 4),
  }))
}
```

### 3.8 回写数据流

```
  Web-UI (暂停中)        Service DebugBridge      Worker               Main Thread
    │                         │                      │                     │ (Atomics.wait)
    │ 用户编辑 systemPrompt    │                      │                     │
    │ 用户注入消息             │                      │                     │
    │ 点击 Continue           │                      │                     │
    │                         │                      │                     │
    │ WS: { type: 'debug_command',                   │                     │
    │   data: {               │                      │                     │
    │     type: 'continue',   │                      │                     │
    │     payload: {          │                      │                     │
    │       systemPrompt: '...修改后...',              │                     │
    │       injectMessages: [{│role:'user',content:'hint'}],               │
    │       llmParams: { temperature: 0.5 }          │                     │
    │     }                   │                      │                     │
    │   }                     │                      │                     │
    │ }                       │                      │                     │
    │ ──────────────────────> │                      │                     │
    │                         │ WS → Worker:          │                     │
    │                         │ { type:'continue',    │                     │
    │                         │   payload:{...} }     │                     │
    │                         │ ─────────────────────>│                     │
    │                         │                      │ resolvePause():      │
    │                         │                      │  header[1] = CONTINUE│
    │                         │                      │  encode payload JSON │
    │                         │                      │  → payloadRegion     │
    │                         │                      │  header[2] = length  │
    │                         │                      │  header[0] = 2       │
    │                         │                      │    (WITH_PAYLOAD)    │
    │                         │                      │  Atomics.notify()    │
    │                         │                      │ ────────────────────>│
    │                         │                      │                     │ Atomics.wait returns
    │                         │                      │                     │ read header[0]=2
    │                         │                      │                     │ decode payload JSON
    │                         │                      │                     │ apply: systemPrompt,
    │                         │                      │                     │   inject msgs,
    │                         │                      │                     │   update llmParams
    │                         │                      │                     │ continue execution
```

---

## 4. `@vitamin/service` — 调试路由与桥接层

### 4.1 新增文件

```
packages/service/src/
├── routes/
│   └── debug.ts              ← 新增: REST 调试路由
├── debug-bridge.ts           ← 新增: Devtools WS → Service WS 桥接
├── types.ts                  ← 扩展: 新增调试相关 WS 消息类型
└── coding-service.ts         ← 修改: 集成 debug routes + bridge
```

### 4.2 REST 路由 — `routes/debug.ts`

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

### 4.3 DebugBridge — `debug-bridge.ts`

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
    private readonly logBuffer: LogEntry[] = [],
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

  /** 向 Devtools Worker WS 发送调试指令 (含可选回写 payload) */
  sendCommand(command: DebugCommand, payload?: PauseResumePayload): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...command, payload }))
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
      case 'Debugger.paused':
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
        // 尝试作为日志消息解析
        this.handleLogMessage(event)
        break
    }
  }

  /**
   * 将 Devtools Worker 广播的日志消息存入 ring buffer 并推送给 WS 客户端。
   */
  private handleLogMessage(event: Record<string, unknown>): void {
    // DevtoolsLogger.publish() 发送的消息格式:
    // { level, name (module), msg, time, ... }
    if (typeof event.level !== 'undefined' || typeof event.msg === 'string') {
      const entry: LogEntry = {
        id: this.logBuffer.length,
        timestamp: (event.time as string) ?? new Date().toISOString(),
        level: this.normalizeLevel(event.level),
        module: (event.name as string) ?? 'unknown',
        message: (event.msg as string) ?? JSON.stringify(event),
        data: event,
      }

      // Ring buffer: 最多保留 2000 条
      this.logBuffer.push(entry)
      if (this.logBuffer.length > 2000) {
        this.logBuffer.splice(0, this.logBuffer.length - 2000)
      }

      // 推送给 WS 客户端
      this.wsManager.broadcast({
        type: 'log_entry',
        data: entry as unknown as Record<string, unknown>,
      })
    }
  }

  private normalizeLevel(level: unknown): LogEntry['level'] {
    if (typeof level === 'string') {
      const l = level.toLowerCase()
      if (['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(l)) {
        return l as LogEntry['level']
      }
    }
    if (typeof level === 'number') {
      if (level <= 10) return 'trace'
      if (level <= 20) return 'debug'
      if (level <= 30) return 'info'
      if (level <= 40) return 'warn'
      if (level <= 50) return 'error'
      return 'fatal'
    }
    return 'info'
  }
}
```

### 4.4 日志路由 — `routes/logs.ts`

```typescript
// GET  /api/logs/history       — 查询日志历史 (ring buffer)
//   ?limit=100                  默认 100，最大 2000
//   &level=warn                 最低级别过滤
//   &module=agent               模块名模糊匹配
// GET  /api/logs/stream        — SSE 实时日志流 (备选方案, 主通道走 WS)
```

```typescript
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { DebugBridge } from '../debug-bridge'

export function createLogRoute(bridge: DebugBridge | null): Hono {
  const app = new Hono()

  app.get('/history', (c) => {
    if (!bridge) return c.json({ entries: [], total: 0 })

    const limit = Math.min(Number(c.req.query('limit') ?? 100), 2000)
    const level = c.req.query('level')
    const module = c.req.query('module')

    let entries = bridge.getLogBuffer()
    if (level) {
      const minSeverity = LOG_LEVEL_SEVERITY[level] ?? 0
      entries = entries.filter((e) => LOG_LEVEL_SEVERITY[e.level] >= minSeverity)
    }
    if (module) {
      entries = entries.filter((e) => e.module.includes(module))
    }
    const total = entries.length
    entries = entries.slice(-limit)

    return c.json({ entries, total })
  })

  // SSE 备用通道 (WS 不可用时)
  app.get('/stream', (c) => {
    if (!bridge) return c.text('debugger not enabled', 503)

    return streamSSE(c, async (stream) => {
      const unsubscribe = bridge.onLog((entry) => {
        stream.writeSSE({ event: 'log', data: JSON.stringify(entry) })
      })
      stream.onAbort(() => unsubscribe())
    })
  })

  return app
}
```

### 4.5 类型扩展 — `types.ts`

```typescript
// 在现有 WebSocketEventType 中追加:
export type WebSocketEventType =
  | /* ...existing 28 types... */
  | 'debug_paused'       // Devtools → 客户端: Agent 在断点暂停
  | 'debug_resumed'      // Devtools → 客户端: Agent 已恢复执行
  | 'debug_command'      // 双向: 调试指令确认
  | 'debug_breakpoints'  // 服务端 → 客户端: 断点列表变更推送
  | 'log_entry'          // 服务端 → 客户端: 单条日志
  | 'log_batch'          // 服务端 → 客户端: 批量日志 (初始加载)

// 在现有 WebSocketClientMessageType 中追加:
export type WebSocketClientMessageType =
  | /* ...existing 8 types... */
  | 'debug_command'           // 客户端 → 服务端: 发送调试指令 (含可选 payload)
  | 'debug_set_breakpoint'    // 客户端 → 服务端: 设置断点
  | 'debug_subscribe'         // 客户端 → 服务端: 订阅调试事件
  | 'log_subscribe'           // 客户端 → 服务端: 订阅日志推送
```

### 4.6 `CodingService` 集成

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
    // 注册日志路由
    this.app.route('/api/logs', createLogRoute(this.debugBridge))

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

## 5. `@vitamin/web-ui` — 调试面板 + 日志面板

### 5.1 新增文件

```
packages/web-ui/src/
├── components/
│   └── Debug/
│       ├── DebugPanel.tsx           ← 右侧面板容器 (Tab: 调试 / 日志)
│       ├── DebugTab.tsx             ← 调试 Tab 内容
│       ├── LogTab.tsx               ← 日志 Tab 内容
│       ├── Breakpoints.tsx       ← 断点列表 (带分组 + 开关)
│       ├── SnapshotViewer.tsx       ← 暂停时的运行时快照 (含可编辑字段)
│       ├── ContextEditor.tsx        ← 回写编辑器 (systemPrompt/消息/LLM 参数)
│       ├── DebugControls.tsx        ← 调试控制按钮 (continue/next/step/stop)
│       ├── DebugStatusBadge.tsx     ← TopBar 中的调试状态指示器
│       ├── LogViewer.tsx            ← 实时日志流 (虚拟滚动)
│       └── LogFilter.tsx            ← 日志过滤栏 (级别 + 模块 + 搜索)
├── stores/
│   ├── debug.ts                    ← Zustand 调试状态 store
│   └── logs.ts                     ← Zustand 日志状态 store
├── api/
│   ├── debug.ts                    ← REST + WS 调试 API 客户端
│   └── logs.ts                     ← REST + WS 日志 API 客户端
└── types/
    ├── debug.ts                    ← 调试相关类型定义
    └── logs.ts                     ← 日志相关类型定义
```

### 5.2 类型定义

#### `types/debug.ts`

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

export interface MessageSummaryItem {
  index: number
  role: 'user' | 'assistant' | 'tool_result' | 'system'
  preview: string
  toolName?: string
  tokenEstimate?: number
}

export interface DebugSnapshot {
  turn: number
  point: BreakpointPoint
  frameDepth: number
  messagesCount: number
  lastToolName?: string
  tokenUsage?: { input: number; output: number }
  metadata?: Record<string, string | number | boolean | null>
  // V2: 可编辑上下文
  systemPrompt?: string
  messagesSummary?: MessageSummaryItem[]
  llmParams?: {
    temperature?: number
    maxTokens?: number
    thinkingLevel?: string
  }
}

export interface PauseResumePayload {
  systemPrompt?: string
  injectMessages?: { role: 'user' | 'system'; content: string }[]
  removeMessageIndices?: number[]
  llmParams?: {
    temperature?: number
    maxTokens?: number
    thinkingLevel?: string
  }
  metadata?: Record<string, string | number | boolean | null>
}

export type DebugCommandType = 'next' | 'step' | 'over' | 'continue' | 'stop'
```

#### `types/logs.ts`

```typescript
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LogEntry {
  id: number
  timestamp: string
  level: LogLevel
  module: string
  message: string
  data?: Record<string, unknown>
}

export const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
}

export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  trace: 'text-text-400',
  debug: 'text-text-300',
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  fatal: 'text-red-600 font-bold',
}
```

### 5.3 API 客户端

#### `api/debug.ts`

```typescript
const BASE = '/api/debug'

export async function fetchDevtoolsStatus(): Promise<{ enabled: boolean; connected: boolean }> {
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
```

#### `api/logs.ts`

```typescript
const BASE = '/api/logs'

export async function fetchLogHistory(options?: {
  limit?: number
  level?: string
  module?: string
}): Promise<{ entries: LogEntry[]; total: number }> {
  const params = new URLSearchParams()
  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.level) params.set('level', options.level)
  if (options?.module) params.set('module', options.module)
  const res = await fetch(`${BASE}/history?${params}`)
  return res.json()
}

/**
 * 创建日志 SSE 流连接 (备用方案, 主通道走 WS)
 */
export function createLogStream(onEntry: (entry: LogEntry) => void): EventSource {
  const es = new EventSource(`${BASE}/stream`)
  es.addEventListener('log', (e) => {
    onEntry(JSON.parse(e.data))
  })
  return es
}
```

### 5.4 Zustand Stores

#### `stores/debug.ts`

```typescript
import { create } from 'zustand'
import type { Breakpoint, DebugSnapshot, DebugCommandType, PauseResumePayload } from '../types/debug'
import * as debugApi from '../api/debug'

interface DevtoolsState {
  // 连接状态
  enabled: boolean
  connected: boolean

  // 面板
  panelOpen: boolean
  activeTab: 'debug' | 'logs'

  // 断点
  breakpoints: Breakpoint[]
  loadingBreakpoints: boolean

  // 暂停状态
  paused: boolean
  currentSnapshot: DebugSnapshot | null
  snapshotHistory: DebugSnapshot[]

  // V2: 回写编辑器 draft
  editDraft: PauseResumePayload

  // Actions
  togglePanel: () => void
  openPanel: () => void
  closePanel: () => void
  setActiveTab: (tab: 'debug' | 'logs') => void

  fetchStatus: () => Promise<void>
  fetchBreakpoints: () => Promise<void>
  toggleBreakpoint: (point: string) => Promise<void>
  enableAll: () => Promise<void>
  disableAll: () => Promise<void>

  // WS 事件
  handlePaused: (snapshot: DebugSnapshot) => void
  handleResumed: () => void

  // V2: 回写编辑
  updateDraftSystemPrompt: (value: string) => void
  addDraftInjectMessage: (role: 'user' | 'system', content: string) => void
  removeDraftInjectMessage: (index: number) => void
  toggleDraftRemoveMessage: (index: number) => void
  updateDraftLlmParam: (key: string, value: unknown) => void
  resetDraft: () => void

  // 调试指令 (通过 WS, 携带 draft payload)
  sendCommand: (type: DebugCommandType) => void
}

const EMPTY_DRAFT: PauseResumePayload = {}

export const useDebugStore = create<DevtoolsState>((set, get) => ({
  enabled: false,
  connected: false,
  panelOpen: false,
  activeTab: 'debug',
  breakpoints: [],
  loadingBreakpoints: false,
  paused: false,
  currentSnapshot: null,
  snapshotHistory: [],
  editDraft: { ...EMPTY_DRAFT },

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  fetchStatus: async () => {
    const status = await debugApi.fetchDevtoolsStatus()
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
      breakpoints: s.breakpoints.map((b) => b.point === point ? updated : b),
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
      // 初始化 draft: 从 snapshot 填充可编辑字段
      editDraft: {
        systemPrompt: snapshot.systemPrompt,
        llmParams: snapshot.llmParams ? { ...snapshot.llmParams } : undefined,
      },
    }))
  },

  handleResumed: () => {
    set({ paused: false, currentSnapshot: null, editDraft: { ...EMPTY_DRAFT } })
  },

  // ─── V2: Draft 编辑方法 ───

  updateDraftSystemPrompt: (value) => {
    set((s) => ({ editDraft: { ...s.editDraft, systemPrompt: value } }))
  },

  addDraftInjectMessage: (role, content) => {
    set((s) => ({
      editDraft: {
        ...s.editDraft,
        injectMessages: [...(s.editDraft.injectMessages ?? []), { role, content }],
      },
    }))
  },

  removeDraftInjectMessage: (index) => {
    set((s) => ({
      editDraft: {
        ...s.editDraft,
        injectMessages: (s.editDraft.injectMessages ?? []).filter((_, i) => i !== index),
      },
    }))
  },

  toggleDraftRemoveMessage: (index) => {
    set((s) => {
      const current = s.editDraft.removeMessageIndices ?? []
      const next = current.includes(index)
        ? current.filter((i) => i !== index)
        : [...current, index]
      return { editDraft: { ...s.editDraft, removeMessageIndices: next } }
    })
  },

  updateDraftLlmParam: (key, value) => {
    set((s) => ({
      editDraft: {
        ...s.editDraft,
        llmParams: { ...s.editDraft.llmParams, [key]: value },
      },
    }))
  },

  resetDraft: () => {
    const snapshot = get().currentSnapshot
    set({
      editDraft: {
        systemPrompt: snapshot?.systemPrompt,
        llmParams: snapshot?.llmParams ? { ...snapshot.llmParams } : undefined,
      },
    })
  },

  sendCommand: (type) => {
    const draft = get().editDraft
    // 检查 draft 是否有实际修改
    const hasChanges = draft.systemPrompt !== get().currentSnapshot?.systemPrompt
      || (draft.injectMessages?.length ?? 0) > 0
      || (draft.removeMessageIndices?.length ?? 0) > 0
      || JSON.stringify(draft.llmParams) !== JSON.stringify(get().currentSnapshot?.llmParams)

    const payload = hasChanges ? draft : undefined

    // wsClient.send({
    //   type: 'debug_command',
    //   data: { type, seq: Date.now(), payload },
    // })
  },
}))
```

#### `stores/logs.ts`

```typescript
import { create } from 'zustand'
import type { LogEntry, LogLevel } from '../types/logs'
import { LOG_LEVEL_SEVERITY } from '../types/logs'

const MAX_LOG_ENTRIES = 5000

interface LogState {
  // 日志数据
  entries: LogEntry[]
  filteredEntries: LogEntry[]

  // 过滤器
  minLevel: LogLevel
  moduleFilter: string
  searchQuery: string

  // UI 状态
  autoScroll: boolean
  expanded: Set<number>   // 展开详情的日志 ID

  // Actions
  appendEntry: (entry: LogEntry) => void
  appendBatch: (entries: LogEntry[]) => void
  clear: () => void

  setMinLevel: (level: LogLevel) => void
  setModuleFilter: (module: string) => void
  setSearchQuery: (query: string) => void
  toggleAutoScroll: () => void
  toggleExpanded: (id: number) => void
}

function applyFilter(
  entries: LogEntry[],
  minLevel: LogLevel,
  moduleFilter: string,
  searchQuery: string,
): LogEntry[] {
  const minSeverity = LOG_LEVEL_SEVERITY[minLevel]
  return entries.filter((e) => {
    if (LOG_LEVEL_SEVERITY[e.level] < minSeverity) return false
    if (moduleFilter && !e.module.includes(moduleFilter)) return false
    if (searchQuery && !e.message.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })
}

export const useLogStore = create<LogState>((set, get) => ({
  entries: [],
  filteredEntries: [],
  minLevel: 'info',
  moduleFilter: '',
  searchQuery: '',
  autoScroll: true,
  expanded: new Set(),

  appendEntry: (entry) => {
    set((s) => {
      const entries = [...s.entries, entry]
      // Ring buffer
      if (entries.length > MAX_LOG_ENTRIES) {
        entries.splice(0, entries.length - MAX_LOG_ENTRIES)
      }
      return {
        entries,
        filteredEntries: applyFilter(entries, s.minLevel, s.moduleFilter, s.searchQuery),
      }
    })
  },

  appendBatch: (batch) => {
    set((s) => {
      const entries = [...s.entries, ...batch]
      if (entries.length > MAX_LOG_ENTRIES) {
        entries.splice(0, entries.length - MAX_LOG_ENTRIES)
      }
      return {
        entries,
        filteredEntries: applyFilter(entries, s.minLevel, s.moduleFilter, s.searchQuery),
      }
    })
  },

  clear: () => set({ entries: [], filteredEntries: [] }),

  setMinLevel: (level) => {
    set((s) => ({
      minLevel: level,
      filteredEntries: applyFilter(s.entries, level, s.moduleFilter, s.searchQuery),
    }))
  },

  setModuleFilter: (module) => {
    set((s) => ({
      moduleFilter: module,
      filteredEntries: applyFilter(s.entries, s.minLevel, module, s.searchQuery),
    }))
  },

  setSearchQuery: (query) => {
    set((s) => ({
      searchQuery: query,
      filteredEntries: applyFilter(s.entries, s.minLevel, s.moduleFilter, query),
    }))
  },

  toggleAutoScroll: () => set((s) => ({ autoScroll: !s.autoScroll })),

  toggleExpanded: (id) => {
    set((s) => {
      const next = new Set(s.expanded)
      next.has(id) ? next.delete(id) : next.add(id)
      return { expanded: next }
    })
  },
}))
```

### 5.5 WebSocket 集成 — 扩展 `api/websocket.ts`

```typescript
import { useDebugStore } from '../stores/debug'
import { useLogStore } from '../stores/logs'

// 调试事件
wsClient.on('debug_paused', (data) => {
  useDebugStore.getState().handlePaused(data.snapshot)
  useDebugStore.getState().openPanel()
  useDebugStore.getState().setActiveTab('debug')
})

wsClient.on('debug_resumed', () => {
  useDebugStore.getState().handleResumed()
})

wsClient.on('debug_breakpoints', (data) => {
  useDebugStore.setState({ breakpoints: data.breakpoints })
})

// 日志事件
wsClient.on('log_entry', (data) => {
  useLogStore.getState().appendEntry(data as LogEntry)
})

wsClient.on('log_batch', (data) => {
  useLogStore.getState().appendBatch(data.entries as LogEntry[])
})
```

### 5.6 组件设计

#### 5.6.1 `DebugPanel.tsx` — 右侧面板容器 (Tab 切换)

```
┌─── DebugPanel (w-96, 右侧可折叠) ────────────┐
│ ┌─ Header ──────────────────────────────────┐ │
│ │ [🔧 调试] [📋 日志]     [× 折叠按钮]      │ │
│ └───────────────────────────────────────────┘ │
│                                               │
│ ┌─ Tab Content ─────────────────────────────┐ │
│ │  (根据 activeTab 渲染 DebugTab / LogTab)   │ │
│ └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

面板宽度升级到 `w-96` (384px)，因为新增了上下文编辑区域需要更多空间。

```tsx
<aside
  className={`
    flex flex-col border-l border-border-200
    transition-all duration-250 overflow-hidden
    ${panelOpen ? 'w-96' : 'w-0'}
  `}
>
  {panelOpen && (
    <>
      <TabHeader />
      {activeTab === 'debug' ? <DebugTab /> : <LogTab />}
    </>
  )}
</aside>
```

#### 5.6.2 `DebugTab.tsx` — 调试 Tab

```
┌─ DebugTab ──────────────────────────────────┐
│ ┌─ DebugControls (暂停时显示) ────────────┐ │
│ │  ▶ Continue  ⏭ Next  ⤵ Step  ⏹ Stop   │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─ SnapshotViewer (暂停时显示) ───────────┐ │
│ │  Point:  model_before                   │ │
│ │  Turn:   3 / Depth: 1 / Msgs: 12       │ │
│ │  Tokens: 1,234 in / 567 out            │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─ ContextEditor (暂停时显示, 可折叠) ────┐ │
│ │  ▾ System Prompt                        │ │
│ │  ┌───────────────────────────────────┐  │ │
│ │  │ <textarea> 可编辑 systemPrompt    │  │ │
│ │  └───────────────────────────────────┘  │ │
│ │                                         │ │
│ │  ▾ Messages (12 条)                     │ │
│ │  ☑ #0  user    "请帮我分析..."          │ │
│ │  ☑ #1  assistant "好的，我来..."        │ │
│ │  ☐ #2  tool_result read_file ✗ 删除     │ │
│ │  ...                                    │ │
│ │  [+ 注入 User 消息] [+ 注入 System 消息] │ │
│ │                                         │ │
│ │  ▾ LLM 参数                             │ │
│ │  Temperature: [____0.7____] ←─ slider   │ │
│ │  Max Tokens:  [____4096___]             │ │
│ │  Thinking:    [Low ▼]                   │ │
│ │                                         │ │
│ │  [重置修改]                              │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─ Breakpoints ────────────────────────┐ │
│ │ [Enable All] [Disable All]              │ │
│ │ ▸ Agent 循环 (10)                  6/10 │ │
│ │ ▸ 循环注入 (3)                     3/3  │ │
│ │ ▸ Tool 执行 (4)                    2/4  │ │
│ │ ▸ Session/Prompt (7)               7/7  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─ Snapshot History (可展开) ─────────────┐ │
│ │  #3  model_before  T=3  12:34:56       │ │
│ │  #2  tool_after    T=2  12:34:51       │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**上下文编辑器交互**:

- 暂停时自动从 snapshot 填充 `editDraft`
- 修改过的字段显示 amber 高亮边框
- 点击 Continue/Next/Step 时，自动将 `editDraft` 中有变更的部分打包为 `PauseResumePayload` 发送
- "重置修改" 按钮恢复到 snapshot 原始值

#### 5.6.3 `ContextEditor.tsx` — 上下文回写编辑器

```tsx
// 三个可折叠区域:

// ① System Prompt 编辑器
// - <textarea> 绑定 editDraft.systemPrompt
// - 对比 snapshot.systemPrompt 高亮差异

// ② Messages 列表
// - 渲染 snapshot.messagesSummary
// - 每条消息左侧 checkbox: 取消勾选 = 标记删除 (removeMessageIndices)
// - 底部 "注入消息" 按钮: 弹出小表单 (role + content textarea)
// - 注入的消息显示在列表底部,绿色边框

// ③ LLM 参数
// - temperature: range slider 0-2, step 0.1
// - maxTokens: number input
// - thinkingLevel: select (off/low/medium/high)
```

#### 5.6.4 `LogTab.tsx` — 日志 Tab

```
┌─ LogTab ────────────────────────────────────┐
│ ┌─ LogFilter ─────────────────────────────┐ │
│ │ Level: [info ▼]  Module: [________]     │ │
│ │ Search: [____________________] 🔍       │ │
│ │ [Clear] [Auto-scroll: ☑]               │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─ LogViewer (虚拟滚动) ──────────────────┐ │
│ │ 12:34:45.123 INF @vitamin/agent:loop    │ │
│ │   Turn 3 started                        │ │
│ │ 12:34:45.456 DBG @vitamin/tools:exec    │ │
│ │   Executing tool read_file              │ │
│ │ 12:34:46.789 WRN @vitamin/ai:stream    │ │
│ │   Token limit approaching (90%)         │ │
│ │ 12:34:47.012 ERR @vitamin/agent:loop    │ │
│ │ ▸ Error: Tool execution failed          │ │
│ │   { tool: 'write_file', code: 'EPERM' } │ │
│ │                                         │ │
│ │  ──── ↓ auto-scrolling ↓ ────          │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─ Stats bar ─────────────────────────────┐ │
│ │ 1,234 entries | 12 errors | 5 warnings  │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

#### 5.6.5 `LogViewer.tsx` — 虚拟滚动日志列表

```tsx
// 关键技术点:
// - 使用 CSS overflow-anchor: auto + scrollTo 实现 auto-scroll
// - 日志量大 (5000+) 时使用 position: absolute + transform 虚拟滚动
// - 每条日志: 时间戳(灰) + 级别(颜色编码) + 模块(蓝) + 消息
// - 点击展开: 显示完整 data JSON (缩进格式化)
// - error/fatal 级别: 红色左边框 + 背景色
// - 新日志到达时: auto-scroll 模式自动滚到底部

// 级别颜色:
// trace: text-text-400 (最暗)
// debug: text-text-300
// info:  text-blue-400
// warn:  text-yellow-400
// error: text-red-400
// fatal: text-red-600 font-bold
```

#### 5.6.6 `LogFilter.tsx`

```tsx
// Level 下拉: trace/debug/info/warn/error/fatal
// Module 输入: 自由文本, 模糊匹配 (e.g. "agent" 匹配 "@vitamin/agent:work-loop")
// Search 输入: 全文搜索, debounce 300ms
// Clear 按钮: 清空所有日志
// Auto-scroll 开关: 新日志是否自动滚动到底部
```

#### 5.6.7 `DebugControls.tsx` (升级)

```tsx
// 4 个操作按钮 + 回写指示
//
// Continue (▶)  — 发送 { type: 'continue', payload: editDraft }
// Next (⏭)     — 发送 { type: 'next', payload: editDraft }
// Step (⤵)     — 发送 { type: 'step', payload: editDraft }
// Stop (⏹)     — 发送 { type: 'stop' } (无 payload)
//
// 当 editDraft 有修改时，按钮旁显示 "⚡ with context changes" 标记
// 提示用户: 点击恢复时会将修改回写到 Agent 运行时
//
// 快捷键:
// F5 — Continue
// F10 — Next
// F11 — Step
// Shift+F5 — Stop
```

### 5.7 Chat 布局修改

```tsx
export function Chat() {
  const { panelOpen } = useDebugStore()

  return (
    <div className="h-screen flex flex-col bg-bg-100">
      <TopBar onOpenCommandPalette={openCommandPalette} />
      <div className="flex-1 flex overflow-hidden">
        <SessionsSidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-bg-000">
          <ChatInterface />
        </main>
        {/* 调试/日志面板 — 最右侧 */}
        <DebugPanel />
      </div>
      {/* ...modals... */}
    </div>
  )
}
```

---

## 6. 数据流

### 6.1 断点管理流

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

### 6.2 暂停/回写/恢复流 (V2)

```
  Agent (main thread)     Devtools Worker       Service              Web-UI
    │                         │                    │                    │
    │ devtools.debugger       │                    │                    │
    │  .pause(snapshot        │                    │                    │
    │    + systemPrompt       │                    │                    │
    │    + messagesSummary    │                    │                    │
    │    + llmParams)         │                    │                    │
    │                         │                    │                    │
    │  Atomics.wait(SAB) ────>│                    │                    │
    │  (blocked on header[0]) │                    │                    │
    │                         │ WS: Agent.debugger │                    │
    │                         │   .paused +        │                    │
    │                         │   full snapshot    │                    │
    │                         │ ─────────────────> │                    │
    │                         │                    │ WS: debug_paused   │
    │                         │                    │ ──────────────────>│
    │                         │                    │                    │
    │                         │                    │                    │ 展开 DebugTab
    │                         │                    │                    │ 填充 ContextEditor
    │                         │                    │                    │
    │                         │                    │                    │ 用户编辑 systemPrompt
    │                         │                    │                    │ 用户删除消息 #2
    │                         │                    │                    │ 用户调低 temperature
    │                         │                    │                    │ 点击 Continue ⚡
    │                         │                    │                    │
    │                         │                    │  WS: debug_command │
    │                         │                    │  + payload:        │
    │                         │                    │    systemPrompt,   │
    │                         │                    │    removeIndices,  │
    │                         │                    │    llmParams       │
    │                         │                    │ <──────────────────│
    │                         │                    │                    │
    │                         │ WS: continue       │ DebugBridge:      │
    │                         │   + payload        │  sendCommand()    │
    │                         │ <───────────────── │                    │
    │                         │                    │                    │
    │                         │ resolvePause():    │                    │
    │                         │  header[1] = 0     │ (CONTINUE)        │
    │                         │  encode payload →  │                    │
    │                         │    payloadRegion   │                    │
    │                         │  header[2] = len   │                    │
    │                         │  header[0] = 2     │ (WITH_PAYLOAD)    │
    │                         │  Atomics.notify()  │                    │
    │                         │                    │                    │
    │  Atomics.wait returns ──│                    │                    │
    │  header[0] = 2          │                    │                    │
    │  decode payload JSON    │                    │                    │
    │  apply:                 │                    │                    │
    │    systemPrompt = '...' │                    │                    │
    │    splice msg[2]        │                    │                    │
    │    temperature = 0.5    │                    │                    │
    │  continue execution ───>│                    │                    │
```

### 6.3 日志流

```
  Agent/Tool/Session        DevtoolsLogger          DebugBridge         Web-UI
    │                         │                       │                    │
    │ logger.info('Turn 3     │                       │                    │
    │   started')             │                       │                    │
    │ ───────────────────────>│                       │                    │
    │                         │ DevtoolsService       │                    │
    │                         │  .logger(msg)         │                    │
    │                         │ → Worker.postMessage  │                    │
    │                         │ → WS broadcast        │                    │
    │                         │ ──────────────────────>                    │
    │                         │                       │ handleLogMessage() │
    │                         │                       │ → logBuffer.push() │
    │                         │                       │ → WS: log_entry    │
    │                         │                       │ ──────────────────>│
    │                         │                       │                    │ useLogStore
    │                         │                       │                    │  .appendEntry()
    │                         │                       │                    │ → 虚拟滚动更新
```

---

## 7. 实现计划

### Phase 0: Devtools Atomics 升级

| 任务 | 文件 | 说明 |
|------|------|------|
| 0.1 | `devtools/src/protocol.ts` | 扩展 DebugSnapshot + 新增 PauseResumePayload + SAB 常量 |
| 0.2 | `devtools/src/service.ts` | `pause()` 升级为结构化 SAB + 返回 `PauseResult` |
| 0.3 | `devtools/src/service-worker.ts` | `resolvePause()` 升级，支持 payload 写入 SAB |
| 0.4 | `devtools/src/tools/debugger.ts` | `pause()` 返回 `PauseResult \| undefined` |
| 0.5 | `agent/src/work-loop.ts` | 关键断点处 (model_before 等) 传入可编辑字段 + 处理回写 |
| 0.6 | `devtools/tests/` | 补充 SAB 回写单元测试 |

### Phase 1: Service 调试 + 日志路由 (后端)

| 任务 | 文件 | 说明 |
|------|------|------|
| 1.1 | `service/src/types.ts` | 扩展 WS 消息类型 (debug + log) |
| 1.2 | `service/src/routes/debug.ts` | REST 断点管理 + 状态查询 |
| 1.3 | `service/src/routes/logs.ts` | REST 日志历史 + SSE 流 |
| 1.4 | `service/src/debug-bridge.ts` | Devtools WS ↔ Service WS 桥接 (含日志转发 + payload 传递) |
| 1.5 | `service/src/coding-service.ts` | 集成 debug/log routes + bridge |
| 1.6 | `service/src/index.ts` | 导出新增类型 |

### Phase 2: Web-UI 调试面板 + 日志面板 (前端)

| 任务 | 文件 | 说明 |
|------|------|------|
| 2.1 | `web-ui/src/types/debug.ts` | 调试类型 (含 PauseResumePayload) |
| 2.2 | `web-ui/src/types/logs.ts` | 日志类型 |
| 2.3 | `web-ui/src/api/debug.ts` | REST API 客户端 |
| 2.4 | `web-ui/src/api/logs.ts` | REST + SSE 日志客户端 |
| 2.5 | `web-ui/src/stores/debug.ts` | Zustand store (含 editDraft) |
| 2.6 | `web-ui/src/stores/logs.ts` | Zustand log store |
| 2.7 | `web-ui/src/api/websocket.ts` | 注册调试 + 日志 WS 事件 handler |
| 2.8 | `web-ui/src/components/Debug/Breakpoints.tsx` | 断点列表 |
| 2.9 | `web-ui/src/components/Debug/SnapshotViewer.tsx` | 快照查看器 |
| 2.10 | `web-ui/src/components/Debug/ContextEditor.tsx` | 上下文回写编辑器 |
| 2.11 | `web-ui/src/components/Debug/DebugControls.tsx` | 调试控制 (含 payload 指示) |
| 2.12 | `web-ui/src/components/Debug/DebugTab.tsx` | 调试 Tab |
| 2.13 | `web-ui/src/components/Debug/LogTab.tsx` | 日志 Tab |
| 2.14 | `web-ui/src/components/Debug/LogViewer.tsx` | 虚拟滚动日志 |
| 2.15 | `web-ui/src/components/Debug/LogFilter.tsx` | 日志过滤栏 |
| 2.16 | `web-ui/src/components/Debug/DebugPanel.tsx` | 面板容器 (Tab 切换) |
| 2.17 | `web-ui/src/components/Debug/DebugStatusBadge.tsx` | TopBar 状态徽章 |
| 2.18 | `web-ui/src/pages/Chat.tsx` | 集成 DebugPanel (右侧) |
| 2.19 | `web-ui/src/components/Layout/TopBar.tsx` | 集成 DebugStatusBadge |

### Phase 3: 联调与测试

| 任务 | 说明 |
|------|------|
| 3.1 | Vite 开发代理增加 `/api/debug` + `/api/logs` 前缀 |
| 3.2 | 端到端联调: Agent → 断点暂停 → 编辑 systemPrompt → Continue with payload → Agent 应用修改 |
| 3.3 | 日志联调: Agent 运行 → 日志实时流到 LogTab → 级别过滤/搜索 |
| 3.4 | 补充 `service/tests/debug-routes.test.ts` |
| 3.5 | 补充 `devtools/tests/sab-writeback.test.ts` |
| 3.6 | 快捷键绑定测试 (F5/F10/F11/Shift+F5) |

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Devtools Worker WS 连接延迟 | 首次断点/日志事件可能丢失 | DebugBridge 自动重连 + 首次 attach 等待 Worker 就绪 |
| 多 Web-UI 客户端同时发 command | 竞态: 多个 continue 指令 | Service 侧 dedup: 同一 pause 只接受第一个 command |
| DebugPanel 占用屏幕空间 | 小屏幕体验差 | 可折叠设计 + 记忆面板状态 |
| Agent Atomics 阻塞时间过长 | 面板无响应感 | 显示阻塞秒数计时器 + Stop 按钮随时可用 |
| devtools 未启用时 | 面板无数据 | `/api/debug/status` 返回 `enabled: false`，面板显示 "调试器未启用" 占位 |
| SAB payload 超出 64KB | 回写数据丢失 | 预检 payload 序列化大小，超限时 warn + 截断 systemPrompt |
| 回写导致运行时异常 | 注入无效消息/参数导致 LLM 错误 | Agent 端做基本校验: systemPrompt 非空, temperature 范围 0-2 |
| 日志量过大 | 前端内存溢出 | ring buffer 5000 条上限 + 虚拟滚动 + 级别过滤默认 info+ |
| 日志与调试事件乱序 | 时间线混乱 | 日志 entry 都携带 server 时间戳, 前端按 timestamp 排序 |
