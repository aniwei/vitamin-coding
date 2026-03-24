import { describe, expect, it } from 'vitest'

import { diff } from '../src/fs/diff'

describe('fs diff utility', () => {
  it('returns firstChangedLine and line markers', () => {
    const oldText = 'a\nb\nc\nd'
    const newText = 'a\nb\nX\nd'

    const result = diff(oldText, newText)

    expect(result.firstChangedLine).toBe(3)
    expect(result.content).toContain('-3 c')
    expect(result.content).toContain('+3 X')
  })

  it('adds ellipsis for large unchanged ranges', () => {
    const oldLines = Array.from({ length: 30 }, (_, i) => `line-${i + 1}`).join('\n')
    const newLines = Array.from({ length: 30 }, (_, i) => (i === 14 ? 'line-15-updated' : `line-${i + 1}`)).join('\n')

    const result = diff(oldLines, newLines, 2)

    expect(result.content).toContain('...')
    expect(result.content).toContain('line-15-updated')
  })
})
