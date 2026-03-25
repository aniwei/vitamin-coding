// @vitamin/agent Agent 状态机测试
import { describe, expect, it } from 'vitest'
import { Agent } from '../src/agent'

import type { AgentEvent } from '../src/types'

describe('Agent', () => {
  describe('#given a freshly created agent', () => {
    it('#then status is idle', () => {
      const agent = new Agent()
      expect(agent.status).toBe('idle')
    })

    it('#then turnCount is 0', () => {
      const agent = new Agent()
      expect(agent.turnCount).toBe(0)
    })

    it('#then getState() returns idle snapshot', () => {
      const agent = new Agent()
      const state = agent.getState()
      expect(state.status).toBe('idle')
      expect(state.turnCount).toBe(0)
      expect(state.isStreaming).toBe(false)
      expect(state.error).toBeUndefined()
    })
  })

  describe('#given an idle agent', () => {
    describe('#when steer() and followUp() are called', () => {
      it('#then messages are queued without error', () => {
        const agent = new Agent()
        agent.steer({ role: 'user', content: 'steer msg', timestamp: Date.now() })
        agent.followUp({ role: 'user', content: 'followup msg', timestamp: Date.now() })
      })
    })
  })

  describe('#given an idle agent', () => {
    describe('#when abort() is called from idle', () => {
      it('#then emits abort event and transitions to aborted', () => {
        const agent = new Agent()

        const events: AgentEvent[] = []
        agent.on((e) => events.push(e))

        agent.abort()
        expect(events.some((e) => e.type === 'abort')).toBe(true)
        expect(events.some((e) => e.type === 'status_change')).toBe(true)
        expect(agent.status).toBe('aborted')
      })
    })
  })

  describe('#given an agent after reset', () => {
    describe('#when reset() is called', () => {
      it('#then state returns to idle with cleared data', () => {
        const agent = new Agent()
        agent.steer({ role: 'user', content: 'test', timestamp: Date.now() })
        agent.reset()

        expect(agent.status).toBe('idle')
        expect(agent.turnCount).toBe(0)
      })
    })
  })

  describe('#given event subscription', () => {
    describe('#when on() unsubscribe is called', () => {
      it('#then listener no longer receives events', () => {
        const agent = new Agent()
        const events: AgentEvent[] = []
        const unsub = agent.on((e) => events.push(e))

        agent.abort()
        const countBefore = events.length
        expect(countBefore).toBeGreaterThan(0)

        unsub()
        // unsub 后再触发 abort，events 不应增长
        agent.abort()
        expect(events).toHaveLength(countBefore)
      })
    })
  })
})
