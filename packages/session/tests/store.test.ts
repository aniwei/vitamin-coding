import { describe, expect, it } from 'vitest'
import { InMemorySessionStore, createInMemorySessionStore } from '../src/store'

describe('InMemorySessionStore', () => {
  describe('#given a fresh store', () => {
    it('#then can create and retrieve sessions', () => {
      const store = new InMemorySessionStore<string>()
      const s1 = store.createSession('s1')
      const s2 = store.createSession('s2')

      expect(store.getSession('s1')).toBe(s1)
      expect(store.getSession('s2')).toBe(s2)
      expect(store.listSessions()).toHaveLength(2)
    })

    it('#then returns undefined for nonexistent session', () => {
      const store = new InMemorySessionStore()
      expect(store.getSession('nope')).toBeUndefined()
    })

    it('#then auto-generates id when not provided', () => {
      const store = new InMemorySessionStore()
      const session = store.createSession()
      expect(session.id).toBeTruthy()
      expect(session.id.length).toBeGreaterThan(0)
    })
  })

  describe('#when deleting sessions', () => {
    it('#then session is removed', () => {
      const store = new InMemorySessionStore()
      store.createSession('to-delete')
      expect(store.deleteSession('to-delete')).toBe(true)
      expect(store.getSession('to-delete')).toBeUndefined()
    })

    it('#then returns false for nonexistent', () => {
      const store = new InMemorySessionStore()
      expect(store.deleteSession('nope')).toBe(false)
    })
  })

  describe('#when forking sessions', () => {
    it('#then creates independent copy', () => {
      const store = new InMemorySessionStore<string>()
      const original = store.createSession('original')
      original.append('msg1')
      original.append('msg2')

      const forked = store.forkSession('original', 'forked')
      expect(forked).toBeDefined()

      // Fork has all original messages
      expect(forked!.messages()).toEqual(['msg1', 'msg2'])

      // Adding to original doesn't affect fork
      original.append('msg3')
      expect(forked!.messages()).toEqual(['msg1', 'msg2'])

      // Fork metadata records parent
      const meta = forked!.metadata()
      expect(meta.parentSessionId).toBe('original')
      expect(meta.tags).toContain('fork')
    })

    it('#then returns undefined for nonexistent source', () => {
      const store = new InMemorySessionStore()
      expect(store.forkSession('nope')).toBeUndefined()
    })
  })

  describe('#createInMemorySessionStore factory', () => {
    it('#then creates a functional store', () => {
      const store = createInMemorySessionStore<string>()
      const s = store.createSession('test')
      expect(s.id).toBe('test')
    })
  })
})

// ═══ 分页功能测试 ═══

describe('InMemorySessionStore#listSessionsPaginated', () => {
  describe('#given a store with 5 sessions', () => {
    it('#then paginates with pageSize=2', () => {
      const store = new InMemorySessionStore<string>()
      for (let i = 0; i < 5; i++) {
        const s = store.createSession(`s${i}`)
        s.append(`msg-${i}`)
      }

      const page0 = store.listSessionsPaginated({ page: 0, pageSize: 2 })
      expect(page0.items).toHaveLength(2)
      expect(page0.total).toBe(5)
      expect(page0.totalPages).toBe(3)
      expect(page0.hasNext).toBe(true)
      expect(page0.hasPrevious).toBe(false)
      expect(page0.page).toBe(0)

      const page1 = store.listSessionsPaginated({ page: 1, pageSize: 2 })
      expect(page1.items).toHaveLength(2)
      expect(page1.hasNext).toBe(true)
      expect(page1.hasPrevious).toBe(true)

      const page2 = store.listSessionsPaginated({ page: 2, pageSize: 2 })
      expect(page2.items).toHaveLength(1)
      expect(page2.hasNext).toBe(false)
      expect(page2.hasPrevious).toBe(true)
    })

    it('#then sorts by lastActiveAt desc by default', async () => {
      const store = new InMemorySessionStore<string>()

      const s0 = store.createSession('old')
      s0.append('a')
      // 引入微小延迟保证 lastActiveAt 差异
      await new Promise(r => setTimeout(r, 10))
      const s1 = store.createSession('new')
      s1.append('b')

      const result = store.listSessionsPaginated({ page: 0, pageSize: 10 })
      expect(result.items[0].id).toBe('new')
      expect(result.items[1].id).toBe('old')
    })

    it('#then sorts by createdAt asc when specified', async () => {
      const store = new InMemorySessionStore<string>()

      const s0 = store.createSession('first')
      s0.append('a')
      await new Promise(r => setTimeout(r, 10))
      const s1 = store.createSession('second')
      s1.append('b')

      const result = store.listSessionsPaginated({
        page: 0,
        pageSize: 10,
        sortBy: 'createdAt',
        sortOrder: 'asc',
      })
      expect(result.items[0].id).toBe('first')
      expect(result.items[1].id).toBe('second')
    })

    it('#then clamps page to valid range', () => {
      const store = new InMemorySessionStore<string>()
      store.createSession('only')

      const result = store.listSessionsPaginated({ page: 999, pageSize: 10 })
      expect(result.page).toBe(0)
      expect(result.items).toHaveLength(1)
    })

    it('#then returns empty page for empty store', () => {
      const store = new InMemorySessionStore<string>()
      const result = store.listSessionsPaginated({ page: 0, pageSize: 10 })
      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(result.totalPages).toBe(1)
      expect(result.hasNext).toBe(false)
      expect(result.hasPrevious).toBe(false)
    })
  })

  describe('#given > 50 sessions (rolling threshold)', () => {
    it('#then default pageSize returns 50 items on first page', () => {
      const store = new InMemorySessionStore<string>()
      for (let i = 0; i < 75; i++) {
        store.createSession(`s-${i}`)
      }

      const page0 = store.listSessionsPaginated({ page: 0 })
      expect(page0.pageSize).toBe(50)
      expect(page0.items).toHaveLength(50)
      expect(page0.total).toBe(75)
      expect(page0.totalPages).toBe(2)
      expect(page0.hasNext).toBe(true)

      const page1 = store.listSessionsPaginated({ page: 1 })
      expect(page1.items).toHaveLength(25)
      expect(page1.hasNext).toBe(false)
      expect(page1.hasPrevious).toBe(true)
    })
  })
})
