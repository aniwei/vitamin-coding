import { describe, it, expect, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import {
  LocalPromptProvider,
  RemotePromptProvider,
  PromptManager,
  PromptCache,
  createPromptProvider,
  assembleGenericSubAgentPrompt,
  assembleSubAgentPrompt,
  buildLessonInjection,
  extractPhaseFromMessage,
  injectPhaseContext,
  resolveAgentProfile,
  resolveAgentToolNames,
  BUILTIN_PROMPTS_DIR,
} from '../src/index'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtureDir = resolve(__dirname, '..', 'prompts')

describe('LocalPromptProvider', () => {
  let provider: LocalPromptProvider

  beforeEach(() => {
    provider = new LocalPromptProvider({ baseDir: fixtureDir })
  })

  it('loads an existing prompt by key', async () => {
    const entry = await provider.load('lead-guidance')
    expect(entry).not.toBeNull()
    expect(entry!.key).toBe('lead-guidance')
    expect(entry!.content).toContain('身份与环境')
    expect(entry!.content).toContain('工作流程引导')
    expect(entry!.version).toBeGreaterThan(0)
  })

  it('returns null for non-existent key', async () => {
    const entry = await provider.load('does-not-exist')
    expect(entry).toBeNull()
  })

  it('lists all available prompt keys', async () => {
    const keys = await provider.list()
    expect(keys).toContain('lead-guidance')
    expect(keys).toContain('lesson/session-end-learning')
  })

  it('loadMany returns all requested entries', async () => {
    const keys = ['lead-guidance', 'lesson/session-end-learning']
    const entries = await provider.loadMany(keys)
    expect(entries.size).toBe(2)
    expect(entries.get('lead-guidance')!.content).toContain('身份与环境')
    expect(entries.get('lesson/session-end-learning')!.content).toContain('learn')
  })

  it('loadMany skips non-existent keys', async () => {
    const entries = await provider.loadMany(['lead-guidance', 'nope'])
    expect(entries.size).toBe(1)
  })
})

describe('RemotePromptProvider', () => {
  function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
    if (!headers) return {}
    if (headers instanceof Headers) {
      return Object.fromEntries(headers.entries())
    }
    if (Array.isArray(headers)) {
      return Object.fromEntries(headers)
    }
    return { ...headers }
  }

  it('supports list/load/loadMany with auth and custom headers', async () => {
    const calls: Array<{ method: string; url: string; headers: Record<string, string> }> = []
    const entries = new Map([
      ['lead-guidance', { key: 'lead-guidance', content: '远程引导', version: 1 }],
      ['lesson/session-end-learning', { key: 'lesson/session-end-learning', content: '远程学习', version: 1 }],
    ])

    const fetchImpl: typeof globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      const headers = normalizeHeaders(init?.headers)
      calls.push({ method, url, headers })

      const pathname = new URL(url).pathname
      if (pathname === '/prompts' && method === 'GET') {
        return new Response(JSON.stringify(Array.from(entries.keys())), { status: 200 })
      }

      if (pathname.startsWith('/prompts/') && pathname !== '/prompts/batch' && method === 'GET') {
        const key = decodeURIComponent(pathname.replace('/prompts/', ''))
        const entry = entries.get(key)
        if (!entry) {
          return new Response('', { status: 404 })
        }
        return new Response(JSON.stringify(entry), { status: 200 })
      }

      if (pathname === '/prompts/batch' && method === 'POST') {
        const body = JSON.parse((init?.body as string) ?? '{}') as { keys?: string[] }
        const items = (body.keys ?? []).map((key) => entries.get(key)).filter((entry) => entry !== undefined)
        return new Response(JSON.stringify(items), { status: 200 })
      }

      return new Response('', { status: 404 })
    }

    const provider = new RemotePromptProvider({
      baseUrl: 'https://prompt.api',
      getAuth: async () => ({ token: 'secret-token' }),
      getHeaders: async () => ({ 'X-Debug': 'on' }),
      fetch: fetchImpl,
    })

    const keys = await provider.list()
    expect(keys).toEqual(['lead-guidance', 'lesson/session-end-learning'])

    const guidance = await provider.load('lead-guidance')
    expect(guidance?.content).toBe('远程引导')

    const loaded = await provider.loadMany(['lead-guidance', 'lesson/session-end-learning'])
    expect(loaded.size).toBe(2)
    expect(loaded.get('lesson/session-end-learning')?.content).toBe('远程学习')

    expect(calls.length).toBe(3)
    expect(calls[0]?.headers['Authorization']).toBe('Bearer secret-token')
    expect(calls[0]?.headers['X-Debug']).toBe('on')
  })

  it('falls back to per-key load when batch endpoint fails', async () => {
    const calls: Array<{ method: string; pathname: string }> = []
    const entries = new Map([
      ['lead-guidance', { key: 'lead-guidance', content: 'fallback-1', version: 1 }],
      ['lesson/session-end-learning', { key: 'lesson/session-end-learning', content: 'fallback-2', version: 1 }],
    ])

    const fetchImpl: typeof globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      const pathname = new URL(url).pathname
      calls.push({ method, pathname })

      if (pathname === '/prompts/batch' && method === 'POST') {
        return new Response('batch failed', { status: 500 })
      }

      if (pathname.startsWith('/prompts/') && method === 'GET') {
        const key = decodeURIComponent(pathname.replace('/prompts/', ''))
        const entry = entries.get(key)
        if (!entry) return new Response('', { status: 404 })
        return new Response(JSON.stringify(entry), { status: 200 })
      }

      return new Response('', { status: 404 })
    }

    const provider = new RemotePromptProvider({
      baseUrl: 'https://prompt.api',
      fetch: fetchImpl,
    })

    const loaded = await provider.loadMany(['lead-guidance', 'lesson/session-end-learning'])
    expect(loaded.size).toBe(2)
    expect(loaded.get('lead-guidance')?.content).toBe('fallback-1')
    expect(loaded.get('lesson/session-end-learning')?.content).toBe('fallback-2')

    expect(calls).toEqual([
      { method: 'POST', pathname: '/prompts/batch' },
      { method: 'GET', pathname: '/prompts/lead-guidance' },
      { method: 'GET', pathname: '/prompts/lesson%2Fsession-end-learning' },
    ])
  })
})

describe('PromptCache', () => {
  let cache: PromptCache

  beforeEach(() => {
    cache = new PromptCache()
  })

  it('set/get round-trips', () => {
    cache.set('a', 'hello', 1)
    expect(cache.get('a')).toBe('hello')
    expect(cache.has('a')).toBe(true)
    expect(cache.getVersion('a')).toBe(1)
  })

  it('assemble joins base + sections', () => {
    cache.set('x', 'section-x')
    cache.set('y', 'section-y')
    const result = cache.assemble('base')
    expect(result).toBe('base\n\nsection-x\n\nsection-y')
  })

  it('delete removes entry and invalidates cache', () => {
    cache.set('a', 'val')
    cache.assemble('base')
    cache.delete('a')
    expect(cache.has('a')).toBe(false)
  })

  it('clear resets everything', () => {
    cache.set('a', 'val')
    cache.clear()
    expect(cache.has('a')).toBe(false)
  })
})

describe('PromptManager', () => {
  let manager: PromptManager

  beforeEach(() => {
    const provider = new LocalPromptProvider({ baseDir: fixtureDir })
    manager = new PromptManager({ provider })
  })

  it('assemble returns full lead guidance', async () => {
    const result = await manager.assemble()
    expect(result).toContain('身份与环境')
    expect(result).toContain('工作流程引导')
    expect(result).toContain('阶段纪律')
    expect(result).toContain('复杂度路由')
    expect(result).toContain('审查指引')
  })

  it('load returns a specific prompt', async () => {
    const content = await manager.load('lesson/session-end-learning')
    expect(content).toContain('learn')
  })

  it('list returns all keys', async () => {
    const keys = await manager.list()
    expect(keys.length).toBeGreaterThanOrEqual(2)
  })

  it('invalidate clears cache so next assemble re-loads', async () => {
    await manager.assemble()
    manager.invalidate()
    // second call should still work after invalidation
    const result = await manager.assemble()
    expect(result).toContain('工作流程引导')
  })

  it('assemblePreset supports subagent preset with profile', async () => {
    const result = await manager.assemblePreset({
      preset: 'subagent',
      agentName: 'reviewer',
      profile: {
        name: 'reviewer',
        taskTypes: ['review'],
        capabilities: ['review'],
        systemPromptTemplate: '你是审查子代理。任务：{task_title}。文件：{task_files}',
      },
      context: {
        taskTitle: '检查登录流程',
        taskFiles: ['src/auth.ts'],
      },
    })

    expect(result).toContain('你是审查子代理')
    expect(result).toContain('检查登录流程')
    expect(result).toContain('src/auth.ts')
  })

  it('assemblePreset supports generic subagent preset fallback', async () => {
    const result = await manager.assemblePreset({
      preset: 'subagent',
      agentName: 'custom-worker',
      context: {
        taskTitle: '扫描代码库',
      },
    })

    expect(result).toContain('custom-worker')
    expect(result).toContain('扫描代码库')
  })
})

describe('createPromptProvider factory', () => {
  it('creates a local provider', () => {
    const provider = createPromptProvider({ type: 'local', baseDir: fixtureDir })
    expect(provider).toBeInstanceOf(LocalPromptProvider)
  })

  it('creates a remote provider', () => {
    const provider = createPromptProvider({ type: 'remote', baseUrl: 'https://prompt.api' })
    expect(provider).toBeInstanceOf(RemotePromptProvider)
  })

  it('throws on unknown type', () => {
    expect(() => createPromptProvider({ type: 'unknown' } as any)).toThrow('Unknown prompt provider type')
  })
})

describe('BUILTIN_PROMPTS_DIR', () => {
  it('points to the prompts directory', () => {
    expect(BUILTIN_PROMPTS_DIR).toContain('prompts')
  })
})

describe('phase-context helpers', () => {
  it('injectPhaseContext adds phase info to prompt', () => {
    const result = injectPhaseContext('base prompt', {
      currentPhase: 'Execute',
      phaseHistory: ['Clarify', 'Plan', 'Execute'],
    })
    expect(result).toContain('[阶段上下文]')
    expect(result).toContain('当前阶段：Execute')
    expect(result).toContain('Clarify → Plan → Execute')
  })

  it('extractPhaseFromMessage extracts phase tag', () => {
    expect(extractPhaseFromMessage('Starting work [Phase: Execute] now')).toBe('Execute')
    expect(extractPhaseFromMessage('No phase here')).toBeNull()
  })
})

describe('lesson-injection', () => {
  it('buildLessonInjection formats lessons', () => {
    const result = buildLessonInjection([
      { tags: ['ts'], trigger: 'When importing', insight: 'Use named exports' },
    ])
    expect(result).toContain('运行经验')
    expect(result).toContain('[ts]')
    expect(result).toContain('Use named exports')
  })

  it('returns empty string for empty lessons', () => {
    expect(buildLessonInjection([])).toBe('')
  })
})

describe('sub-agent prompt helpers', () => {
  it('assembleSubAgentPrompt replaces placeholders with chinese fallbacks', () => {
    const result = assembleSubAgentPrompt({
      name: 'coder',
      taskTypes: ['code_generation'],
      capabilities: ['code'],
      systemPromptTemplate: '任务：{task_title}\n文件：{task_files}',
    })

    expect(result).toContain('未提供')
  })

  it('assembleGenericSubAgentPrompt builds a generic worker prompt', () => {
    const result = assembleGenericSubAgentPrompt('worker-a', { taskTitle: '实现接口' })
    expect(result).toContain('worker-a')
    expect(result).toContain('实现接口')
  })

  it('resolveAgentProfile matches reviewer aliases', () => {
    const profile = resolveAgentProfile([
      {
        name: 'reviewer',
        taskTypes: ['review'],
        capabilities: ['review', 'audit'],
        systemPromptTemplate: 'x',
      },
    ], 'quality-reviewer')

    expect(profile?.name).toBe('reviewer')
  })

  it('resolveAgentToolNames expands profile aliases', () => {
    expect(resolveAgentToolNames(['file_read', 'search', 'shell'])).toEqual([
      'read',
      'ls',
      'find',
      'grep',
      'bash',
    ])
  })
})
