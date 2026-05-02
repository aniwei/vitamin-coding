import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/create-app'
import type { CodingService } from '../src/coding-service'

function makeDiagnostics(includePrompt = false) {
  return {
    sessionId: 's1',
    model: 'openai/test',
    provider: 'openai',
    status: 'idle',
    messageCount: 2,
    prompt: {
      sectionCount: 1,
      totalChars: 13,
      estimatedTokens: 4,
      staticPrefixChars: 13,
      dynamicTailChars: 0,
      cacheableSectionCount: 1,
      dynamicSectionCount: 0,
      fingerprint: 'prompt-fp',
      toolSchemaFingerprint: 'tool-fp',
      sections: [
        {
          key: 'system-prompt',
          layer: 'static',
          cacheable: true,
          source: 'session',
          priority: 0,
          chars: 13,
          estimatedTokens: 4,
          fingerprint: 'section-fp',
        },
      ],
      ...(includePrompt ? { content: 'secret prompt' } : {}),
    },
    tools: {
      count: 0,
      deferredCount: 0,
      visibleCount: 0,
      items: [],
    },
    runtime: {
      workspaceDir: '/workspace',
      agentName: 'main',
      promptCacheAvailable: true,
      promptContentIncluded: includePrompt,
    },
  }
}

describe('sessions route context diagnostics', () => {
  it('returns session context diagnostics without prompt content by default', async () => {
    const getContextDiagnostics = vi.fn(() => makeDiagnostics(false))
    const app = createApp({
      vitamin: { workspaceDir: '/workspace', listSessions: () => [] },
      getSession: (id: string) => (id === 's1' ? { id: 's1', getContextDiagnostics } : undefined),
      getActiveSession: () => undefined,
    } as unknown as CodingService)

    const response = await app.request('/api/sessions/s1/context')

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.prompt.content).toBeUndefined()
    expect(body.prompt.sections[0]).toMatchObject({ key: 'system-prompt', cacheable: true })
    expect(getContextDiagnostics).toHaveBeenCalledWith({ includePrompt: false })
  })

  it('returns prompt content only when explicitly requested', async () => {
    const getContextDiagnostics = vi.fn((options: { includePrompt?: boolean }) =>
      makeDiagnostics(options.includePrompt === true),
    )
    const app = createApp({
      vitamin: { workspaceDir: '/workspace', listSessions: () => [] },
      getSession: () => undefined,
      getActiveSession: () => ({ id: 's1', getContextDiagnostics }),
    } as unknown as CodingService)

    const response = await app.request('/api/sessions/current/context?includePrompt=true')

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.prompt.content).toBe('secret prompt')
    expect(body.runtime.promptContentIncluded).toBe(true)
    expect(getContextDiagnostics).toHaveBeenCalledWith({ includePrompt: true })
  })

  it('returns 404 for missing context session', async () => {
    const app = createApp({
      vitamin: { workspaceDir: '/workspace', listSessions: () => [] },
      getSession: () => undefined,
      getActiveSession: () => undefined,
    } as unknown as CodingService)

    const response = await app.request('/api/sessions/missing/context')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ status: 'error', message: 'session not found' })
  })
})
