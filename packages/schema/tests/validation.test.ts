import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { validateWithZod } from '../src'

describe('validateWithZod', () => {
  it('#returns typed data on success', () => {
    const result = validateWithZod(z.object({ path: z.string() }), { path: '/tmp/a.txt' })

    expect(result).toEqual({ success: true, data: { path: '/tmp/a.txt' } })
  })

  it('#formats zod issues on failure', () => {
    const result = validateWithZod(z.object({ count: z.number() }), { count: '1' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('count:')
    expect(result.issues?.[0]?.path).toEqual(['count'])
  })
})
