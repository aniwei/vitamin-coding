import type { Session, SessionContext, SessionEntry, SessionMetadata } from './types'

export class InMemorySession<T = unknown> implements Session<T> {
  private readonly sessionEntries: SessionEntry<T>[] = []
  private readonly entryMap = new Map<string, SessionEntry<T>>()

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

  private _leafId: string | undefined = undefined
  get leafId(): string | undefined {
    return this._leafId
  }

  append(message: T): void {
    const entry: SessionEntry<T> & { type: 'message' } = {
      type: 'message',
      id: crypto.randomUUID(),
      parentId: this._leafId,
      message,
      timestamp: Date.now(),
    }
    this._leafId = entry.id
    this.sessionEntries.push(entry)
    this.entryMap.set(entry.id, entry)
    this.meta.messageCount++
    this.meta.lastActiveAt = Date.now()
  }

  compact(summary: string, compactedCount: number): void {
    const branchMessages = this.getBranchMessageEntries()
    if (compactedCount <= 0 || compactedCount > branchMessages.length) {
      return
    }

    const entry: SessionEntry<T> & { type: 'compaction' } = {
      type: 'compaction',
      id: crypto.randomUUID(),
      parentId: this._leafId,
      summary,
      compactedCount,
      timestamp: Date.now(),
    }

    this.sessionEntries.push(entry)
    this.entryMap.set(entry.id, entry)
    this.meta.compactionCount++
    this.meta.lastActiveAt = Date.now()
    this._leafId = entry.id
  }

  branch(entryId: string): void {
    if (!this.entryMap.has(entryId)) {
      throw new Error(`Entry "${entryId}" not found in session "${this.id}"`)
    }
    this._leafId = entryId
    this.meta.lastActiveAt = Date.now()
  }

  entries(): ReadonlyArray<SessionEntry<T>> {
    return this.sessionEntries
  }

  branchEntries(): ReadonlyArray<SessionEntry<T>> {
    return this.walkBranch()
  }

  buildContext(): SessionContext<T> {
    const branch = this.walkBranch()

    let lastCompactionIndex = -1
    for (let i = branch.length - 1; i >= 0; i--) {
      if (branch[i]?.type === 'compaction') {
        lastCompactionIndex = i
        break
      }
    }

    if (lastCompactionIndex === -1) {
      return {
        messages: branch
          .filter((e): e is SessionEntry<T> & { type: 'message' } => e.type === 'message')
          .map((e) => e.message),
      }
    }

    const compactionEntry = branch[lastCompactionIndex] as SessionEntry<T> & {
      type: 'compaction'
    }
    const messagesAfter = branch
      .slice(lastCompactionIndex + 1)
      .filter((e): e is SessionEntry<T> & { type: 'message' } => e.type === 'message')
      .map((e) => e.message)

    return {
      summary: compactionEntry.summary,
      messages: messagesAfter,
    }
  }

  messages(): ReadonlyArray<T> {
    return this.walkBranch()
      .filter((e): e is SessionEntry<T> & { type: 'message' } => e.type === 'message')
      .map((e) => e.message)
  }

  metadata(): SessionMetadata {
    return { ...this.meta, tags: [...this.meta.tags] }
  }

  setTitle(title: string): void {
    this.meta.title = title
    this.meta.lastActiveAt = Date.now()
  }

  setTags(tags: string[]): void {
    this.meta.tags = [...tags]
  }

  addTag(tag: string): void {
    if (!this.meta.tags.includes(tag)) {
      this.meta.tags.push(tag)
    }
  }

  restoreEntries(entries: SessionEntry<T>[], meta: SessionMetadata, restoredLeafId?: string): void {
    this.sessionEntries.length = 0
    this.entryMap.clear()
    for (const entry of entries) {
      this.sessionEntries.push(entry)
      this.entryMap.set(entry.id, entry)
    }
    Object.assign(this.meta, meta)
    this._leafId =
      restoredLeafId ?? (entries.length > 0 ? entries[entries.length - 1]?.id : undefined)
  }

  toSnapshot(): {
    entries: SessionEntry<T>[]
    metadata: SessionMetadata
    leafId?: string
  } {
    return {
      entries: [...this.sessionEntries],
      metadata: this.metadata(),
      leafId: this._leafId,
    }
  }

  private walkBranch(): SessionEntry<T>[] {
    if (!this._leafId) {
      return []
    }

    const path: SessionEntry<T>[] = []
    let current = this.entryMap.get(this._leafId)

    while (current) {
      path.push(current)
      current = current.parentId ? this.entryMap.get(current.parentId) : undefined
    }

    path.reverse()
    return path
  }

  private getBranchMessageEntries(): Array<SessionEntry<T> & { type: 'message' }> {
    const branch = this.walkBranch()

    let lastCompactionIndex = -1
    for (let i = branch.length - 1; i >= 0; i--) {
      if (branch[i]?.type === 'compaction') {
        lastCompactionIndex = i
        break
      }
    }

    return branch
      .slice(lastCompactionIndex + 1)
      .filter((e): e is SessionEntry<T> & { type: 'message' } => e.type === 'message')
  }
}
