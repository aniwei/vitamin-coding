import type { Session, SessionContext, SessionEntry, SessionMetadata } from './types'

export class InMemorySession<T = unknown> implements Session<T> {
  private readonly sessionEntries: SessionEntry<T>[] = []
  private readonly meta: SessionMetadata

  constructor(
    public readonly id: string,
    parentSessionId?: string,
    forkPoint?: number,
  ) {
    const now = Date.now()
    this.meta = {
      createdAt: now,
      lastActiveAt: now,
      messageCount: 0,
      compactionCount: 0,
      parentSessionId,
      forkPoint,
      tags: [],
    }
  }

  append(message: T): void {
    this.sessionEntries.push({
      type: 'message',
      message,
      timestamp: Date.now(),
    })
    this.meta.messageCount++
    this.meta.lastActiveAt = Date.now()
  }

  compact(summary: string, compactedCount: number): void {
    // 找到最后一个压缩边界后的消息
    const uncompactedMessages = this.getUncompactedMessageEntries()
    if (compactedCount <= 0 || compactedCount > uncompactedMessages.length) {
      return
    }

    // 在当前条目列表中追加压缩标记
    this.sessionEntries.push({
      type: 'compaction',
      summary,
      compactedCount,
      timestamp: Date.now(),
    })
    this.meta.compactionCount++
    this.meta.lastActiveAt = Date.now()
  }

  entries(): ReadonlyArray<SessionEntry<T>> {
    return this.sessionEntries
  }

  buildContext(): SessionContext<T> {
    // 从后往前找最后一个 compaction 标记
    let lastCompactionIndex = -1
    for (let i = this.sessionEntries.length - 1; i >= 0; i--) {
      if (this.sessionEntries[i].type === 'compaction') {
        lastCompactionIndex = i
        break
      }
    }

    if (lastCompactionIndex === -1) {
      // 没有压缩 — 返回全部消息
      return {
        messages: this.sessionEntries
          .filter((e): e is SessionEntry<T> & { type: 'message' } => e.type === 'message')
          .map((e) => e.message),
      }
    }

    const compactionEntry = this.sessionEntries[lastCompactionIndex] as SessionEntry<T> & { type: 'compaction' }

    // 压缩边界之后的消息
    const messagesAfter = this.sessionEntries
      .slice(lastCompactionIndex + 1)
      .filter((e): e is SessionEntry<T> & { type: 'message' } => e.type === 'message')
      .map((e) => e.message)

    return {
      summary: compactionEntry.summary,
      messages: messagesAfter,
    }
  }

  messages(): ReadonlyArray<T> {
    return this.sessionEntries
      .filter((e): e is SessionEntry<T> & { type: 'message' } => e.type === 'message')
      .map((e) => e.message)
  }

  metadata(): SessionMetadata {
    return { ...this.meta, tags: [...this.meta.tags] }
  }

  // ── 内部方法供 Store / Manager 使用 ──

  /** 设置标题 */
  setTitle(title: string): void {
    this.meta.title = title
    this.meta.lastActiveAt = Date.now()
  }

  /** 设置标签 */
  setTags(tags: string[]): void {
    this.meta.tags = [...tags]
  }

  /** 添加标签 */
  addTag(tag: string): void {
    if (!this.meta.tags.includes(tag)) {
      this.meta.tags.push(tag)
    }
  }

  /** 从快照恢复 entries（用于持久化加载） */
  restoreEntries(entries: SessionEntry<T>[], meta: SessionMetadata): void {
    this.sessionEntries.length = 0
    this.sessionEntries.push(...entries)
    Object.assign(this.meta, meta)
  }

  /** 导出快照 */
  toSnapshot(): { entries: SessionEntry<T>[]; metadata: SessionMetadata } {
    return {
      entries: [...this.sessionEntries],
      metadata: this.metadata(),
    }
  }

  // 内部: 获取最后一个压缩边界之后的 message 条目
  private getUncompactedMessageEntries(): Array<SessionEntry<T> & { type: 'message' }> {
    let lastCompactionIndex = -1
    for (let i = this.sessionEntries.length - 1; i >= 0; i--) {
      if (this.sessionEntries[i].type === 'compaction') {
        lastCompactionIndex = i
        break
      }
    }

    return this.sessionEntries
      .slice(lastCompactionIndex + 1)
      .filter((e): e is SessionEntry<T> & { type: 'message' } => e.type === 'message')
  }
}
