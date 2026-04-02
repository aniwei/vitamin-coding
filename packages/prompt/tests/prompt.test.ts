import { describe, it, expect, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import {
  LocalPromptProvider,
  PromptManager,
  PromptCache,
  createPromptProvider,
  buildLessonInjection,
  extractPhaseFromMessage,
  injectPhaseContext,
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
    const entry = await provider.load('lead-guidance/workflow-overview')
    expect(entry).not.toBeNull()
    expect(entry!.key).toBe('lead-guidance/workflow-overview')
    expect(entry!.content).toContain('lead agent')
    expect(entry!.version).toBeGreaterThan(0)
  })

  it('returns null for non-existent key', async () => {
    const entry = await provider.load('does-not-exist')
    expect(entry).toBeNull()
  })

  it('lists all available prompt keys', async () => {
    const keys = await provider.list()
    expect(keys).toContain('lead-guidance/workflow-overview')
    expect(keys).toContain('lead-guidance/phase-discipline')
    expect(keys).toContain('lead-guidance/complexity-routing')
    expect(keys).toContain('lead-guidance/review-guidance')
    expect(keys).toContain('lead-guidance/model-slot-guidance')
    expect(keys).toContain('lead-guidance/file-state-guidance')
    expect(keys).toContain('lesson/session-end-learning')
  })

  it('loadMany returns all requested entries', async () => {
    const keys = ['lead-guidance/workflow-overview', 'lead-guidance/phase-discipline']
    const entries = await provider.loadMany(keys)
    expect(entries.size).toBe(2)
    expect(entries.get('lead-guidance/workflow-overview')!.content).toContain('lead agent')
    expect(entries.get('lead-guidance/phase-discipline')!.content).toContain('Phase Discipline')
  })

  it('loadMany skips non-existent keys', async () => {
    const entries = await provider.loadMany(['lead-guidance/workflow-overview', 'nope'])
    expect(entries.size).toBe(1)
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

  it('assemble returns assembled sections', async () => {
    const result = await manager.assemble()
    expect(result).toContain('lead agent')
    expect(result).toContain('Phase Discipline')
    expect(result).toContain('Complexity Routing')
    expect(result).toContain('Review Guidance')
  })

  it('assembl respects section toggles', async () => {
    const result = await manager.assemble({
      workflowOverview: true,
      phaseDiscipline: false,
      complexityRouting: false,
      reviewGuidance: false,
      modelSlotGuidance: false,
      fileStateGuidance: false,
    })
    expect(result).toContain('lead agent')
    expect(result).not.toContain('Phase Discipline')
  })

  it('load returns a specific prompt', async () => {
    const content = await manager.load('lesson/session-end-learning')
    expect(content).toContain('learn')
  })

  it('list returns all keys', async () => {
    const keys = await manager.list()
    expect(keys.length).toBeGreaterThanOrEqual(7)
  })

  it('invalidate clears cache so next assemble re-loads', async () => {
    await manager.assemble()
    manager.invalidate()
    // second call should still work after invalidation
    const result = await manager.assemble()
    expect(result).toContain('lead agent')
  })
})

describe('createPromptProvider factory', () => {
  it('creates a local provider', () => {
    const provider = createPromptProvider({ type: 'local', baseDir: fixtureDir })
    expect(provider).toBeInstanceOf(LocalPromptProvider)
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
    expect(result).toContain('[Phase Context]')
    expect(result).toContain('Current: Execute')
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
    expect(result).toContain('Operational Lessons')
    expect(result).toContain('[ts]')
    expect(result).toContain('Use named exports')
  })

  it('returns empty string for empty lessons', () => {
    expect(buildLessonInjection([])).toBe('')
  })
})
