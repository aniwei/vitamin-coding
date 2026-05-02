import { SessionError } from '@x-mars/shared'
import type {
  Session,
  SessionCheckpoint,
  SessionContext,
  SessionEntry,
  SessionMetadata,
  SessionSideEffect,
} from './types'

export class InMemorySession<T = unknown> implements Session<T> {
  private readonly sessionEntries: SessionEntry<T>[] = []
  private readonly entryMap = new Map<string, SessionEntry<T>>()
  private readonly checkpoints = new Map<string, SessionCheckpoint<T>>()
  private readonly sideEffects: SessionSideEffect[] = []

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
      throw new SessionError(`Entry "${entryId}" not found in session "${this.id}"`, {
        code: 'SESSION_ENTRY_NOT_FOUND',
        metadata: {
          sessionId: this.id,
          entryId,
        },
      })
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

  updateMetadata(patch: Partial<SessionMetadata>): void {
    Object.assign(this.meta, patch)
    this.meta.tags = patch.tags ? [...patch.tags] : this.meta.tags
    this.meta.lastActiveAt = Date.now()
  }

  recordSideEffect(effect: Omit<SessionSideEffect, 'id' | 'createdAt'>): SessionSideEffect {
    const recorded: SessionSideEffect = {
      ...effect,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      targets: [...effect.targets],
      metadata: effect.metadata ? { ...effect.metadata } : undefined,
    }

    this.sideEffects.push(recorded)
    this.meta.lastActiveAt = Date.now()
    return this.cloneSideEffect(recorded)
  }

  listSideEffects(): ReadonlyArray<SessionSideEffect> {
    return this.sideEffects.map((effect) => this.cloneSideEffect(effect))
  }

  createCheckpoint(label?: string): SessionCheckpoint<T> {
    const checkpoint: SessionCheckpoint<T> = {
      id: crypto.randomUUID(),
      label,
      createdAt: Date.now(),
      entryCount: this.sessionEntries.length,
      sideEffectCount: this.sideEffects.length,
      leafId: this._leafId,
      entries: [...this.sessionEntries],
      sideEffects: this.listSideEffects() as SessionSideEffect[],
      metadata: this.metadata(),
    }

    this.checkpoints.set(checkpoint.id, checkpoint)
    this.meta.lastActiveAt = Date.now()
    return this.cloneCheckpoint(checkpoint)
  }

  listCheckpoints(): ReadonlyArray<SessionCheckpoint<T>> {
    return [...this.checkpoints.values()].map((checkpoint) => this.cloneCheckpoint(checkpoint))
  }

  restoreCheckpoint(checkpointId: string): boolean {
    const checkpoint = this.checkpoints.get(checkpointId)
    if (!checkpoint) {
      return false
    }

    this.restoreEntries(
      checkpoint.entries,
      checkpoint.metadata,
      checkpoint.leafId,
      undefined,
      checkpoint.sideEffects,
    )
    return true
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

  restoreEntries(
    entries: SessionEntry<T>[],
    meta: SessionMetadata,
    restoredLeafId?: string,
    checkpoints?: SessionCheckpoint<T>[],
    sideEffects?: SessionSideEffect[],
  ): void {
    this.sessionEntries.length = 0
    this.entryMap.clear()
    for (const entry of entries) {
      this.sessionEntries.push(entry)
      this.entryMap.set(entry.id, entry)
    }
    Object.assign(this.meta, meta)
    this.meta.tags = [...meta.tags]
    this._leafId =
      restoredLeafId ?? (entries.length > 0 ? entries[entries.length - 1]?.id : undefined)

    if (sideEffects) {
      this.sideEffects.length = 0
      for (const effect of sideEffects) {
        this.sideEffects.push(this.cloneSideEffect(effect))
      }
    }

    if (checkpoints) {
      this.checkpoints.clear()
      for (const checkpoint of checkpoints) {
        this.checkpoints.set(checkpoint.id, this.cloneCheckpoint(checkpoint))
      }
    }
  }

  toSnapshot(): {
    entries: SessionEntry<T>[]
    metadata: SessionMetadata
    leafId?: string
    checkpoints?: SessionCheckpoint<T>[]
    sideEffects?: SessionSideEffect[]
  } {
    return {
      entries: [...this.sessionEntries],
      metadata: this.metadata(),
      leafId: this._leafId,
      checkpoints: this.listCheckpoints() as SessionCheckpoint<T>[],
      sideEffects: this.listSideEffects() as SessionSideEffect[],
    }
  }

  private cloneCheckpoint(checkpoint: SessionCheckpoint<T>): SessionCheckpoint<T> {
    return {
      ...checkpoint,
      entries: [...checkpoint.entries],
      sideEffects: checkpoint.sideEffects.map((effect) => this.cloneSideEffect(effect)),
      metadata: {
        ...checkpoint.metadata,
        tags: [...checkpoint.metadata.tags],
      },
    }
  }

  private cloneSideEffect(effect: SessionSideEffect): SessionSideEffect {
    return {
      ...effect,
      targets: [...effect.targets],
      metadata: effect.metadata ? { ...effect.metadata } : undefined,
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
