import { describe, expect, it } from 'vitest'
import {
  FrontmatterParseError,
  extractYamlFrontmatter,
  parseYamlFrontmatter,
  serializeYamlFrontmatter,
} from '../src'

describe('yaml frontmatter', () => {
  it('#extracts yaml and body', () => {
    const result = extractYamlFrontmatter(`---
name: demo
---

# Body
---`)

    expect(result).toEqual({ yaml: 'name: demo', body: '# Body\n---' })
  })

  it('#parses yaml metadata', () => {
    const result = parseYamlFrontmatter(`---
name: demo
tags:
  - a
---

Body`)

    expect(result.metadata).toEqual({ name: 'demo', tags: ['a'] })
    expect(result.body).toBe('Body')
  })

  it('#throws typed errors for missing frontmatter', () => {
    expect(() => parseYamlFrontmatter('plain text', 'SKILL.md')).toThrow(FrontmatterParseError)
    try {
      parseYamlFrontmatter('plain text', 'SKILL.md')
    } catch (error) {
      expect(error).toMatchObject({ code: 'missing_frontmatter', filePath: 'SKILL.md' })
    }
  })

  it('#serializes metadata and body', () => {
    const serialized = serializeYamlFrontmatter({ name: 'demo', type: 'user' }, 'Body')
    expect(serialized).toContain('name: demo')
    expect(serialized).toContain('type: user')
    expect(parseYamlFrontmatter(serialized).body).toBe('Body')
  })
})
