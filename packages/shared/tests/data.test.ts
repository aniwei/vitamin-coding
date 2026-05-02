import { describe, expect, it } from 'vitest'
import {
  asRecord,
  isRecord,
  normalizeKeysToCamel,
  readArray,
  readBoolean,
  readNumber,
  readObject,
  readString,
  toCamelKey,
} from '../src/browser/data'

describe('browser data helpers', () => {
  it('#detects non-array records', () => {
    expect(isRecord({ a: 1 })).toBe(true)
    expect(isRecord([])).toBe(false)
    expect(isRecord(null)).toBe(false)
    expect(asRecord(null)).toEqual({})
  })

  it('#reads typed values by first matching key', () => {
    const data = {
      name: 'vitamin',
      fallback: 'unused',
      count: 2,
      nan: Number.NaN,
      enabled: false,
      child: { id: 'c1' },
      items: ['a'],
    }

    expect(readString(data, 'missing', 'name', 'fallback')).toBe('vitamin')
    expect(readNumber(data, 'nan')).toBeUndefined()
    expect(readNumber(data, 'count')).toBe(2)
    expect(readBoolean(data, 'enabled')).toBe(false)
    expect(readObject(data, 'child')).toEqual({ id: 'c1' })
    expect(readArray(data, 'items')).toEqual(['a'])
  })

  it('#normalizes snake_case object keys recursively', () => {
    expect(toCamelKey('session_id')).toBe('sessionId')
    expect(
      normalizeKeysToCamel({
        session_id: 's1',
        nested_list: [{ tool_call_id: 't1' }],
      }),
    ).toEqual({
      sessionId: 's1',
      nestedList: [{ toolCallId: 't1' }],
    })
  })
})
