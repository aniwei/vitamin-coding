import { describe, expect, it } from 'vitest'
import { buildLessonInjection } from '../src/lesson-injection'

import type { Lesson } from '../src/types'

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    tags: ['typescript'],
    trigger: 'Writing tests',
    insight: 'Use real execution',
    ...overrides,
  }
}

describe('buildLessonInjection', () => {
  it('#given empty lessons array #then returns empty string', () => {
    expect(buildLessonInjection([])).toBe('')
  })

  it('#given a single lesson #then formats numbered list', () => {
    const result = buildLessonInjection([makeLesson()])

    expect(result).toContain('### Runtime Lessons')
    expect(result).toContain('1. [typescript] Writing tests → Use real execution')
  })

  it('#given multiple lessons #then numbers them sequentially', () => {
    const lessons = [
      makeLesson({ tags: ['a'], trigger: 'T1', insight: 'I1' }),
      makeLesson({ tags: ['b', 'c'], trigger: 'T2', insight: 'I2' }),
    ]
    const result = buildLessonInjection(lessons)

    expect(result).toContain('1. [a] T1 → I1')
    expect(result).toContain('2. [b, c] T2 → I2')
  })

  it('#given lesson with multiple tags #then joins with comma', () => {
    const result = buildLessonInjection([
      makeLesson({ tags: ['ts', 'testing', 'vitest'] }),
    ])
    expect(result).toContain('[ts, testing, vitest]')
  })
})
