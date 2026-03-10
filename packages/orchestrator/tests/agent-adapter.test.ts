// Agent 适配器 + 工厂覆盖率测试
import { describe, expect, it } from 'vitest'

import { extractTextContent, wrapAgent } from '../src/agents/agent-adapter'
import { createCentralSecretariatAgent } from '../src/agents/sisyphus'
import { createHephaestusAgent } from '../src/agents/hephaestus'
import { createExploreAgent } from '../src/agents/explore'
import { createOracleAgent } from '../src/agents/oracle'
import { createLibrarianAgent } from '../src/agents/librarian'
import { createSisyphusJuniorAgent } from '../src/agents/sisyphus-junior'

import type { AgentEventListener, AgentMessage, AgentState, AgentTool } from '@vitamin/agent'
import type { AssistantMessage, Model } from '@vitamin/ai'

// ═══ 手工 Stub（禁止 vi.mock/vi.fn）═══

interface FakeAgentOptions {
  promptResult?: AssistantMessage
  state?: Partial<AgentState>
}

function createFakeAgent(opts: FakeAgentOptions = {}) {
  let listener: AgentEventListener | null = null
  let aborted = false

  const defaultState: AgentState = {
    status: 'idle',
    systemPrompt: 'test',
    model: 'test-model' as Model,
    tools: [],
    messages: [{ role: 'user', content: 'hello' }] as AgentMessage[],
    turnCount: 1,
    tokenUsage: { input: 100, output: 50, cacheRead: 0 },
    isStreaming: false,
    currentStreamMessage: null,
    pendingToolCalls: new Set(),
    ...opts.state,
  }

  return {
    async prompt(_msg: AgentMessage): Promise<AssistantMessage> {
      return opts.promptResult ?? { role: 'assistant' as const, content: 'default response' }
    },
    getState(): Readonly<AgentState> {
      return defaultState
    },
    abort() {
      aborted = true
    },
    on(l: AgentEventListener) {
      listener = l
    },
    // 测试辅助
    get _aborted() {
      return aborted
    },
    get _listener() {
      return listener
    },
  }
}

// ═══ extractTextContent 测试 ═══

describe('extractTextContent', () => {
  describe('#given a string content', () => {
    describe('#when called', () => {
      it('#then returns the string directly', () => {
        const result = extractTextContent({ content: 'hello world' })
        expect(result).toBe('hello world')
      })
    })
  })

  describe('#given an array content with text blocks', () => {
    describe('#when called', () => {
      it('#then concatenates text blocks with newlines', () => {
        const result = extractTextContent({
          content: [
            { type: 'text', text: 'Line 1' },
            { type: 'text', text: 'Line 2' },
          ],
        })
        expect(result).toBe('Line 1\nLine 2')
      })
    })
  })

  describe('#given an array content with mixed block types', () => {
    describe('#when called', () => {
      it('#then extracts only text blocks', () => {
        const result = extractTextContent({
          content: [
            { type: 'thinking', thinking: 'Let me think...' },
            { type: 'text', text: 'Answer' },
            { type: 'tool_use', name: 'grep' },
          ],
        })
        expect(result).toBe('Answer')
      })
    })
  })

  describe('#given an empty array content', () => {
    describe('#when called', () => {
      it('#then returns empty string', () => {
        const result = extractTextContent({ content: [] })
        expect(result).toBe('')
      })
    })
  })

  describe('#given a non-string non-array content', () => {
    describe('#when called', () => {
      it('#then returns empty string', () => {
        const result = extractTextContent({ content: 42 })
        expect(result).toBe('')
      })
    })
  })

  describe('#given null content', () => {
    describe('#when called', () => {
      it('#then returns empty string', () => {
        const result = extractTextContent({ content: null })
        expect(result).toBe('')
      })
    })
  })
})

// ═══ wrapAgent 测试 ═══

describe('wrapAgent', () => {
  describe('#given a fake agent', () => {
    describe('#when prompt is called', () => {
      it('#then delegates to agent.prompt and returns AgentResult', async () => {
        const fake = createFakeAgent({
          promptResult: {
            role: 'assistant',
            content: [{ type: 'text', text: 'wrapped response' }],
          },
        })

        const instance = wrapAgent(fake as never)
        const result = await instance.prompt('test message')

        expect(result.output).toBe('wrapped response')
        expect(result.usage.inputTokens).toBe(100)
        expect(result.usage.outputTokens).toBe(50)
        expect(result.messages).toHaveLength(1)
      })
    })

    describe('#when abort is called', () => {
      it('#then delegates to agent.abort', () => {
        const fake = createFakeAgent()
        const instance = wrapAgent(fake as never)

        instance.abort()
        expect(fake._aborted).toBe(true)
      })
    })

    describe('#when on is called', () => {
      it('#then registers the listener on agent', () => {
        const fake = createFakeAgent()
        const instance = wrapAgent(fake as never)

        const listener = (() => {}) as AgentEventListener
        instance.on(listener)
        expect(fake._listener).toBe(listener)
      })
    })
  })
})

// ═══ Agent 工厂测试 — 结构验证 ═══

const DUMMY_MODEL = 'claude-sonnet-4-6' as Model
const DUMMY_TOOLS: AgentTool[] = []

describe('agent factories', () => {
  const factories = [
    { name: 'createCentralSecretariatAgent', fn: createCentralSecretariatAgent, defaultTurns: 50 },
    { name: 'createHephaestusAgent', fn: createHephaestusAgent, defaultTurns: 80 },
    { name: 'createExploreAgent', fn: createExploreAgent, defaultTurns: 30 },
    { name: 'createOracleAgent', fn: createOracleAgent, defaultTurns: 30 },
    { name: 'createLibrarianAgent', fn: createLibrarianAgent, defaultTurns: 20 },
    { name: 'createSisyphusJuniorAgent', fn: createSisyphusJuniorAgent, defaultTurns: 20 },
  ] as const

  for (const { name, fn } of factories) {
    describe(`#given ${name}`, () => {
      describe('#when called with model and tools', () => {
        it('#then returns an AgentInstance with prompt, abort, on methods', () => {
          const instance = fn(DUMMY_MODEL, DUMMY_TOOLS)
          expect(typeof instance.prompt).toBe('function')
          expect(typeof instance.abort).toBe('function')
          expect(typeof instance.on).toBe('function')
        })
      })

      describe('#when called with eventListener option', () => {
        it('#then does not throw', () => {
          const listener = (() => {}) as AgentEventListener
          expect(() => fn(DUMMY_MODEL, DUMMY_TOOLS, { eventListener: listener })).not.toThrow()
        })
      })

      describe('#when called with custom systemPrompt', () => {
        it('#then returns a valid AgentInstance', () => {
          const instance = fn(DUMMY_MODEL, DUMMY_TOOLS, { systemPrompt: 'Custom prompt' })
          expect(typeof instance.prompt).toBe('function')
        })
      })
    })
  }
})
