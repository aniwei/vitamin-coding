import { describe, expect, it, beforeEach } from 'vitest'
import {
  PersistentMemory,
  InMemoryMemoryStore,
  DEFAULT_MEMORY_SOURCES,
} from '../src/persistent-memory'

describe('InMemoryMemoryStore', () => {
  it('#given preset data #then load returns matching sources', async () => {
    const store = new InMemoryMemoryStore()
    store.set('~/.vitamin/AGENTS.md', 'global prefs')
    store.set('./AGENTS.md', 'project prefs')

    const result = await store.load([
      { path: '~/.vitamin/AGENTS.md', writable: true },
      { path: './AGENTS.md', writable: false },
    ])

    expect(result.size).toBe(2)
    expect(result.get('~/.vitamin/AGENTS.md')).toBe('global prefs')
    expect(result.get('./AGENTS.md')).toBe('project prefs')
  })

  it('#given missing source #then load skips it', async () => {
    const store = new InMemoryMemoryStore()
    store.set('a.md', 'content')

    const result = await store.load([
      { path: 'a.md', writable: true },
      { path: 'missing.md', writable: true },
    ])

    expect(result.size).toBe(1)
  })

  it('#given write call #then updates data', async () => {
    const store = new InMemoryMemoryStore()
    await store.write('test.md', 'new content')

    const result = await store.load([{ path: 'test.md', writable: true }])
    expect(result.get('test.md')).toBe('new content')
  })
})

describe('PersistentMemory', () => {
  let store: InMemoryMemoryStore

  beforeEach(() => {
    store = new InMemoryMemoryStore()
  })

  it('#given sources with content #then load populates memories', async () => {
    store.set('~/.vitamin/AGENTS.md', 'preferences')

    const pm = new PersistentMemory(store, [
      { path: '~/.vitamin/AGENTS.md', writable: true },
    ])
    await pm.load()

    const memories = pm.getMemories()
    expect(memories.size).toBe(1)
    expect(memories.get('~/.vitamin/AGENTS.md')).toBe('preferences')
  })

  it('#given loaded memories #then getInjection returns formatted text', async () => {
    store.set('~/.vitamin/AGENTS.md', 'User likes TypeScript')

    const pm = new PersistentMemory(store, [
      { path: '~/.vitamin/AGENTS.md', writable: true },
    ])
    await pm.load()

    const injection = pm.getInjection()
    expect(injection).toContain('<agent_memory>')
    expect(injection).toContain('User likes TypeScript')
  })

  it('#given no sources loaded #then getInjection returns empty', async () => {
    const pm = new PersistentMemory(store, [])
    await pm.load()

    expect(pm.getInjection()).toBe('')
  })

  it('#given reload called #then refreshes memories', async () => {
    store.set('a.md', 'v1')

    const pm = new PersistentMemory(store, [{ path: 'a.md', writable: true }])
    await pm.load()
    expect(pm.getMemories().get('a.md')).toBe('v1')

    store.set('a.md', 'v2')
    await pm.reload()
    expect(pm.getMemories().get('a.md')).toBe('v2')
  })

  it('#given dispose called #then clears memories', async () => {
    store.set('a.md', 'content')

    const pm = new PersistentMemory(store, [{ path: 'a.md', writable: true }])
    await pm.load()
    expect(pm.getMemories().size).toBe(1)

    pm.dispose()
    expect(pm.getMemories().size).toBe(0)
  })
})

describe('DEFAULT_MEMORY_SOURCES', () => {
  it('#then has three default sources', () => {
    expect(DEFAULT_MEMORY_SOURCES).toHaveLength(3)
    expect(DEFAULT_MEMORY_SOURCES[0].path).toContain('~/.vitamin/AGENTS.md')
    expect(DEFAULT_MEMORY_SOURCES[2].writable).toBe(false)
  })
})
