// Session 条目 — 普通消息 或 压缩摘要
export type SessionEntry<T = unknown> =
  | { type: 'message'; message: T; timestamp: number }
  | { type: 'compaction'; summary: string; compactedCount: number; timestamp: number }

// buildContext() 的返回值
export interface SessionContext<T = unknown> {
  // 最近一次压缩的摘要（如果有）
  summary?: string
  // 压缩边界之后的消息
  messages: T[]
}

export interface Session<T = unknown> {
  id: string
  // 追加消息
  append(message: T): void
  // 执行压缩：将前 compactedCount 条未压缩消息替换为摘要
  compact(summary: string, compactedCount: number): void
  // 获取所有条目（含压缩标记）
  entries(): ReadonlyArray<SessionEntry<T>>
  // 构建上下文：返回摘要 + 压缩边界之后的消息
  buildContext(): SessionContext<T>
  // 所有未压缩的消息
  messages(): ReadonlyArray<T>
}

export interface SessionStore<T = unknown> {
  createSession(id?: string): Session<T>
  getSession(id: string): Session<T> | undefined
  listSessions(): ReadonlyArray<Session<T>>
}
