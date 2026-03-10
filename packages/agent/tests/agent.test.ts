// @vitamin/agent Agent 状态机测试
import { describe, expect, it } from 'vitest'
import { Agent } from '../src/agent'

import type { Model } from '@vitamin/ai'
import type { AgentEvent } from '../src/types'

// 最小 Model stub
function makeModel(): Model {
  return {
    id: 'test/stub',
    name: 'Stub',
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: 'https://example.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxOutputTokens: 4096,
  }
}

describe('Agent', () => {
  describe('#given a freshly created agent', () => {
    it('#then status is idle', () => {
      const agent = new Agent({
        model: makeModel(),
        systemPrompt: 'You are helpful',
      })
      expect(agent.status).toBe('idle')
    })

    it('#then messages is empty', () => {
      const agent = new Agent({
        model: makeModel(),
        systemPrompt: 'test',
      })
      expect(agent.messages).toHaveLength(0)
    })

    it('#then turnCount is 0', () => {
      const agent = new Agent({
        model: makeModel(),
        systemPrompt: 'test',
      })
      expect(agent.turnCount).toBe(0)
    })
  })

  describe('#given an idle agent', () => {
    describe('#when setModel() is called', () => {
      it('#then model is updated', () => {
        const agent = new Agent({
          model: makeModel(),
          systemPrompt: 'test',
        })
        const newModel = { ...makeModel(), id: 'test/new', name: 'New' }
        agent.setModel(newModel)
        expect(agent.model.id).toBe('test/new')
      })
    })

    describe('#when setSystemPrompt() is called', () => {
      it('#then systemPrompt is updated in state', () => {
        const agent = new Agent({
          model: makeModel(),
          systemPrompt: 'old prompt',
        })
        agent.setSystemPrompt('new prompt')
        expect(agent.getState().systemPrompt).toBe('new prompt')
      })
    })

    describe('#when registerTools() is called', () => {
      it('#then tools are appended', () => {
        const agent = new Agent({
          model: makeModel(),
          systemPrompt: 'test',
        })
        expect(agent.getState().tools).toHaveLength(0)
        agent.registerTools([
          {
            name: 'test_tool',
            description: 'A test tool',
            parameters: { safeParse: (v: unknown) => ({ success: true, data: v }) } as never,
            execute: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
          },
        ])
        expect(agent.getState().tools).toHaveLength(1)
      })
    })

    describe('#when clearTools() is called', () => {
      it('#then tools are emptied', () => {
        const agent = new Agent({
          model: makeModel(),
          systemPrompt: 'test',
          tools: [
            {
              name: 'test_tool',
              description: 'A test tool',
              parameters: { safeParse: (v: unknown) => ({ success: true, data: v }) } as never,
              execute: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
            },
          ],
        })
        expect(agent.getState().tools).toHaveLength(1)
        agent.clearTools()
        expect(agent.getState().tools).toHaveLength(0)
      })
    })

    describe('#when steer() and followUp() are called', () => {
      it('#then messages are queued (accessible via getState indirectly)', () => {
        const agent = new Agent({
          model: makeModel(),
          systemPrompt: 'test',
        })
        // steer/followUp 只是内部 queue，不直接暴露
        // 只验证不抛错
        agent.steer({ role: 'user', content: 'steer msg', timestamp: Date.now() })
        agent.followUp({ role: 'user', content: 'followup msg', timestamp: Date.now() })
      })
    })
  })

  describe('#given an idle agent', () => {
    describe('#when abort() is called from idle', () => {
      it('#then emits abort event and transitions to aborted', () => {
        const agent = new Agent({
          model: makeModel(),
          systemPrompt: 'test',
        })

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
        const agent = new Agent({
          model: makeModel(),
          systemPrompt: 'test',
        })
        // reset 从 idle 也应该安全工作
        agent.steer({ role: 'user', content: 'test', timestamp: Date.now() })
        agent.reset()

        expect(agent.status).toBe('idle')
        expect(agent.messages).toHaveLength(0)
        expect(agent.turnCount).toBe(0)
      })
    })
  })

  describe('#given event subscription', () => {
    describe('#when on() unsubscribe is called', () => {
      it('#then listener no longer receives events', () => {
        const agent = new Agent({
          model: makeModel(),
          systemPrompt: 'test',
        })
        const events: AgentEvent[] = []
        const unsub = agent.on((e) => events.push(e))

        // abort 从 idle: 发射 abort + status_change 事件
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
