// types.ts + agent-metadata.ts 单元测试
import { describe, expect, it } from 'vitest'

import { isPlanFamily, PLAN_FAMILY } from '../src/types'
import {
  AGENT_MODEL_PRIORITY,
  AGENT_TOOL_RESTRICTIONS,
  AGENT_METADATA,
} from '../src/registry/agent-metadata'

describe('isPlanFamily', () => {
  describe('#given Plan Family agent names', () => {
    describe('#when checking each member', () => {
      it('#then returns true for prometheus', () => {
        expect(isPlanFamily('prometheus')).toBe(true)
      })

      it('#then returns true for atlas', () => {
        expect(isPlanFamily('atlas')).toBe(true)
      })

      it('#then returns true for momus', () => {
        expect(isPlanFamily('momus')).toBe(true)
      })

      it('#then returns true for metis', () => {
        expect(isPlanFamily('metis')).toBe(true)
      })
    })
  })

  describe('#given non Plan Family agent names', () => {
    describe('#when checking', () => {
      it('#then returns false for sisyphus', () => {
        expect(isPlanFamily('central-secretariat')).toBe(false)
      })

      it('#then returns false for hephaestus', () => {
        expect(isPlanFamily('hephaestus')).toBe(false)
      })

      it('#then returns false for explore', () => {
        expect(isPlanFamily('explore')).toBe(false)
      })

      it('#then returns false for unknown', () => {
        expect(isPlanFamily('nonexistent')).toBe(false)
      })
    })
  })
})

describe('PLAN_FAMILY', () => {
  it('#then has exactly 4 members', () => {
    expect(PLAN_FAMILY).toHaveLength(4)
  })
})

describe('AGENT_MODEL_PRIORITY', () => {
  describe('#given model priority map', () => {
    describe('#when checking required agents', () => {
      it('#then sisyphus has fallback chain', () => {
        expect(AGENT_MODEL_PRIORITY.sisyphus).toBeDefined()
        expect(AGENT_MODEL_PRIORITY.sisyphus.length).toBeGreaterThan(0)
      })

      it('#then explore has fallback chain', () => {
        expect(AGENT_MODEL_PRIORITY.explore).toBeDefined()
        expect(AGENT_MODEL_PRIORITY.explore.length).toBeGreaterThan(0)
      })
    })
  })
})

describe('AGENT_TOOL_RESTRICTIONS', () => {
  describe('#given tool restrictions', () => {
    describe('#when checking explore agent', () => {
      it('#then only allows read-only tools', () => {
        const restrictions = AGENT_TOOL_RESTRICTIONS.explore
        expect(restrictions).toBeDefined()
        expect(restrictions.allowed).toContain('read')
        expect(restrictions.allowed).toContain('grep')
        expect(restrictions.allowed).not.toContain('write')
        expect(restrictions.allowed).not.toContain('bash')
      })
    })

    describe('#when checking oracle agent', () => {
      it('#then only allows read-only tools', () => {
        const restrictions = AGENT_TOOL_RESTRICTIONS.oracle
        expect(restrictions).toBeDefined()
        expect(restrictions.allowed).toContain('read')
        expect(restrictions.allowed).not.toContain('edit')
      })
    })

    describe('#when checking atlas agent', () => {
      it('#then denies write tools', () => {
        const restrictions = AGENT_TOOL_RESTRICTIONS.atlas
        expect(restrictions).toBeDefined()
        expect(restrictions.denied).toContain('write')
        expect(restrictions.denied).toContain('bash')
      })
    })
  })
})

describe('AGENT_METADATA', () => {
  describe('#given metadata map', () => {
    describe('#when checking required agents', () => {
      it('#then has metadata for 6 core agents', () => {
        const requiredAgents = ['central-secretariat', 'hephaestus', 'explore', 'oracle', 'librarian', 'sisyphus-junior']
        for (const name of requiredAgents) {
          expect(AGENT_METADATA[name]).toBeDefined()
          expect(AGENT_METADATA[name].category).toBeDefined()
          expect(AGENT_METADATA[name].cost).toBeDefined()
        }
      })
    })
  })
})
