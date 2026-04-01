import { describe, expect, it } from 'vitest'

import {
  createCopilotProvider,
  inferCopilotInitiator,
  hasCopilotVisionInput,
  buildCopilotDynamicHeaders,
} from '../src/provider/github-copilot'

import type {
  AssistantMessage,
  Message,
  Model,
  ToolResultMessage,
  UserMessage,
} from '../src/types'

function makeModel(): Model {
  return {
    id: 'github-copilot/gpt-4.1',
    name: 'gpt-4.1',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: 'https://api.githubcopilot.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxOutputTokens: 4096,
  }
}

function makeUserMessage(content: UserMessage['content']): UserMessage {
  return {
    role: 'user',
    content,
    timestamp: Date.now(),
  }
}

function makeAssistantMessage(content: AssistantMessage['content']): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'github-copilot',
    provider: 'github-copilot',
    model: 'github-copilot/gpt-4.1',
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    stopReason: 'end_turn',
  }
}

function makeToolResultMessage(content: ToolResultMessage['content']): ToolResultMessage {
  return {
    role: 'tool_result',
    toolCallId: 'tc1',
    toolName: 'read_file',
    content,
    details: null,
    isError: false,
    timestamp: Date.now(),
  }
}

describe('GitHub Copilot Provider', () => {
  it('resolveKey uses resolveOAuthAccessKey when provided', async () => {
    const provider = createCopilotProvider({
      resolveOAuthAccessKey: async () => 'oauth-token',
    })

    const key = await provider.resolveKey?.(makeModel())
    expect(key).toBe('oauth-token')
  })

  it('exposes provider identity and converse function', () => {
    const provider = createCopilotProvider()
    expect(provider.id).toBe('github-copilot')
    expect(provider.displayName).toBe('GitHub Copilot')
    expect(typeof provider.converse).toBe('function')
  })

  it('resolveKey is available', async () => {
    const provider = createCopilotProvider()
    expect(typeof provider.resolveKey).toBe('function')
  })

  it('resolveKey throws when resolver returns undefined', async () => {
    const provider = createCopilotProvider({
      resolveOAuthAccessKey: async () => undefined,
    })

    await expect(provider.resolveKey?.(makeModel())).rejects.toThrow('Missing GitHub Copilot token')
  })

  it('resolveKey throws when env and oauth are both unavailable', async () => {
    const provider = createCopilotProvider()
    await expect(provider.resolveKey?.(makeModel())).rejects.toThrow('Missing GitHub Copilot token')
  })
})

describe('inferCopilotInitiator', () => {
  it('returns "user" when last message is from user', () => {
    const messages: Message[] = [makeUserMessage('hello')]
    expect(inferCopilotInitiator(messages)).toBe('user')
  })

  it('returns "agent" when last message is from assistant', () => {
    const messages: Message[] = [
      makeUserMessage('hello'),
      makeAssistantMessage([{ type: 'text', text: 'hi' }]),
    ]
    expect(inferCopilotInitiator(messages)).toBe('agent')
  })

  it('returns "agent" when last message is tool_result', () => {
    const messages: Message[] = [makeToolResultMessage([{ type: 'text', text: 'result' }])]
    expect(inferCopilotInitiator(messages)).toBe('agent')
  })

  it('returns "user" for empty messages', () => {
    expect(inferCopilotInitiator([])).toBe('user')
  })
})

describe('hasCopilotVisionInput', () => {
  it('returns false when no images', () => {
    const messages: Message[] = [makeUserMessage('hello')]
    expect(hasCopilotVisionInput(messages)).toBe(false)
  })

  it('returns true when user message has image content', () => {
    const messages: Message[] = [
      makeUserMessage([
        { type: 'text', text: 'describe this' },
        { type: 'image', source: 'base64data', mime: 'image/png' },
      ]),
    ]
    expect(hasCopilotVisionInput(messages)).toBe(true)
  })

  it('returns true when tool_result has image content', () => {
    const messages: Message[] = [
      makeToolResultMessage([{ type: 'image', source: 'base64data', mime: 'image/png' }]),
    ]
    expect(hasCopilotVisionInput(messages)).toBe(true)
  })
})

describe('buildCopilotDynamicHeaders', () => {
  it('sets X-Initiator and Openai-Intent', () => {
    const messages: Message[] = [makeUserMessage('hello')]
    const headers = buildCopilotDynamicHeaders({ messages, hasImages: false })
    expect(headers['X-Initiator']).toBe('user')
    expect(headers['Openai-Intent']).toBe('conversation-edits')
    expect(headers['Copilot-Vision-Request']).toBeUndefined()
  })

  it('includes Copilot-Vision-Request when hasImages is true', () => {
    const messages: Message[] = [
      makeUserMessage([{ type: 'image', source: 'base64data', mime: 'image/png' }]),
    ]
    const headers = buildCopilotDynamicHeaders({ messages, hasImages: true })
    expect(headers['Copilot-Vision-Request']).toBe('true')
    expect(headers['X-Initiator']).toBe('user')
  })

  it('does not include Copilot-Vision-Request when hasImages is false even with image content', () => {
    const messages: Message[] = [
      makeUserMessage([{ type: 'image', source: 'base64data', mime: 'image/png' }]),
    ]
    const headers = buildCopilotDynamicHeaders({ messages, hasImages: false })
    expect(headers['Copilot-Vision-Request']).toBeUndefined()
  })
})
