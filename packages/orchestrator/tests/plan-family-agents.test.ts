// Plan Family Agent 工厂测试 (5.1.1-5.1.3: Prometheus, Momus, Metis, Atlas, Multimodal-Looker)
import { describe, expect, it } from 'vitest'

import { createMetisAgent } from '../src/agents/metis'
import { createMomusAgent, parseMomusOutput } from '../src/agents/momus'
import { createMultimodalLookerAgent } from '../src/agents/multimodal-looker'
import { createPrometheusAgent } from '../src/agents/prometheus'
import { createAtlasAgent } from '../src/agents/atlas'

import type { AgentEventListener, AgentMessage, AgentState, AgentTool } from '@vitamin/agent'
import type { AssistantMessage, Model } from '@vitamin/ai'

// ═══ 手工 Stub ═══

function createFakeAgent(output: string = 'default response') {
  let listener: AgentEventListener | null = null
  let aborted = false

  const state: AgentState = {
    status: 'idle',
    systemPrompt: 'test',
    model: 'test-model' as Model,
    tools: [],
    messages: [{ role: 'user', content: 'test' }] as AgentMessage[],
    turnCount: 1,
    tokenUsage: { input: 100, output: 50, cacheRead: 0 },
    isStreaming: false,
    currentStreamMessage: null,
    pendingToolCalls: new Set(),
  }

  return {
    agent: {
      async prompt(_msg: AgentMessage): Promise<AssistantMessage> {
        return { role: 'assistant' as const, content: output }
      },
      getState: () => state,
      abort() { aborted = true },
      on(l: AgentEventListener) { listener = l },
      isAborted() { return aborted },
      getListener() { return listener },
    },
    isAborted() { return aborted },
    getListener() { return listener },
  }
}

function createStubModel(name: string = 'test-model'): Model {
  return {
    id: name,
    name,
    api: 'anthropic',
    provider: 'anthropic',
    baseUrl: 'https://api.test.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 1, output: 2, cacheRead: 0.5 },
    contextWindow: 100000,
    maxOutputTokens: 4096,
  } as Model
}

const stubTools: AgentTool[] = []

describe('@vitamin/orchestrator', () => {
  describe('#given Plan Family Agents', () => {
    describe('#when 创建 Metis Agent', () => {
      it('#then 返回含 prompt、abort、on 的 AgentInstance', () => {
        const instance = createMetisAgent(createStubModel(), stubTools)
        expect(instance).toHaveProperty('prompt')
        expect(instance).toHaveProperty('abort')
        expect(instance).toHaveProperty('on')
      })

      it('#then 支持自定义 systemPrompt', () => {
        const instance = createMetisAgent(createStubModel(), stubTools, {
          systemPrompt: 'custom metis prompt',
        })
        expect(instance).toBeDefined()
      })

      it('#then 支持自定义 maxToolTurns', () => {
        const instance = createMetisAgent(createStubModel(), stubTools, {
          maxToolTurns: 5,
        })
        expect(instance).toBeDefined()
      })
    })

    describe('#when 创建 Prometheus Agent', () => {
      it('#then 返回 AgentInstance', () => {
        const instance = createPrometheusAgent(createStubModel(), stubTools)
        expect(instance).toHaveProperty('prompt')
        expect(instance).toHaveProperty('abort')
      })
    })

    describe('#when 创建 Momus Agent', () => {
      it('#then 返回 AgentInstance', () => {
        const instance = createMomusAgent(createStubModel(), stubTools)
        expect(instance).toHaveProperty('prompt')
      })
    })

    describe('#when 创建 Atlas Agent', () => {
      it('#then 返回 AgentInstance', () => {
        const instance = createAtlasAgent(createStubModel(), stubTools)
        expect(instance).toHaveProperty('prompt')
        expect(instance).toHaveProperty('abort')
      })
    })

    describe('#when 创建 Multimodal Looker Agent', () => {
      it('#then 返回 AgentInstance', () => {
        const instance = createMultimodalLookerAgent(createStubModel(), stubTools)
        expect(instance).toHaveProperty('prompt')
      })
    })

    // 5.1.3 验收: Momus 审查通过/拒绝
    describe('#when 解析 Momus 审查输出', () => {
      it('#then 识别 [OKAY] 为通过', () => {
        const result = parseMomusOutput('[OKAY]\nSummary: Plan looks good')
        expect(result.approved).toBe(true)
        expect(result.summary).toBe('Plan looks good')
        expect(result.issues).toHaveLength(0)
      })

      it('#then 识别 [REJECT] 为拒绝', () => {
        const result = parseMomusOutput('[REJECT]\n1. Missing error handling\n2. No tests\n3. Too broad')
        expect(result.approved).toBe(false)
        expect(result.issues).toHaveLength(3)
        expect(result.issues[0]).toContain('Missing error handling')
      })

      it('#then 拒绝时最多返回 3 条 issue', () => {
        const result = parseMomusOutput(
          '[REJECT]\n1. Issue A\n2. Issue B\n3. Issue C\n4. Issue D\n5. Issue E',
        )
        expect(result.issues.length).toBeLessThanOrEqual(3)
      })

      it('#then 无标记时默认拒绝', () => {
        const result = parseMomusOutput('Some feedback without markers')
        expect(result.approved).toBe(false)
      })
    })
  })
})
