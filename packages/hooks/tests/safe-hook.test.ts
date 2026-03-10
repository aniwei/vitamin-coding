// 安全 Hook 工厂 单元测试
import { describe, expect, it } from 'vitest'

import { isHookEnabled, safeCreateHook, safeHookEnabled } from '../src/safe-hook'

import type { HookRegistration } from '../src/types'

describe('safeCreateHook', () => {
  describe('#given enabled=true and factory succeeds', () => {
    it('#then returns the created hook', () => {
      const hook = safeCreateHook<'chat.message.before'>('test', () => ({
        name: 'test',
        timing: 'chat.message.before',
        priority: 10,
        enabled: true,
        handler() {},
      }), { enabled: true })

      expect(hook).not.toBeNull()
      expect(hook?.name).toBe('test')
    })
  })

  describe('#given enabled=false', () => {
    it('#then returns null without calling factory', () => {
      let called = false
      const hook = safeCreateHook<'chat.message.before'>('test', () => {
        called = true
        return {
          name: 'test',
          timing: 'chat.message.before',
          priority: 10,
          enabled: true,
          handler() {},
        }
      }, { enabled: false })

      expect(hook).toBeNull()
      expect(called).toBe(false)
    })
  })

  describe('#given factory throws', () => {
    it('#then returns null without propagating error', () => {
      const hook = safeCreateHook<'chat.message.before'>('bad-hook', () => {
        throw new Error('Factory exploded')
      }, { enabled: true })

      expect(hook).toBeNull()
    })
  })
})

describe('isHookEnabled', () => {
  describe('#given hookName not in disabled list', () => {
    it('#then returns true', () => {
      expect(isHookEnabled('file-guard', ['output-truncation'])).toBe(true)
    })
  })

  describe('#given hookName in disabled list', () => {
    it('#then returns false', () => {
      expect(isHookEnabled('file-guard', ['file-guard', 'output-truncation'])).toBe(false)
    })
  })

  describe('#given empty disabled list', () => {
    it('#then all hooks are enabled', () => {
      expect(isHookEnabled('any-hook', [])).toBe(true)
    })
  })
})

describe('safeHookEnabled', () => {
  it('#then delegates to isHookEnabled', () => {
    expect(safeHookEnabled('file-guard', ['file-guard'])).toBe(false)
    expect(safeHookEnabled('file-guard', [])).toBe(true)
  })
})
