import { describe, expect, it } from 'vitest'
import { truncateHead, truncateLine, truncateTail } from '../src/truncate'

describe('truncateHead', () => {
  it('returns original content when within limits', () => {
    const content = 'a\nb\nc'
    const result = truncateHead(content, { maxLines: 5, maxBytes: 1024 })

    expect(result.truncated).toBe(false)
    expect(result.content).toBe(content)
    expect(result.outputLines).toBe(3)
    expect(result.outputBytes).toBe(Buffer.byteLength(content, 'utf-8'))
  })

  it('truncates by line limit first', () => {
    const result = truncateHead('1\n2\n3\n4', { maxLines: 2, maxBytes: 1024 })

    expect(result.truncated).toBe(true)
    expect(result.truncatedBy).toBe('lines')
    expect(result.content).toBe('1\n2')
    expect(result.outputLines).toBe(2)
  })

  it('returns empty when first line exceeds byte limit', () => {
    const result = truncateHead('abcdef\nnext', { maxLines: 10, maxBytes: 3 })

    expect(result.truncated).toBe(true)
    expect(result.truncatedBy).toBe('bytes')
    expect(result.content).toBe('')
    expect(result.firstLineExceedsLimit).toBe(true)
    expect(result.outputLines).toBe(0)
    expect(result.outputBytes).toBe(0)
  })

  it('truncates by byte limit while preserving complete lines', () => {
    const content = 'aa\nbbbb\ncc'
    const result = truncateHead(content, { maxLines: 10, maxBytes: 6 })

    expect(result.truncated).toBe(true)
    expect(result.truncatedBy).toBe('bytes')
    expect(result.content).toBe('aa')
    expect(result.outputLines).toBe(1)
    expect(result.outputBytes).toBe(2)
  })

  it('keeps provided options as-is', () => {
    const result = truncateHead('x\ny', { maxLines: -1, maxBytes: Number.NaN })

    expect(result.options.maxLines).toBe(-1)
    expect(Number.isNaN(result.options.maxBytes)).toBe(true)
    expect(result.content).toBe('')
    expect(result.truncatedBy).toBe('lines')
  })
})

describe('truncateTail', () => {
  it('returns original content when within limits', () => {
    const content = 'a\nb\nc'
    const result = truncateTail(content, { maxLines: 5, maxBytes: 1024 })

    expect(result.truncated).toBe(false)
    expect(result.content).toBe(content)
    expect(result.outputLines).toBe(3)
  })

  it('truncates by line limit from tail', () => {
    const result = truncateTail('1\n2\n3\n4', { maxLines: 2, maxBytes: 1024 })

    expect(result.truncated).toBe(true)
    expect(result.truncatedBy).toBe('lines')
    expect(result.content).toBe('3\n4')
  })

  it('truncates by byte limit and allows partial first output line', () => {
    const content = '头部很长\n中间\n尾部内容'
    const maxBytes = Buffer.byteLength('内容', 'utf-8')

    const result = truncateTail(content, { maxLines: 10, maxBytes })

    expect(result.truncated).toBe(true)
    expect(result.truncatedBy).toBe('bytes')
    expect(result.lastLinePartial).toBe(true)
    expect(result.content).toBe('内容')
    expect(Buffer.byteLength(result.content, 'utf-8')).toBeLessThanOrEqual(maxBytes)
  })

  it('returns empty when maxLines is negative', () => {
    const result = truncateTail('a\nb', { maxLines: -10, maxBytes: 10 })

    expect(result.truncated).toBe(true)
    expect(result.truncatedBy).toBe('lines')
    expect(result.content).toBe('')
    expect(result.outputLines).toBe(0)
  })
})

describe('truncateLine', () => {
  it('keeps short line intact', () => {
    const result = truncateLine('short', 10)
    expect(result).toEqual({ text: 'short', wasTruncated: false })
  })

  it('truncates long line with marker', () => {
    const result = truncateLine('0123456789', 5)
    expect(result.wasTruncated).toBe(true)
    expect(result.text).toBe('01234... [truncated]')
  })
})
