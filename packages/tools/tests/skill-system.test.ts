// Skill 系统测试 — 解析器、注册表、发现、Prompt 格式化、Reader 抽象
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

import { parseSkillFile } from '../src/skill/skill-parser'
import { SkillRegistry } from '../src/skill/skill-registry'
import { loadSkills } from '../src/skill/skill-discovery'
import { formatSkillsForPrompt } from '../src/skill/skill-prompt'
import { LocalSkillReader, deriveSkillName } from '../src/skill/local-reader'
import { RemoteSkillReader } from '../src/skill/remote-reader'
import type { Skill, SkillReader, SkillEntry, SkillContent } from '../src/skill/types'

// ── parseSkillFile ──────────────────────────────────────────────────

describe('parseSkillFile', () => {
  it('parses valid frontmatter + body', () => {
    const content = `---
name: react-component
description: Guidelines for React components
---

# React Component

Use functional components.`

    const result = parseSkillFile(content, '/test/SKILL.md')
    expect(result.frontmatter).not.toBeNull()
    expect(result.frontmatter!.name).toBe('react-component')
    expect(result.frontmatter!.description).toBe('Guidelines for React components')
    expect(result.body).toBe('# React Component\n\nUse functional components.')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('returns null frontmatter when no --- delimiters', () => {
    const content = '# Just markdown\n\nNo frontmatter here.'
    const result = parseSkillFile(content, '/test/plain.md')
    expect(result.frontmatter).toBeNull()
    expect(result.body).toBe('# Just markdown\n\nNo frontmatter here.')
  })

  it('warns on missing description', () => {
    const content = `---
name: test-skill
---

Body text.`

    const result = parseSkillFile(content, '/test/SKILL.md')
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(1)
    expect(result.diagnostics[0]!.type).toBe('warning')
    expect(result.diagnostics[0]!.message).toContain('description')
  })

  it('warns on description exceeding 1024 chars', () => {
    const longDesc = 'a'.repeat(1025)
    const content = `---
name: test
description: ${longDesc}
---

Body.`

    const result = parseSkillFile(content, '/test/SKILL.md')
    const descWarning = result.diagnostics.find((d) => d.message.includes('1024'))
    expect(descWarning).toBeDefined()
  })

  it('warns on invalid skill name', () => {
    const content = `---
name: InvalidName
description: Test
---

Body.`

    const result = parseSkillFile(content, '/test/SKILL.md')
    const nameWarning = result.diagnostics.find((d) => d.message.includes('does not match'))
    expect(nameWarning).toBeDefined()
  })

  it('warns on consecutive hyphens in name', () => {
    const content = `---
name: my--skill
description: Test
---

Body.`

    const result = parseSkillFile(content, '/test/SKILL.md')
    const hyphenWarning = result.diagnostics.find((d) => d.message.includes('consecutive hyphens'))
    expect(hyphenWarning).toBeDefined()
  })

  it('parses disable-model-invocation boolean', () => {
    const content = `---
name: hidden-skill
description: Internal skill
disable-model-invocation: true
---

Secret knowledge.`

    const result = parseSkillFile(content, '/test/SKILL.md')
    expect(result.frontmatter!['disable-model-invocation']).toBe(true)
  })

  it('handles quoted values', () => {
    const content = `---
name: "quoted-name"
description: 'single quoted description'
---

Body.`

    const result = parseSkillFile(content, '/test/SKILL.md')
    expect(result.frontmatter!.name).toBe('quoted-name')
    expect(result.frontmatter!.description).toBe('single quoted description')
  })

  it('reports YAML parse errors', () => {
    const content = `---
name: test
description: [invalid: yaml: {
---

Body.`

    const result = parseSkillFile(content, '/test/SKILL.md')
    const error = result.diagnostics.find((d) => d.type === 'error')
    expect(error).toBeDefined()
    expect(error!.message).toContain('YAML parse error')
  })

  it('reports Zod validation errors for wrong types', () => {
    // description must be string, pass number
    const content = `---
name: test
description: 12345
---

Body.`

    const result = parseSkillFile(content, '/test/SKILL.md')
    // number 12345 will be parsed by yaml as number, Zod expects string
    const warning = result.diagnostics.find((d) => d.message.includes('Frontmatter validation'))
    expect(warning).toBeDefined()
  })

  it('handles empty frontmatter gracefully', () => {
    const content = `---
---

Body only.`

    const result = parseSkillFile(content, '/test/SKILL.md')
    expect(result.frontmatter).toBeNull()
    expect(result.body).toBe('Body only.')
    const emptyWarning = result.diagnostics.find((d) => d.message.includes('Empty frontmatter'))
    expect(emptyWarning).toBeDefined()
  })

  it('handles multi-line YAML values', () => {
    const content = `---
name: multi-line
description: >
  This is a long description
  that spans multiple lines.
---

Body.`

    const result = parseSkillFile(content, '/test/SKILL.md')
    expect(result.frontmatter!.description).toContain('This is a long description')
    expect(result.frontmatter!.description).toContain('multiple lines.')
  })

  it('handles unclosed frontmatter as no frontmatter', () => {
    const content = `---
name: unclosed
description: No closing delimiter

Body text.`

    const result = parseSkillFile(content, '/test/SKILL.md')
    expect(result.frontmatter).toBeNull()
    expect(result.body).toContain('---')
  })
})

// ── SkillRegistry ───────────────────────────────────────────────────

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'test-skill',
    description: 'A test skill',
    filePath: '/test/SKILL.md',
    directory: '/test',
    body: '# Test',
    source: 'project',
    disableModelInvocation: false,
    ...overrides,
  }
}

describe('SkillRegistry', () => {
  it('registers and retrieves a skill', () => {
    const registry = new SkillRegistry()
    const skill = makeSkill()
    const diag = registry.register(skill)
    expect(diag).toBeNull()
    expect(registry.has('test-skill')).toBe(true)
    expect(registry.get('test-skill')).toEqual(skill)
    expect(registry.size).toBe(1)
  })

  it('returns collision diagnostic on duplicate name', () => {
    const registry = new SkillRegistry()
    registry.register(makeSkill({ filePath: '/a/SKILL.md' }))
    const diag = registry.register(makeSkill({ filePath: '/b/SKILL.md' }))
    expect(diag).not.toBeNull()
    expect(diag!.type).toBe('collision')
    expect(registry.size).toBe(1)
  })

  it('registerAll returns all collision diagnostics', () => {
    const registry = new SkillRegistry()
    const skills = [
      makeSkill({ name: 'a' }),
      makeSkill({ name: 'b' }),
      makeSkill({ name: 'a', filePath: '/dup/SKILL.md' }),
    ]
    const diags = registry.registerAll(skills)
    expect(diags).toHaveLength(1)
    expect(registry.size).toBe(2)
  })

  it('getPromptVisible excludes disableModelInvocation', () => {
    const registry = new SkillRegistry()
    registry.register(makeSkill({ name: 'visible' }))
    registry.register(makeSkill({ name: 'hidden', disableModelInvocation: true }))
    const visible = registry.getPromptVisible()
    expect(visible).toHaveLength(1)
    expect(visible[0]!.name).toBe('visible')
  })

  it('unregister removes skill', () => {
    const registry = new SkillRegistry()
    registry.register(makeSkill())
    expect(registry.unregister('test-skill')).toBe(true)
    expect(registry.has('test-skill')).toBe(false)
    expect(registry.size).toBe(0)
  })

  it('clear empties registry', () => {
    const registry = new SkillRegistry()
    registry.register(makeSkill({ name: 'a' }))
    registry.register(makeSkill({ name: 'b' }))
    registry.clear()
    expect(registry.size).toBe(0)
  })
})

// ── formatSkillsForPrompt ───────────────────────────────────────────

describe('formatSkillsForPrompt', () => {
  it('returns empty string for no skills', () => {
    expect(formatSkillsForPrompt([])).toBe('')
  })

  it('returns empty string when all skills are disabled', () => {
    const skills = [makeSkill({ disableModelInvocation: true })]
    expect(formatSkillsForPrompt(skills)).toBe('')
  })

  it('formats visible skills as XML', () => {
    const skills = [
      makeSkill({ name: 'react', description: 'React guidelines', filePath: '/skills/react/SKILL.md' }),
      makeSkill({ name: 'testing', description: 'Testing patterns', filePath: '/skills/testing/SKILL.md' }),
    ]
    const output = formatSkillsForPrompt(skills)
    expect(output).toContain('<available_skills>')
    expect(output).toContain('</available_skills>')
    expect(output).toContain('<name>react</name>')
    expect(output).toContain('<description>React guidelines</description>')
    expect(output).toContain('<location>/skills/react/SKILL.md</location>')
    expect(output).toContain('<name>testing</name>')
  })

  it('excludes disabled skills from output', () => {
    const skills = [
      makeSkill({ name: 'visible', description: 'Visible' }),
      makeSkill({ name: 'hidden', description: 'Hidden', disableModelInvocation: true }),
    ]
    const output = formatSkillsForPrompt(skills)
    expect(output).toContain('<name>visible</name>')
    expect(output).not.toContain('<name>hidden</name>')
  })

  it('escapes XML special characters', () => {
    const skills = [
      makeSkill({ name: 'special', description: 'Use <tags> & "quotes"' }),
    ]
    const output = formatSkillsForPrompt(skills)
    expect(output).toContain('&lt;tags&gt;')
    expect(output).toContain('&amp;')
    expect(output).toContain('&quot;quotes&quot;')
  })
})

// ── loadSkills (filesystem integration) ─────────────────────────────

describe('loadSkills', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = join(tmpdir(), `vitamin-skill-test-${randomUUID()}`)
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('discovers SKILL.md in project .vitamin/skills/', async () => {
    const skillDir = join(testDir, '.vitamin', 'skills', 'my-skill')
    await mkdir(skillDir, { recursive: true })
    await writeFile(
      join(skillDir, 'SKILL.md'),
      `---
name: my-skill
description: A test skill
---

# My Skill

Instructions here.`,
    )

    const result = await loadSkills({
      cwd: testDir,
      agentDir: join(testDir, '.no-global'), // 避免全局目录干扰
      includeDefaults: true,
    })

    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]!.name).toBe('my-skill')
    expect(result.skills[0]!.source).toBe('project')
    expect(result.skills[0]!.body).toContain('# My Skill')
  })

  it('discovers skills from user global directory', async () => {
    const agentDir = join(testDir, '.vitamin-global')
    const skillDir = join(agentDir, 'skills', 'global-skill')
    await mkdir(skillDir, { recursive: true })
    await writeFile(
      join(skillDir, 'SKILL.md'),
      `---
name: global-skill
description: Global skill
---

Global instructions.`,
    )

    const result = await loadSkills({
      cwd: join(testDir, 'no-project'),
      agentDir,
      includeDefaults: true,
    })

    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]!.name).toBe('global-skill')
    expect(result.skills[0]!.source).toBe('user')
  })

  it('discovers skills from explicit skillPaths', async () => {
    const customDir = join(testDir, 'custom-skills', 'custom')
    await mkdir(customDir, { recursive: true })
    await writeFile(
      join(customDir, 'SKILL.md'),
      `---
name: custom
description: Custom skill
---

Custom content.`,
    )

    const result = await loadSkills({
      cwd: testDir,
      agentDir: join(testDir, '.no-global'),
      skillPaths: [join(testDir, 'custom-skills')],
      includeDefaults: false,
    })

    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]!.name).toBe('custom')
    expect(result.skills[0]!.source).toBe('path')
  })

  it('detects name collision and keeps first', async () => {
    const globalDir = join(testDir, '.vitamin-global', 'skills', 'dupe')
    const projectDir = join(testDir, '.vitamin', 'skills', 'dupe')
    await mkdir(globalDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })

    const content = `---
name: dupe
description: Duplicate skill
---

Content.`

    await writeFile(join(globalDir, 'SKILL.md'), content)
    await writeFile(join(projectDir, 'SKILL.md'), content)

    const result = await loadSkills({
      cwd: testDir,
      agentDir: join(testDir, '.vitamin-global'),
    })

    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]!.source).toBe('user') // 全局先扫描，先到者胜
    const collision = result.diagnostics.find((d) => d.type === 'collision')
    expect(collision).toBeDefined()
  })

  it('derives name from directory when frontmatter has no name', async () => {
    const skillDir = join(testDir, '.vitamin', 'skills', 'derived-name')
    await mkdir(skillDir, { recursive: true })
    await writeFile(
      join(skillDir, 'SKILL.md'),
      `---
description: Skill with derived name
---

No explicit name.`,
    )

    const result = await loadSkills({
      cwd: testDir,
      agentDir: join(testDir, '.no-global'),
    })

    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]!.name).toBe('derived-name')
  })

  it('loads root-level .md files in skills directory', async () => {
    const skillsDir = join(testDir, '.vitamin', 'skills')
    await mkdir(skillsDir, { recursive: true })
    await writeFile(
      join(skillsDir, 'quick-tip.md'),
      `---
description: A quick tip
---

Quick tip content.`,
    )

    const result = await loadSkills({
      cwd: testDir,
      agentDir: join(testDir, '.no-global'),
    })

    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]!.name).toBe('quick-tip')
  })

  it('handles symlinks by deduplicating real paths', async () => {
    const skillDir = join(testDir, '.vitamin', 'skills', 'real-skill')
    await mkdir(skillDir, { recursive: true })
    await writeFile(
      join(skillDir, 'SKILL.md'),
      `---
name: sym-test
description: Symlink test
---

Real content.`,
    )

    // Create symlink
    const linkDir = join(testDir, '.vitamin', 'skills', 'linked-skill')
    await symlink(skillDir, linkDir)

    const result = await loadSkills({
      cwd: testDir,
      agentDir: join(testDir, '.no-global'),
    })

    // Should only load once despite two paths resolving to same real dir
    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]!.name).toBe('sym-test')
  })

  it('returns empty when no skills directories exist', async () => {
    const result = await loadSkills({
      cwd: join(testDir, 'nonexistent'),
      agentDir: join(testDir, 'also-nonexistent'),
    })

    expect(result.skills).toHaveLength(0)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('does not recurse into SKILL.md directory children', async () => {
    // Directory with SKILL.md should be treated as Skill root
    const parentDir = join(testDir, '.vitamin', 'skills', 'parent')
    const childDir = join(parentDir, 'child')
    await mkdir(childDir, { recursive: true })

    await writeFile(
      join(parentDir, 'SKILL.md'),
      `---
name: parent
description: Parent skill
---

Parent content.`,
    )

    await writeFile(
      join(childDir, 'SKILL.md'),
      `---
name: child
description: Should not be found
---

Child content.`,
    )

    const result = await loadSkills({
      cwd: testDir,
      agentDir: join(testDir, '.no-global'),
    })

    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]!.name).toBe('parent')
  })

  it('skips dot-directories and node_modules', async () => {
    const skillsDir = join(testDir, '.vitamin', 'skills')
    const hiddenDir = join(skillsDir, '.hidden')
    const nodeDir = join(skillsDir, 'node_modules', 'pkg')
    await mkdir(hiddenDir, { recursive: true })
    await mkdir(nodeDir, { recursive: true })

    await writeFile(
      join(hiddenDir, 'SKILL.md'),
      `---
name: hidden
description: Should be skipped
---
Hidden.`,
    )

    await writeFile(
      join(nodeDir, 'SKILL.md'),
      `---
name: nm-skill
description: Should be skipped
---
NM.`,
    )

    const result = await loadSkills({
      cwd: testDir,
      agentDir: join(testDir, '.no-global'),
    })

    expect(result.skills).toHaveLength(0)
  })

  it('accepts custom SkillReader via options.readers', async () => {
    // 实现一个内存读取器
    const inMemoryReader: SkillReader = {
      async discover() {
        return [
          { location: 'memory://custom-skill/SKILL.md', source: 'remote' },
        ]
      },
      async read(entry) {
        return {
          content: `---
name: in-memory
description: An in-memory skill
---

In-memory body.`,
          location: entry.location,
          directory: 'memory://custom-skill',
          source: entry.source,
        }
      },
    }

    const result = await loadSkills({
      cwd: join(testDir, 'nonexistent'),
      agentDir: join(testDir, 'also-nonexistent'),
      readers: [inMemoryReader],
    })

    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]!.name).toBe('in-memory')
    expect(result.skills[0]!.source).toBe('remote')
  })

  it('merges local and custom reader skills with collision detection', async () => {
    // 本地 Skill
    const skillDir = join(testDir, '.vitamin', 'skills', 'local-skill')
    await mkdir(skillDir, { recursive: true })
    await writeFile(
      join(skillDir, 'SKILL.md'),
      `---
name: shared-name
description: Local version
---
Local.`,
    )

    // 远程 reader 提供同名 Skill
    const remoteReader: SkillReader = {
      async discover() {
        return [{ location: 'remote://shared-name/SKILL.md', source: 'remote' }]
      },
      async read(entry) {
        return {
          content: `---
name: shared-name
description: Remote version
---
Remote.`,
          location: entry.location,
          directory: 'remote://shared-name',
          source: entry.source,
        }
      },
    }

    const result = await loadSkills({
      cwd: testDir,
      agentDir: join(testDir, '.no-global'),
      readers: [remoteReader],
    })

    // 本地先加载（默认 reader 先于自定义 reader），remote 产生 collision
    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]!.source).toBe('project')
    expect(result.diagnostics.some((d) => d.type === 'collision')).toBe(true)
  })
})

// ── LocalSkillReader ────────────────────────────────────────────────

describe('LocalSkillReader', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = join(tmpdir(), `vitamin-local-reader-${randomUUID()}`)
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('discovers and reads SKILL.md files', async () => {
    const skillDir = join(testDir, 'my-skill')
    await mkdir(skillDir, { recursive: true })
    await writeFile(join(skillDir, 'SKILL.md'), '---\nname: test\ndescription: Test\n---\nBody.')

    const reader = new LocalSkillReader({
      directories: [{ path: testDir, source: 'project' }],
    })

    const entries = await reader.discover()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.source).toBe('project')

    const content = await reader.read(entries[0]!)
    expect(content).not.toBeNull()
    expect(content!.content).toContain('name: test')
  })

  it('deduplicates symlinks', async () => {
    const realDir = join(testDir, 'real')
    await mkdir(realDir, { recursive: true })
    await writeFile(join(realDir, 'SKILL.md'), '---\nname: real\ndescription: Real\n---\nBody.')

    const linkDir = join(testDir, 'linked')
    await symlink(realDir, linkDir)

    const reader = new LocalSkillReader({
      directories: [{ path: testDir, source: 'project' }],
    })

    const entries = await reader.discover()
    expect(entries).toHaveLength(1)
  })

  it('returns null for unreadable file', async () => {
    const reader = new LocalSkillReader({
      directories: [{ path: testDir, source: 'project' }],
    })

    const content = await reader.read({
      location: '/nonexistent/SKILL.md',
      source: 'project',
    })
    expect(content).toBeNull()
  })
})

// ── deriveSkillName ─────────────────────────────────────────────────

describe('deriveSkillName', () => {
  it('uses parent dir name for SKILL.md', () => {
    expect(deriveSkillName('/skills/react-component/SKILL.md')).toBe('react-component')
  })

  it('uses filename without .md for other files', () => {
    expect(deriveSkillName('/skills/quick-tip.md')).toBe('quick-tip')
  })
})

// ── RemoteSkillReader ───────────────────────────────────────────────

describe('RemoteSkillReader', () => {
  it('discovers entries from config', async () => {
    const reader = new RemoteSkillReader({
      entries: [
        { url: 'https://example.com/skills/react/SKILL.md' },
        { url: 'https://example.com/skills/testing/SKILL.md' },
      ],
    })

    const entries = await reader.discover()
    expect(entries).toHaveLength(2)
    expect(entries[0]!.source).toBe('remote')
    expect(entries[0]!.location).toBe('https://example.com/skills/react/SKILL.md')
  })

  it('rejects non-http URLs', async () => {
    const reader = new RemoteSkillReader({
      entries: [{ url: 'file:///etc/passwd' }],
    })

    const entries = await reader.discover()
    const content = await reader.read(entries[0]!)
    expect(content).toBeNull()
  })

  it('rejects invalid URLs', async () => {
    const reader = new RemoteSkillReader({
      entries: [{ url: 'not-a-url' }],
    })

    const entries = await reader.discover()
    const content = await reader.read(entries[0]!)
    expect(content).toBeNull()
  })
})
