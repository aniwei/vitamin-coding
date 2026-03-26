import { describe, expect, it } from 'vitest'

import {
  createCopilotProvider,
  inferCopilotInitiator,
  hasCopilotVisionInput,
  buildCopilotDynamicHeaders,
} from '../src/provider/github-copilot'

import type { Message, Model } from '../src/types'

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

describe('GitHub Copilot Provider', () => {
  it('resolveKey reads COPILOT_GITHUB_TOKEN from env', async () => {
    const provider = createCopilotProvider()
    const oldCopilot = process.env['COPILOT_GITHUB_TOKEN']
    const oldGh = process.env['GH_TOKEN']
    const oldGithub = process.env['GITHUB_TOKEN']

    process.env['COPILOT_GITHUB_TOKEN'] = 'copilot-token'
    delete process.env['GH_TOKEN']
    delete process.env['GITHUB_TOKEN']

    try {
      const key = await provider.resolveKey?.(makeModel())
      expect(key).toBe('copilot-token')
    } finally {
      if (oldCopilot === undefined) delete process.env['COPILOT_GITHUB_TOKEN']
      else process.env['COPILOT_GITHUB_TOKEN'] = oldCopilot

      if (oldGh === undefined) delete process.env['GH_TOKEN']
      else process.env['GH_TOKEN'] = oldGh

      if (oldGithub === undefined) delete process.env['GITHUB_TOKEN']
      else process.env['GITHUB_TOKEN'] = oldGithub
    }
  })

  it('resolveKey falls back from COPILOT_GITHUB_TOKEN to GH_TOKEN to GITHUB_TOKEN', async () => {
    const provider = createCopilotProvider()
    const oldCopilot = process.env['COPILOT_GITHUB_TOKEN']
    const oldGh = process.env['GH_TOKEN']
    const oldGithub = process.env['GITHUB_TOKEN']

    delete process.env['COPILOT_GITHUB_TOKEN']
    process.env['GH_TOKEN'] = 'gh-token'
    process.env['GITHUB_TOKEN'] = 'github-token'

    try {
      const key = await provider.resolveKey?.(makeModel())
      expect(key).toBe('gh-token')
    } finally {
      if (oldCopilot === undefined) delete process.env['COPILOT_GITHUB_TOKEN']
      else process.env['COPILOT_GITHUB_TOKEN'] = oldCopilot

      if (oldGh === undefined) delete process.env['GH_TOKEN']
      else process.env['GH_TOKEN'] = oldGh

      if (oldGithub === undefined) delete process.env['GITHUB_TOKEN']
      else process.env['GITHUB_TOKEN'] = oldGithub
    }
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

  it('resolveKey falls back to resolveOAuthKey when env token is missing', async () => {
    const oldCopilot = process.env['COPILOT_GITHUB_TOKEN']
    const oldGh = process.env['GH_TOKEN']
    const oldGithub = process.env['GITHUB_TOKEN']

    delete process.env['COPILOT_GITHUB_TOKEN']
    delete process.env['GH_TOKEN']
    delete process.env['GITHUB_TOKEN']

    const provider = createCopilotProvider({
      resolveOAuthKey: async () => 'oauth-token',
    })

    try {
      const key = await provider.resolveKey?.(makeModel())
      expect(key).toBe('oauth-token')
    } finally {
      if (oldCopilot === undefined) delete process.env['COPILOT_GITHUB_TOKEN']
      else process.env['COPILOT_GITHUB_TOKEN'] = oldCopilot

      if (oldGh === undefined) delete process.env['GH_TOKEN']
      else process.env['GH_TOKEN'] = oldGh

      if (oldGithub === undefined) delete process.env['GITHUB_TOKEN']
      else process.env['GITHUB_TOKEN'] = oldGithub
    }
  })

  it('resolveKey throws when env and oauth are both unavailable', async () => {
    const oldCopilot = process.env['COPILOT_GITHUB_TOKEN']
    const oldGh = process.env['GH_TOKEN']
    const oldGithub = process.env['GITHUB_TOKEN']

    delete process.env['COPILOT_GITHUB_TOKEN']
    delete process.env['GH_TOKEN']
    delete process.env['GITHUB_TOKEN']

    try {
      const provider = createCopilotProvider()
      await expect(provider.resolveKey?.(makeModel())).rejects.toThrow('Missing GitHub Copilot token')
    } finally {
      if (oldCopilot === undefined) delete process.env['COPILOT_GITHUB_TOKEN']
      else process.env['COPILOT_GITHUB_TOKEN'] = oldCopilot

      if (oldGh === undefined) delete process.env['GH_TOKEN']
      else process.env['GH_TOKEN'] = oldGh

      if (oldGithub === undefined) delete process.env['GITHUB_TOKEN']
      else process.env['GITHUB_TOKEN'] = oldGithub
    }
  })
})

describe('inferCopilotInitiator', () => {
  it('returns "user" when last message is from user', () => {
    const messages: Message[] = [
      { role: 'user', content: 'hello' },
    ]
    expect(inferCopilotInitiator(messages)).toBe('user')
  })

  it('returns "agent" when last message is from assistant', () => {
    const messages: Message[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
    ]
    expect(inferCopilotInitiator(messages)).toBe('agent')
  })

  it('returns "agent" when last message is tool_result', () => {
    const messages: Message[] = [
      { role: 'tool_result', toolCallId: 'tc1', content: [{ type: 'text', text: 'result' }] },
    ]
    expect(inferCopilotInitiator(messages)).toBe('agent')
  })

  it('returns "user" for empty messages', () => {
    expect(inferCopilotInitiator([])).toBe('user')
  })
})

describe('hasCopilotVisionInput', () => {
  it('returns false when no images', () => {
    const messages: Message[] = [
      { role: 'user', content: 'hello' },
    ]
    expect(hasCopilotVisionInput(messages)).toBe(false)
  })

  it('returns true when user message has image content', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe this' },
          { type: 'image', source: 'base64data', mime: 'image/png' },
        ],
      },
    ]
    expect(hasCopilotVisionInput(messages)).toBe(true)
  })

  it('returns true when tool_result has image content', () => {
    const messages: Message[] = [
      {
        role: 'tool_result',
        toolCallId: 'tc1',
        content: [
          { type: 'image', source: 'base64data', mime: 'image/png' },
        ],
      },
    ]
    expect(hasCopilotVisionInput(messages)).toBe(true)
  })
})

describe('buildCopilotDynamicHeaders', () => {
  it('sets X-Initiator and Openai-Intent', () => {
    const messages: Message[] = [
      { role: 'user', content: 'hello' },
    ]
    const headers = buildCopilotDynamicHeaders({ messages, hasImages: false })
    expect(headers['X-Initiator']).toBe('user')
    expect(headers['Openai-Intent']).toBe('conversation-edits')
    expect(headers['Copilot-Vision-Request']).toBeUndefined()
  })

  it('includes Copilot-Vision-Request when hasImages is true', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'image', source: 'base64data', mime: 'image/png' },
        ],
      },
    ]
    const headers = buildCopilotDynamicHeaders({ messages, hasImages: true })
    expect(headers['Copilot-Vision-Request']).toBe('true')
    expect(headers['X-Initiator']).toBe('user')
  })

  it('does not include Copilot-Vision-Request when hasImages is false even with image content', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'image', source: 'base64data', mime: 'image/png' },
        ],
      },
    ]
    const headers = buildCopilotDynamicHeaders({ messages, hasImages: false })
    expect(headers['Copilot-Vision-Request']).toBeUndefined()
  })
})
