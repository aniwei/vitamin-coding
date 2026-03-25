import type { Session, SessionContext, SessionEntry } from './types'

export class InMemorySession<T = unknown> implements Session<T> {
  private readonly sessionEntries: SessionEntry<T>[] = []

  constructor(public readonly id: string) {}

  append(message: T): void {
    this.sessionEntries.push({
      type: 'message',
      message,
      timestamp: Date.now(),
    })
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
