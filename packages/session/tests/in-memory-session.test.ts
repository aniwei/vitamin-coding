import { describe, expect, it } from 'vitest'
import { SessionError } from '@x-mars/shared'
import { InMemorySession } from '../src/in-memory-session'

describe('InMemorySession', () => {
  describe('#given a new session', () => {
    it('#then has correct id and empty entries', () => {
      const session = new InMemorySession('test-1')
      expect(session.id).toBe('test-1')
      expect(session.entries()).toHaveLength(0)
      expect(session.messages()).toHaveLength(0)
    })

    it('#then metadata is initialized', () => {
      const session = new InMemorySession('test-2')
      const meta = session.metadata()
      expect(meta.createdAt).toBeGreaterThan(0)
      expect(meta.lastActiveAt).toBeGreaterThan(0)
      expect(meta.messageCount).toBe(0)
      expect(meta.compactionCount).toBe(0)
      expect(meta.tags).toEqual([])
    })
  })

  describe('#when appending messages', () => {
    it('#then entries and messages grow', () => {
      const session = new InMemorySession<string>('s1')
      session.append('hello')
      session.append('world')

      expect(session.entries()).toHaveLength(2)
      expect(session.messages()).toEqual(['hello', 'world'])
    })

    it('#then metadata.messageCount increments', () => {
      const session = new InMemorySession<string>('s1')
      session.append('a')
      session.append('b')
      expect(session.metadata().messageCount).toBe(2)
    })
  })

  describe('#when compacting', () => {
    it('#then buildContext returns summary + remaining messages', () => {
      const session = new InMemorySession<string>('s1')
      session.append('msg1')
      session.append('msg2')

      session.compact('Summary of msg1-2', 2)

      // msg3 added AFTER compaction
      session.append('msg3')

      const ctx = session.buildContext()
      expect(ctx.summary).toBe('Summary of msg1-2')
      expect(ctx.messages).toEqual(['msg3'])
    })

    it('#then metadata.compactionCount increments', () => {
      const session = new InMemorySession<string>('s1')
      session.append('a')
      session.compact('summary', 1)
      expect(session.metadata().compactionCount).toBe(1)
    })

    it('#then rejects invalid compactedCount', () => {
      const session = new InMemorySession<string>('s1')
      session.append('a')
      session.compact('summary', 0)
      expect(session.entries()).toHaveLength(1) // no compaction entry
      session.compact('summary', 5)
      expect(session.entries()).toHaveLength(1) // still no compaction
    })
  })

  describe('#when buildContext with no compaction', () => {
    it('#then returns all messages without summary', () => {
      const session = new InMemorySession<string>('s1')
      session.append('a')
      session.append('b')
      
      const ctx = session.buildContext()
      expect(ctx.summary).toBeUndefined()
      expect(ctx.messages).toEqual(['a', 'b'])
    })
  })

  describe('#when using setTitle/setTags/addTag', () => {
    it('#then metadata reflects changes', () => {
      const session = new InMemorySession<string>('s1')
      session.setTitle('My Chat')
      session.addTag('important')
      session.addTag('code')

      const meta = session.metadata()
      expect(meta.title).toBe('My Chat')
      expect(meta.tags).toEqual(['important', 'code'])
    })

    it('#then addTag is idempotent', () => {
      const session = new InMemorySession<string>('s1')
      session.addTag('test')
      session.addTag('test')
      expect(session.metadata().tags).toEqual(['test'])
    })
  })

  describe('#when exporting snapshot', () => {
    it('#then snapshot includes all data', () => {
      const session = new InMemorySession<string>('s1')
      session.append('hello')
      session.setTitle('Test')

      const snap = session.toSnapshot()
      expect(snap.entries).toHaveLength(1)
      expect(snap.metadata.title).toBe('Test')
      expect(snap.metadata.messageCount).toBe(1)
    })
  })

  describe('#when restoring from snapshot', () => {
    it('#then session state is fully recovered', () => {
      const original = new InMemorySession<string>('s1')
      original.append('msg1')
      original.append('msg2')
      original.compact('summary', 1)
      original.append('msg3')
      original.setTitle('Restored')

      const snap = original.toSnapshot()

      const restored = new InMemorySession<string>('s1')
      restored.restoreEntries(snap.entries, snap.metadata)

      expect(restored.messages()).toEqual(['msg1', 'msg2', 'msg3'])
      const ctx = restored.buildContext()
      expect(ctx.summary).toBe('summary')
      expect(ctx.messages).toEqual(['msg3'])
      expect(restored.metadata().title).toBe('Restored')
    })
  })

  describe('#when using checkpoints', () => {
    it('#then creates immutable checkpoint snapshots', () => {
      const session = new InMemorySession<string>('checkpoint-1')
      session.append('a')
      session.updateMetadata({ title: 'before' })
      session.recordSideEffect({
        type: 'file',
        action: 'write',
        targets: ['src/a.ts'],
        toolCallId: 'tool-1',
        toolName: 'write',
        reversible: true,
      })

      const checkpoint = session.createCheckpoint('before edit')
      session.append('b')
      session.updateMetadata({ title: 'after' })
      session.recordSideEffect({
        type: 'file',
        action: 'write',
        targets: ['src/b.ts'],
        toolCallId: 'tool-2',
        toolName: 'write',
        reversible: true,
      })

      expect(checkpoint.label).toBe('before edit')
      expect(checkpoint.entryCount).toBe(1)
      expect(checkpoint.sideEffectCount).toBe(1)
      expect(checkpoint.sideEffects.map((effect) => effect.targets[0])).toEqual(['src/a.ts'])
      expect(checkpoint.metadata.title).toBe('before')
      expect(session.listCheckpoints()).toHaveLength(1)
      expect(session.messages()).toEqual(['a', 'b'])
    })

    it('#then restores messages and metadata to a checkpoint', () => {
      const session = new InMemorySession<string>('checkpoint-2')
      session.append('a')
      session.updateMetadata({ title: 'checkpoint title', tags: ['saved'] })
      const checkpoint = session.createCheckpoint('saved')

      session.append('b')
      session.updateMetadata({ title: 'changed', tags: ['changed'] })

      expect(session.restoreCheckpoint(checkpoint.id)).toBe(true)
      expect(session.messages()).toEqual(['a'])
      expect(session.metadata().title).toBe('checkpoint title')
      expect(session.metadata().tags).toEqual(['saved'])
    })

    it('#then rewinds side-effect ledger to the checkpoint', () => {
      const session = new InMemorySession<string>('checkpoint-side-effects')
      session.append('a')
      session.recordSideEffect({
        type: 'file',
        action: 'write',
        targets: ['src/a.ts'],
        toolCallId: 'tool-a',
        toolName: 'write',
        reversible: true,
      })
      const checkpoint = session.createCheckpoint('after a')

      session.append('b')
      session.recordSideEffect({
        type: 'network',
        action: 'request',
        targets: ['https://example.com'],
        toolCallId: 'tool-b',
        toolName: 'fetch',
        reversible: false,
      })

      expect(session.listSideEffects()).toHaveLength(2)
      expect(session.restoreCheckpoint(checkpoint.id)).toBe(true)
      expect(session.listSideEffects()).toHaveLength(1)
      expect(session.listSideEffects()[0]?.targets).toEqual(['src/a.ts'])
    })

    it('#then returns false for missing checkpoint id', () => {
      const session = new InMemorySession<string>('checkpoint-missing')
      session.append('a')

      expect(session.restoreCheckpoint('missing')).toBe(false)
      expect(session.messages()).toEqual(['a'])
    })

    it('#then checkpoints survive snapshot restore', () => {
      const original = new InMemorySession<string>('checkpoint-snapshot')
      original.append('a')
      const checkpoint = original.createCheckpoint('saved')
      original.append('b')

      const snap = original.toSnapshot()
      const restored = new InMemorySession<string>('checkpoint-snapshot')
      restored.restoreEntries(
        snap.entries,
        snap.metadata,
        snap.leafId,
        snap.checkpoints,
        snap.sideEffects,
      )

      expect(restored.listCheckpoints()).toHaveLength(1)
      expect(restored.restoreCheckpoint(checkpoint.id)).toBe(true)
      expect(restored.messages()).toEqual(['a'])
    })
  })

  describe('#when creating with parent info', () => {
    it('#then metadata records parentSessionId', () => {
      const session = new InMemorySession<string>('fork-1', 'parent-1', 5)
      const meta = session.metadata()
      expect(meta.parentSessionId).toBe('parent-1')
      expect(meta.forkPoint).toBe(5)
    })
  })

  describe('#when branching to a missing entry', () => {
    it('#then throws a typed session error', () => {
      const session = new InMemorySession<string>('missing-entry')

      expect(() => session.branch('entry-1')).toThrow(SessionError)
      expect(() => session.branch('entry-1')).toThrow('Entry "entry-1" not found')

      try {
        session.branch('entry-1')
      } catch (error) {
        expect(error).toMatchObject({
          code: 'SESSION_ENTRY_NOT_FOUND',
          metadata: {
            sessionId: 'missing-entry',
            entryId: 'entry-1',
          },
        })
      }
    })
  })

  describe('#when setTags replaces all tags', () => {
    it('#then previous tags are replaced entirely', () => {
      const session = new InMemorySession<string>('tags-1')
      session.addTag('old-a')
      session.addTag('old-b')
      session.setTags(['new-x', 'new-y'])
      expect(session.metadata().tags).toEqual(['new-x', 'new-y'])
    })

    it('#then setTags with empty array clears tags', () => {
      const session = new InMemorySession<string>('tags-2')
      session.addTag('keep')
      session.setTags([])
      expect(session.metadata().tags).toEqual([])
    })
  })

  describe('#when session is empty', () => {
    it('#then buildContext returns no summary and empty messages', () => {
      const session = new InMemorySession<string>('empty-ctx')
      const ctx = session.buildContext()
      expect(ctx.summary).toBeUndefined()
      expect(ctx.messages).toEqual([])
    })

    it('#then messages returns empty array', () => {
      const session = new InMemorySession<string>('empty-msg')
      expect(session.messages()).toEqual([])
    })

    it('#then leafId is undefined', () => {
      const session = new InMemorySession<string>('empty-leaf')
      expect(session.leafId).toBeUndefined()
    })
  })

  describe('#when restoreEntries without restoredLeafId', () => {
    it('#then leafId falls back to last entry id', () => {
      const original = new InMemorySession<string>('fb-1')
      original.append('a')
      original.append('b')
      const snap = original.toSnapshot()

      const restored = new InMemorySession<string>('fb-1')
      restored.restoreEntries(snap.entries, snap.metadata)
      // 没传 restoredLeafId，应回退到最后一条 entry 的 id
      expect(restored.leafId).toBe(snap.entries[snap.entries.length - 1].id)
      expect(restored.messages()).toEqual(['a', 'b'])
    })
  })

  describe('#entries() vs branchEntries() across branches', () => {
    it('#then entries() returns all entries from all branches', () => {
      const session = new InMemorySession<string>('all-entries')
      session.append('shared')
      const sharedId = session.entries()[0].id

      session.append('a1') // branch A
      session.branch(sharedId) // switch back
      session.append('b1') // branch B

      // entries() 包含所有分支的条目
      expect(session.entries()).toHaveLength(3)
      // branchEntries() 只包含当前分支
      expect(session.branchEntries()).toHaveLength(2) // shared, b1
    })
  })

  describe('#lastActiveAt updates on operations', () => {
    it('#then lastActiveAt advances on append', async () => {
      const session = new InMemorySession<string>('lat-1')
      const t0 = session.metadata().lastActiveAt
      await new Promise(r => setTimeout(r, 10))
      session.append('x')
      expect(session.metadata().lastActiveAt).toBeGreaterThan(t0)
    })

    it('#then lastActiveAt advances on compact', async () => {
      const session = new InMemorySession<string>('lat-2')
      session.append('x')
      const t0 = session.metadata().lastActiveAt
      await new Promise(r => setTimeout(r, 10))
      session.compact('s', 1)
      expect(session.metadata().lastActiveAt).toBeGreaterThan(t0)
    })

    it('#then lastActiveAt advances on branch', async () => {
      const session = new InMemorySession<string>('lat-3')
      session.append('x')
      const entryId = session.entries()[0].id
      const t0 = session.metadata().lastActiveAt
      await new Promise(r => setTimeout(r, 10))
      session.branch(entryId)
      expect(session.metadata().lastActiveAt).toBeGreaterThan(t0)
    })

    it('#then lastActiveAt advances on setTitle', async () => {
      const session = new InMemorySession<string>('lat-4')
      const t0 = session.metadata().lastActiveAt
      await new Promise(r => setTimeout(r, 10))
      session.setTitle('new')
      expect(session.metadata().lastActiveAt).toBeGreaterThan(t0)
    })
  })

  describe('#compact on branch respects current branch messages only', () => {
    it('#then compactedCount refers to uncompacted messages on current branch', () => {
      const session = new InMemorySession<string>('compact-br')
      session.append('shared')
      const sharedId = session.entries()[0].id

      session.append('a1')
      session.append('a2') // branch A has 3 messages total

      session.branch(sharedId) // switch back
      session.append('b1') // branch B: shared, b1

      // Branch B has 2 uncompacted messages (shared, b1)
      // compact 2 should succeed
      session.compact('B summary', 2)
      const ctx = session.buildContext()
      expect(ctx.summary).toBe('B summary')
      expect(ctx.messages).toEqual([])

      // compact 3 should fail (only 0 uncompacted messages left on this branch)
      const countBefore = session.metadata().compactionCount
      session.compact('invalid', 1)
      expect(session.metadata().compactionCount).toBe(countBefore)
    })
  })
})

// ═══ 树结构 & 分支测试 ═══

describe('InMemorySession tree structure', () => {
  describe('#when appending messages', () => {
    it('#then entries have id and parentId chain', () => {
      const session = new InMemorySession<string>('tree-1')
      session.append('a')
      session.append('b')
      session.append('c')

      const entries = session.entries()
      expect(entries).toHaveLength(3)

      // 第一个条目无 parentId
      expect(entries[0].id).toBeTruthy()
      expect(entries[0].parentId).toBeUndefined()

      // 后续条目 parentId 指向前一条目
      expect(entries[1].parentId).toBe(entries[0].id)
      expect(entries[2].parentId).toBe(entries[1].id)

      // leafId 指向最后一个
      expect(session.leafId).toBe(entries[2].id)
    })
  })

  describe('#when branching at a mid-point', () => {
    it('#then branchEntries returns root to branch point only', () => {
      const session = new InMemorySession<string>('branch-1')
      session.append('a')
      session.append('b')
      session.append('c')

      const entries = session.entries()
      const midId = entries[1].id // 'b' 的 entry

      // 切到中间点分支
      session.branch(midId)
      expect(session.leafId).toBe(midId)

      const branchEntries = session.branchEntries()
      expect(branchEntries).toHaveLength(2) // a, b
      expect(branchEntries[0].id).toBe(entries[0].id)
      expect(branchEntries[1].id).toBe(entries[1].id)
    })

    it('#then new messages fork from branch point', () => {
      const session = new InMemorySession<string>('branch-2')
      session.append('a')
      session.append('b')
      session.append('c')

      const entries = session.entries()
      const midId = entries[1].id // branch at 'b'

      session.branch(midId)
      session.append('d') // new branch from 'b'

      // 全量 entries 包含所有节点
      expect(session.entries()).toHaveLength(4) // a, b, c, d

      // 当前分支: a → b → d
      expect(session.messages()).toEqual(['a', 'b', 'd'])

      // 新 entry 的 parentId 指向分支点
      const newEntry = session.entries()[3]
      expect(newEntry.parentId).toBe(midId)
    })
  })

  describe('#when switching between branches', () => {
    it('#then buildContext reflects the current branch', () => {
      const session = new InMemorySession<string>('branch-3')
      session.append('shared')

      const sharedId = session.entries()[0].id

      // 分支 A: shared → a1 → a2
      session.append('a1')
      session.append('a2')
      const leafA = session.leafId!

      // 切回 shared，创建分支 B
      session.branch(sharedId)
      session.append('b1')
      const leafB = session.leafId!

      // 分支 B 的上下文
      expect(session.buildContext().messages).toEqual(['shared', 'b1'])

      // 切回分支 A
      session.branch(leafA)
      expect(session.buildContext().messages).toEqual(['shared', 'a1', 'a2'])

      // 切回分支 B
      session.branch(leafB)
      expect(session.buildContext().messages).toEqual(['shared', 'b1'])
    })
  })

  describe('#when compacting on a branch', () => {
    it('#then buildContext returns summary + remaining on that branch', () => {
      const session = new InMemorySession<string>('compact-branch')
      session.append('x1')
      session.append('x2')
      session.append('x3')

      // compact 前 2 条
      session.compact('Summary of x1+x2', 2)
      session.append('x4')

      const ctx = session.buildContext()
      expect(ctx.summary).toBe('Summary of x1+x2')
      expect(ctx.messages).toEqual(['x4'])
    })
  })

  describe('#when branching at nonexistent entry', () => {
    it('#then throws', () => {
      const session = new InMemorySession<string>('err-1')
      session.append('a')
      expect(() => session.branch('nonexistent-id')).toThrow('Entry "nonexistent-id" not found')
    })
  })

  describe('#branchEntries on empty session', () => {
    it('#then returns empty array', () => {
      const session = new InMemorySession<string>('empty-branch')
      expect(session.branchEntries()).toEqual([])
      expect(session.leafId).toBeUndefined()
    })
  })

  describe('#snapshot preserves leafId', () => {
    it('#then restoring recovers branch position', () => {
      const original = new InMemorySession<string>('snap-branch')
      original.append('a')
      original.append('b')

      const entries = original.entries()
      original.branch(entries[0].id) // branch at 'a'
      original.append('c') // fork: a → c

      const snap = original.toSnapshot()
      expect(snap.leafId).toBeTruthy()

      const restored = new InMemorySession<string>('snap-branch')
      restored.restoreEntries(snap.entries, snap.metadata, snap.leafId)

      // 恢复后当前分支是 a → c
      expect(restored.messages()).toEqual(['a', 'c'])
    })
  })
})
