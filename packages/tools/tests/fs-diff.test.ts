import { describe, expect, it } from 'vitest'

import { diff } from '../src/fs/diff'

describe('fs diff utility', () => {
  it('returns empty content and undefined firstChangedLine when unchanged', () => {
    const text = 'a\nb\nc'

    const result = diff(text, text)

    expect(result.firstChangedLine).toBeUndefined()
    expect(result.content).toBe('')
  })

  it('returns firstChangedLine and line markers', () => {
    const oldText = 'a\nb\nc\nd'
    const newText = 'a\nb\nX\nd'

    const result = diff(oldText, newText)

    expect(result.firstChangedLine).toBe(3)
    expect(result.content).toContain('-3 c')
    expect(result.content).toContain('+3 X')
  })

  it('handles inserted line at beginning', () => {
    const oldText = 'b\nc'
    const newText = 'a\nb\nc'

    const result = diff(oldText, newText)

    expect(result.firstChangedLine).toBe(1)
    expect(result.content).toContain('+1 a')
    expect(result.content).toContain(' 1 b')
  })

  it('handles removed line at end', () => {
    const oldText = 'a\nb\nc'
    const newText = 'a\nb'

    const result = diff(oldText, newText)

    expect(result.firstChangedLine).toBe(2)
    expect(result.content).toContain('-3 c')
  })

  it('keeps both change hunks with collapsed middle unchanged range', () => {
    const oldLines = Array.from({ length: 40 }, (_, i) => `line-${i + 1}`)
    const newLines = [...oldLines]
    newLines[4] = 'line-5-updated'
    newLines[34] = 'line-35-updated'

    const result = diff(oldLines.join('\n'), newLines.join('\n'), 1)

    expect(result.content).toMatch(/-\s*5 line-5/)
    expect(result.content).toMatch(/\+\s*5 line-5-updated/)
    expect(result.content).toMatch(/-\s*35 line-35/)
    expect(result.content).toMatch(/\+\s*35 line-35-updated/)
    expect(result.content).toContain('...')
  })

  it('adds ellipsis for large unchanged ranges', () => {
    const oldLines = Array.from({ length: 30 }, (_, i) => `line-${i + 1}`).join('\n')
    const newLines = Array.from({ length: 30 }, (_, i) =>
      i === 14 ? 'line-15-updated' : `line-${i + 1}`,
    ).join('\n')

    const result = diff(oldLines, newLines, 2)

    expect(result.content).toContain('...')
    expect(result.content).toContain('line-15-updated')
  })
})
