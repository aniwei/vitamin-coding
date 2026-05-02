import { describe, expect, it } from 'vitest'
import {
  buildSystemWithCache,
  buildSystemWithPromptCache,
  injectToolsCache,
  findMessageCacheIndex,
  injectMessageCache,
} from '../src/provider/anthropic'
import type Anthropic from '@anthropic-ai/sdk'

const CACHE = { type: 'ephemeral' as const }

describe('buildSystemWithCache', () => {
  it('wraps system prompt in TextBlockParam with cache_control', () => {
    const result = buildSystemWithCache('You are a helpful assistant.')
    expect(result).toEqual([
      {
        type: 'text',
        text: 'You are a helpful assistant.',
        cache_control: CACHE,
      },
    ])
  })

  it('uses one hour ttl for long retention', () => {
    const result = buildSystemWithCache('You are a helpful assistant.', 'long')
    expect(result[0]!.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
  })
})

describe('buildSystemWithPromptCache', () => {
  it('adds cache_control only to the static prefix block', () => {
    const result = buildSystemWithPromptCache({
      systemPrompt: 'static rules\n\ndynamic status',
      cacheRetention: 'short',
      promptCache: {
        staticPrefix: 'static rules',
        dynamicTail: 'dynamic status',
        fingerprint: 'prompt-fp',
        diagnostics: {
          sectionCount: 2,
          totalChars: 27,
          estimatedTokens: 7,
          sections: [
            {
              key: 'base',
              layer: 'static',
              cacheable: true,
              source: 'test',
              priority: 0,
              chars: 12,
              estimatedTokens: 3,
              fingerprint: 'base-fp',
            },
            {
              key: 'runtime',
              layer: 'dynamic',
              cacheable: false,
              source: 'test',
              priority: 10,
              chars: 14,
              estimatedTokens: 4,
              fingerprint: 'runtime-fp',
            },
          ],
        },
      },
    })

    expect(result).toEqual([
      {
        type: 'text',
        text: 'static rules',
        cache_control: CACHE,
      },
      {
        type: 'text',
        text: 'dynamic status',
      },
    ])
  })

  it('keeps legacy suffixes outside the cached static block', () => {
    const result = buildSystemWithPromptCache({
      systemPrompt: 'static rules\n\ndynamic status\n\nlegacy suffix',
      cacheRetention: 'long',
      promptCache: {
        staticPrefix: 'static rules',
        dynamicTail: 'dynamic status',
        fingerprint: 'prompt-fp',
        diagnostics: {
          sectionCount: 2,
          totalChars: 27,
          estimatedTokens: 7,
          sections: [],
        },
      },
    }) as Anthropic.TextBlockParam[]

    expect(result).toHaveLength(3)
    expect(result[0]!.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
    expect(result[1]).toEqual({ type: 'text', text: 'dynamic status' })
    expect(result[2]).toEqual({ type: 'text', text: 'legacy suffix' })
  })
})

describe('injectToolsCache', () => {
  it('adds cache_control to the last tool only', () => {
    const tools: Anthropic.Tool[] = [
      {
        name: 'read',
        description: 'Read a file',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'write',
        description: 'Write a file',
        input_schema: { type: 'object', properties: {} },
      },
    ]

    const result = injectToolsCache(tools)

    expect(result).toHaveLength(2)
    expect(result[0]).not.toHaveProperty('cache_control')
    expect(result[1]!.cache_control).toEqual(CACHE)
  })

  it('returns empty array unchanged', () => {
    const result = injectToolsCache([])
    expect(result).toEqual([])
  })

  it('handles single tool', () => {
    const tools: Anthropic.Tool[] = [
      {
        name: 'read',
        description: 'Read a file',
        input_schema: { type: 'object', properties: {} },
      },
    ]

    const result = injectToolsCache(tools)
    expect(result).toHaveLength(1)
    expect(result[0]!.cache_control).toEqual(CACHE)
  })

  it('does not mutate the original array', () => {
    const tools: Anthropic.Tool[] = [
      {
        name: 'read',
        description: 'Read a file',
        input_schema: { type: 'object', properties: {} },
      },
    ]

    injectToolsCache(tools)
    expect(tools[0]).not.toHaveProperty('cache_control')
  })

  it('uses one hour ttl for long retention', () => {
    const tools: Anthropic.Tool[] = [
      {
        name: 'read',
        description: 'Read a file',
        input_schema: { type: 'object', properties: {} },
      },
    ]

    const result = injectToolsCache(tools, 'long')
    expect(result[0]!.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
  })
})

describe('findMessageCacheIndex', () => {
  it('returns -1 for fewer than 3 messages', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    ]
    expect(findMessageCacheIndex(messages)).toBe(-1)
  })

  it('finds the last user message before the last 2 messages', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: [{ type: 'text', text: 'first question' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'first answer' }] },
      { role: 'user', content: [{ type: 'text', text: 'second question' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'second answer' }] },
      { role: 'user', content: [{ type: 'text', text: 'third question' }] },
    ]

    // messages.length - 3 = 2, scanning backwards from index 2
    // index 2 is user with array content → matches
    expect(findMessageCacheIndex(messages)).toBe(2)
  })

  it('finds user messages with string content', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'string content' },
      { role: 'assistant', content: [{ type: 'text', text: 'reply' }] },
      { role: 'user', content: [{ type: 'text', text: 'array content' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'reply 2' }] },
      { role: 'user', content: [{ type: 'text', text: 'latest' }] },
    ]

    expect(findMessageCacheIndex(messages)).toBe(2)
  })

  it('finds string-only user messages before threshold', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'string only' },
      { role: 'assistant', content: [{ type: 'text', text: 'reply' }] },
      { role: 'user', content: 'also string' },
      { role: 'assistant', content: [{ type: 'text', text: 'reply' }] },
      { role: 'user', content: 'string' },
    ]

    expect(findMessageCacheIndex(messages)).toBe(2)
  })
})

describe('injectMessageCache', () => {
  it('adds cache_control to last content block of the breakpoint message', () => {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'first' },
          { type: 'text', text: 'second' },
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'reply' }] },
      { role: 'user', content: [{ type: 'text', text: 'question' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'answer' }] },
      { role: 'user', content: [{ type: 'text', text: 'latest' }] },
    ]

    const result = injectMessageCache(messages)

    // Breakpoint is at index 2 (messages.length - 3 = 2, user with array content)
    const breakpoint = result[2]!
    expect(breakpoint.role).toBe('user')
    expect(Array.isArray(breakpoint.content)).toBe(true)
    const content = breakpoint.content as Anthropic.TextBlockParam[]
    expect(content[0]!.cache_control).toEqual(CACHE)
  })

  it('returns original messages when too few messages', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    ]

    const result = injectMessageCache(messages)
    expect(result).toBe(messages)
  })

  it('does not mutate the original messages', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: [{ type: 'text', text: 'first' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'reply' }] },
      { role: 'user', content: [{ type: 'text', text: 'question' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'answer' }] },
      { role: 'user', content: [{ type: 'text', text: 'latest' }] },
    ]

    injectMessageCache(messages)

    // Original should be untouched
    const original = messages[2]!
    const content = original.content as Anthropic.TextBlockParam[]
    expect(content[0]).not.toHaveProperty('cache_control')
  })

  it('converts string user content to a cached text block', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: [{ type: 'text', text: 'reply' }] },
      { role: 'user', content: 'question' },
      { role: 'assistant', content: [{ type: 'text', text: 'answer' }] },
      { role: 'user', content: [{ type: 'text', text: 'latest' }] },
    ]

    const result = injectMessageCache(messages, 'long')
    const breakpoint = result[2]!
    expect(Array.isArray(breakpoint.content)).toBe(true)
    const content = breakpoint.content as Anthropic.TextBlockParam[]
    expect(content[0]).toEqual({
      type: 'text',
      text: 'question',
      cache_control: { type: 'ephemeral', ttl: '1h' },
    })
    expect(messages[2]!.content).toBe('question')
  })
})
