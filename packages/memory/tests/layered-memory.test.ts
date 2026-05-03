import { describe, expect, it } from 'vitest'
import {
  parseFrontmatter,
  serializeEntry,
  buildIndexContent,
  filterMemoryByScope,
  detectMemoryConflicts,
  mergeMemoryEntries,
  InMemoryLayeredStore,
} from '../src/layered-memory'
import type { MemoryEntry } from '../src/types'

const sampleEntry: MemoryEntry = {
  name: 'user_role',
  description: 'User is a senior full-stack engineer',
  type: 'user',
  content: 'The user is a senior full-stack engineer with 10 years of experience.',
  filename: 'user_user_role.md',
}

describe('parseFrontmatter', () => {
  describe('#given valid frontmatter', () => {
    it('#then parses name, description, type, and content', () => {
      const raw = `---
name: user_role
description: User is a senior engineer
type: user
scope: team
team: platform
---

The user is a senior engineer.`

      const result = parseFrontmatter(raw)
      expect(result).not.toBeNull()
      expect(result!.meta.name).toBe('user_role')
      expect(result!.meta.description).toBe('User is a senior engineer')
      expect(result!.meta.type).toBe('user')
      expect(result!.meta.scope).toBe('team')
      expect(result!.meta.team).toBe('platform')
      expect(result!.content).toBe('The user is a senior engineer.')
    })
  })

  describe('#given all four valid types', () => {
    it.each(['user', 'feedback', 'project', 'reference'] as const)(
      '#then accepts type "%s"',
      (type) => {
        const raw = `---
name: test
description: test desc
type: ${type}
---

content`
        const result = parseFrontmatter(raw)
        expect(result).not.toBeNull()
        expect(result!.meta.type).toBe(type)
      },
    )
  })

  describe('#given invalid type', () => {
    it('#then returns null', () => {
      const raw = `---
name: test
description: test desc
type: invalid
---

content`
      expect(parseFrontmatter(raw)).toBeNull()
    })
  })

  describe('#given missing fields', () => {
    it('#then returns null for missing name', () => {
      const raw = `---
description: test
type: user
---

content`
      expect(parseFrontmatter(raw)).toBeNull()
    })

    it('#then returns null for missing type', () => {
      const raw = `---
name: test
description: test
---

content`
      expect(parseFrontmatter(raw)).toBeNull()
    })
  })

  describe('#given no frontmatter', () => {
    it('#then returns null', () => {
      expect(parseFrontmatter('just plain text')).toBeNull()
    })
  })
})

describe('serializeEntry', () => {
  describe('#given a MemoryEntry', () => {
    it('#then produces valid frontmatter format', () => {
      const serialized = serializeEntry(sampleEntry)
      expect(serialized).toContain('---')
      expect(serialized).toContain('name: user_role')
      expect(serialized).toContain('type: user')

      const reparsed = parseFrontmatter(serialized)
      expect(reparsed).not.toBeNull()
      expect(reparsed!.meta.name).toBe(sampleEntry.name)
      expect(reparsed!.content).toBe(sampleEntry.content)
    })
  })

  describe('#given scoped entry metadata', () => {
    it('#then serializes scope and team frontmatter', () => {
      const serialized = serializeEntry({
        ...sampleEntry,
        scope: 'team',
        team: 'platform',
      })

      expect(serialized).toContain('scope: team')
      expect(serialized).toContain('team: platform')
    })
  })
})

describe('buildIndexContent', () => {
  describe('#given empty entries', () => {
    it('#then produces header only', () => {
      const content = buildIndexContent([])
      expect(content).toBe('# Memory Index\n')
    })
  })

  describe('#given multiple entries', () => {
    it('#then produces markdown index with links', () => {
      const entries: MemoryEntry[] = [
        sampleEntry,
        {
          name: 'project_goals',
          description: 'Current project goals',
          type: 'project',
          content: 'Ship v2 by end of Q2',
          filename: 'project_project_goals.md',
        },
      ]

      const content = buildIndexContent(entries)
      expect(content).toContain('# Memory Index')
      expect(content).toContain('[user_role](user_user_role.md)')
      expect(content).toContain('[project_goals](project_project_goals.md)')
    })
  })

  describe('#given long description', () => {
    it('#then truncates to 120 chars', () => {
      const longDesc = 'A'.repeat(200)
      const entries: MemoryEntry[] = [{ ...sampleEntry, description: longDesc }]

      const content = buildIndexContent(entries)
      expect(content).not.toContain(longDesc)
      expect(content).toContain('...')
    })
  })
})

describe('InMemoryLayeredStore', () => {
  describe('#given save and list', () => {
    it('#then stores and retrieves entries', () => {
      const store = new InMemoryLayeredStore()
      store.save(sampleEntry)

      expect(store.get('user_role')).toEqual(sampleEntry)
      expect(store.list()).toHaveLength(1)
    })
  })

  describe('#given type filter', () => {
    it('#then filters by type', () => {
      const store = new InMemoryLayeredStore()
      store.save(sampleEntry)
      store.save({
        name: 'proj',
        description: 'Project info',
        type: 'project',
        content: 'stuff',
        filename: 'project_proj.md',
      })

      expect(store.list({ type: 'user' })).toHaveLength(1)
      expect(store.list({ type: 'project' })).toHaveLength(1)
      expect(store.list({ type: 'feedback' })).toHaveLength(0)
    })
  })

  describe('#given delete', () => {
    it('#then removes entry', () => {
      const store = new InMemoryLayeredStore()
      store.save(sampleEntry)
      expect(store.delete('user_role')).toBe(true)
      expect(store.get('user_role')).toBeUndefined()
      expect(store.delete('nonexistent')).toBe(false)
    })
  })

  describe('#given clear', () => {
    it('#then removes all entries', () => {
      const store = new InMemoryLayeredStore()
      store.save(sampleEntry)
      store.clear()
      expect(store.list()).toHaveLength(0)
    })
  })
})

describe('filterMemoryByScope', () => {
  it('#then filters by scope and team while keeping global entries', () => {
    const scoped: MemoryEntry[] = [
      { ...sampleEntry, scope: 'user' },
      {
        name: 'platform_api',
        description: 'Platform API conventions',
        type: 'project',
        scope: 'team',
        team: 'platform',
        content: 'Use platform client',
        filename: 'project_platform_api.md',
      },
      {
        name: 'mobile_api',
        description: 'Mobile API conventions',
        type: 'project',
        scope: 'team',
        team: 'mobile',
        content: 'Use mobile client',
        filename: 'project_mobile_api.md',
      },
    ]

    expect(
      filterMemoryByScope(scoped, { scopes: ['team'], team: 'platform' }).map((e) => e.name),
    ).toEqual(['platform_api'])
  })
})

describe('detectMemoryConflicts', () => {
  it('#then detects duplicate names and suggests merged content', () => {
    const conflicts = detectMemoryConflicts([
      sampleEntry,
      {
        ...sampleEntry,
        content: 'Additional detail',
        filename: 'user_user_role_2.md',
      },
    ])

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({
      name: 'user_role',
      reason: 'duplicate-name',
    })
    expect(conflicts[0]?.suggested.content).toContain(sampleEntry.content)
    expect(conflicts[0]?.suggested.content).toContain('Additional detail')
  })

  it('#then detects same-description conflicts across unique names', () => {
    const conflicts = detectMemoryConflicts([
      sampleEntry,
      {
        name: 'user_role_copy',
        description: sampleEntry.description,
        type: 'user',
        content: 'Same description, different name',
        filename: 'user_user_role_copy.md',
      },
    ])

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.reason).toBe('same-description')
  })
})

describe('mergeMemoryEntries', () => {
  it('#then rejects empty merges', () => {
    expect(() => mergeMemoryEntries([])).toThrow('Cannot merge empty memory entries')
  })
})
