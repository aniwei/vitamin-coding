import { describe, expect, it, beforeEach } from 'vitest'
import { OperationalLearningStore } from '../src/operational-learning'

import type { LessonInput } from '../src/operational-learning'

function makeLessonInput(overrides: Partial<LessonInput> = {}): LessonInput {
  return {
    tags: ['typescript', 'testing'],
    trigger: 'When writing tests',
    insight: 'Use real execution over mocks',
    sourceSessionId: 'session-1',
    ...overrides,
  }
}

describe('OperationalLearningStore', () => {
  let store: OperationalLearningStore

  beforeEach(() => {
    store = new OperationalLearningStore()
  })

  it('#given save called #then stores a lesson with generated id', async () => {
    const lesson = await store.save(makeLessonInput())

    expect(lesson.id).toMatch(/^lesson_/)
    expect(lesson.tags).toEqual(['typescript', 'testing'])
    expect(lesson.trigger).toBe('When writing tests')
    expect(lesson.insight).toBe('Use real execution over mocks')
    expect(lesson.createdAt).toBeGreaterThan(0)
    expect(lesson.appliedCount).toBe(0)
    expect(store.size).toBe(1)
  })

  it('#given get called with valid id #then returns the lesson', async () => {
    const saved = await store.save(makeLessonInput())
    const retrieved = await store.get(saved.id)

    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(saved.id)
  })

  it('#given get called with unknown id #then returns undefined', async () => {
    const result = await store.get('unknown')
    expect(result).toBeUndefined()
  })

  it('#given search with matching query #then returns scored results', async () => {
    await store.save(makeLessonInput({ trigger: 'TypeScript imports' }))
    await store.save(makeLessonInput({ trigger: 'Python packages' }))
    await store.save(makeLessonInput({ trigger: 'TypeScript generics' }))

    const results = await store.search('typescript')
    expect(results.length).toBeGreaterThanOrEqual(2)
    // TypeScript-related lessons should rank higher
    expect(results[0].trigger).toContain('TypeScript')
  })

  it('#given search #then increments appliedCount', async () => {
    await store.save(makeLessonInput({ trigger: 'matching query' }))
    const results = await store.search('matching')

    expect(results).toHaveLength(1)
    expect(results[0].appliedCount).toBe(1)
  })

  it('#given search with no matches #then returns empty', async () => {
    await store.save(makeLessonInput())
    const results = await store.search('zzz_nonexistent_zzz')
    expect(results).toEqual([])
  })

  it('#given list with tag filter #then filters by tag', async () => {
    await store.save(makeLessonInput({ tags: ['alpha'] }))
    await store.save(makeLessonInput({ tags: ['beta'] }))
    await store.save(makeLessonInput({ tags: ['alpha', 'gamma'] }))

    const results = await store.list({ tags: ['alpha'] })
    expect(results).toHaveLength(2)
  })

  it('#given list with query filter #then filters by trigger/insight', async () => {
    await store.save(makeLessonInput({ trigger: 'use pnpm' }))
    await store.save(makeLessonInput({ trigger: 'use npm' }))

    const results = await store.list({ query: 'pnpm' })
    expect(results).toHaveLength(1)
    expect(results[0].trigger).toBe('use pnpm')
  })

  it('#given delete with valid id #then removes it', async () => {
    const lesson = await store.save(makeLessonInput())
    expect(store.size).toBe(1)

    const deleted = await store.delete(lesson.id)
    expect(deleted).toBe(true)
    expect(store.size).toBe(0)
  })

  it('#given delete with unknown id #then returns false', async () => {
    const deleted = await store.delete('unknown')
    expect(deleted).toBe(false)
  })

  it('#given search with limit #then caps results', async () => {
    for (let i = 0; i < 10; i++) {
      await store.save(makeLessonInput({ trigger: `test item ${i}` }))
    }

    const results = await store.search('test', 3)
    expect(results).toHaveLength(3)
  })
})
