import { describe, expect, it } from 'vitest'
import { parseSkillContent } from '../src/skill-parser'

describe('parseSkillContent', () => {
  it('#parses YAML frontmatter and markdown body', () => {
    const skill = parseSkillContent(
      `---
name: demo-skill
description: Demo skill
version: 1.0.0
tags:
  - demo
trigger: manual
priority: 10
platforms:
  - macos
required_environment_variables:
  - DEMO_API_KEY
  - name: DEMO_ORG
    description: Demo org
setup:
  help: Configure demo credentials.
  collect_secrets:
    - env_var: DEMO_SECRET
      secret: true
---

# Demo

Body`,
      '/tmp/SKILL.md',
      '/tmp',
      ['refs/example.md'],
    )

    expect(skill.metadata).toEqual({
      name: 'demo-skill',
      description: 'Demo skill',
      version: '1.0.0',
      author: undefined,
      tags: ['demo'],
      dependencies: undefined,
      trigger: 'manual',
      priority: 10,
      platforms: ['macos'],
      requiredEnvironmentVariables: [
        { name: 'DEMO_API_KEY', required: true },
        { name: 'DEMO_ORG', description: 'Demo org', required: true, secret: undefined },
      ],
      setup: {
        help: 'Configure demo credentials.',
        collectSecrets: [
          { name: 'DEMO_SECRET', description: undefined, required: true, secret: true },
        ],
      },
    })
    expect(skill.body).toBe('# Demo\n\nBody')
    expect(skill.supportingFiles).toEqual(['refs/example.md'])
  })

  it('#keeps the existing missing frontmatter error', () => {
    expect(() => parseSkillContent('plain text', '/tmp/SKILL.md', '/tmp')).toThrow(
      'SKILL.md at "/tmp/SKILL.md" has no valid YAML frontmatter',
    )
  })
})
