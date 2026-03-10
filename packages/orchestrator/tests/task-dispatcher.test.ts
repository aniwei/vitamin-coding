// TaskDispatcher 单元测试
import { describe, expect, it } from 'vitest'

import { TaskDispatcherImpl, createTaskDispatcher } from '../src/delegation/task-dispatcher'
import { createAgentRegistry } from '../src/registry/agent-registry'
import { createCategoryResolver } from '../src/delegation/category-resolver'
import { createBackgroundManager } from '../src/background/background-manager'
import type { Model } from '@vitamin/ai'
import type { AgentRegistration, AgentResult, TaskRequest } from '../src/types'

function createMockResult(output = 'done'): AgentResult {
  return {
    messages: [],
    output,
    usage: { inputTokens: 10, outputTokens: 20 },
  }
}

function createMockRegistration(name: string, overrides: Partial<AgentRegistration> = {}): AgentRegistration {
  return {
    name,
    factory: () => ({
      prompt: async () => createMockResult(`result from ${name}`),
      abort: () => {},
      on: () => {},
    }),
    mode: 'subagent',
    metadata: {
      category: 'utility',
      cost: 'CHEAP',
      triggers: [],
      executionMode: 'both',
    },
    modelPriority: ['test-model'],
    disableable: true,
    enabled: true,
    ...overrides,
  }
}

function createTestDispatcher(agents: AgentRegistration[] = []) {
  const registry = createAgentRegistry()
  for (const agent of agents) {
    registry.register(agent)
  }

  const categoryResolver = createCategoryResolver()
  const backgroundManager = createBackgroundManager()

  const testModel: Model = {
    id: 'test-model',
    provider: 'anthropic',
    name: 'test',
    api: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200_000,
    maxOutputTokens: 8192,
  }

  return createTaskDispatcher({
    registry,
    categoryResolver,
    backgroundManager,
    resolveModel: () => testModel,
    resolveTools: () => [],
  })
}

describe('TaskDispatcher', () => {
  describe('#given registered agents', () => {
    describe('#when dispatching by subagent name', () => {
      it('#then invokes the correct agent', async () => {
        const dispatcher = createTestDispatcher([
          createMockRegistration('explore'),
          createMockRegistration('oracle'),
        ])

        const handle = await dispatcher.dispatch({ prompt: 'test', subagent: 'explore' })
        const result = await handle.getResult()

        expect(result.output).toBe('result from explore')
      })
    })

    describe('#when dispatching by category', () => {
      it('#then routes to the mapped agent', async () => {
        const dispatcher = createTestDispatcher([
          createMockRegistration('hephaestus'),
          createMockRegistration('explore'),
        ])

        const handle = await dispatcher.dispatch({ prompt: 'test', category: 'code' })
        const result = await handle.getResult()

        expect(result.output).toBe('result from hephaestus')
      })
    })

    describe('#when dispatching with neither subagent nor category', () => {
      it('#then defaults to sisyphus-junior', async () => {
        const dispatcher = createTestDispatcher([
          createMockRegistration('sisyphus-junior'),
        ])

        const handle = await dispatcher.dispatch({ prompt: 'test' })
        const result = await handle.getResult()

        expect(result.output).toBe('result from sisyphus-junior')
      })
    })
  })

  describe('#given Plan Family agents', () => {
    describe('#when Plan Family tries to dispatch to Plan Family', () => {
      it('#then throws AGENT_PLAN_RECURSION error', async () => {
        const dispatcher = createTestDispatcher([
          createMockRegistration('prometheus'),
          createMockRegistration('atlas'),
        ])

        await expect(
          dispatcher.dispatch({
            prompt: 'test',
            subagent: 'atlas',
            parentAgent: 'prometheus',
          }),
        ).rejects.toThrow('Plan Family recursion detected')
      })
    })

    describe('#when non-Plan agent dispatches to Plan Family', () => {
      it('#then succeeds normally', async () => {
        const dispatcher = createTestDispatcher([
          createMockRegistration('prometheus'),
          createMockRegistration('central-secretariat'),
        ])

        const handle = await dispatcher.dispatch({
          prompt: 'test',
          subagent: 'prometheus',
          parentAgent: 'central-secretariat',
        })
        const result = await handle.getResult()

        expect(result.output).toBe('result from prometheus')
      })
    })
  })

  describe('#given a disabled agent', () => {
    describe('#when dispatching to disabled agent', () => {
      it('#then throws AGENT_DISABLED error', async () => {
        const dispatcher = createTestDispatcher([
          createMockRegistration('explore', { enabled: false }),
        ])

        await expect(
          dispatcher.dispatch({ prompt: 'test', subagent: 'explore' }),
        ).rejects.toThrow('Agent "explore" is disabled')
      })
    })
  })

  describe('#given background mode', () => {
    describe('#when dispatching with mode=background', () => {
      it('#then submits to background manager', async () => {
        const dispatcher = createTestDispatcher([
          createMockRegistration('hephaestus'),
        ])

        const handle = await dispatcher.dispatch({
          prompt: 'test',
          subagent: 'hephaestus',
          mode: 'background',
        })

        const result = await handle.getResult()
        expect(result.output).toBe('result from hephaestus')
      })
    })
  })
})
