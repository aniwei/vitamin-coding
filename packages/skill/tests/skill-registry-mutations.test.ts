import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createSkillRegistry } from '../src'

describe('SkillRegistry mutations', () => {
  it('#then creates a valid project SKILL.md and registers it', async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'x-mars-skill-'))
    const registry = createSkillRegistry({ workspaceDir, library: { globalDirs: [] } })

    const result = await registry.create({
      name: 'code-review',
      description: 'Use when reviewing code changes',
      body: '# Code Review\n\nReview risks first.',
      tags: ['review'],
      trigger: 'auto',
    })

    expect(result.success).toBe(true)
    expect(result.path).toContain('code-review/SKILL.md')
    expect(registry.get('code-review')?.definition.metadata.description).toBe(
      'Use when reviewing code changes',
    )
    expect(readFileSync(result.path!, 'utf-8')).toContain('tags:')
  })

  it('#then searches available auto skills without returning body content', async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'x-mars-skill-'))
    const registry = createSkillRegistry({ workspaceDir, library: { globalDirs: [] } })
    await registry.create({
      name: 'test-driven-development',
      description: 'Use when adding tests before implementation',
      body: 'Write the failing test first.',
      tags: ['testing'],
      trigger: 'auto',
    })

    const results = await registry.search('write tests')

    expect(results[0]).toMatchObject({
      name: 'test-driven-development',
      description: 'Use when adding tests before implementation',
    })
    expect(JSON.stringify(results)).not.toContain('Write the failing test first')
  })

  it('#then improves an existing skill and records a change log', async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'x-mars-skill-'))
    const registry = createSkillRegistry({ workspaceDir, library: { globalDirs: [] } })
    await registry.create({
      name: 'debugging',
      description: 'Use when debugging failures',
      body: '# Debugging\n\nReproduce first.',
    })

    const result = await registry.improve({
      name: 'debugging',
      instructions: 'Add regression test guidance.',
    })

    expect(result.success).toBe(true)
    const content = readFileSync(result.path!, 'utf-8')
    expect(content).toContain('Reproduce first.')
    expect(content).toContain('## Improvement Log')
    expect(content).toContain('Add regression test guidance.')
  })

  it('#then discovers project, global, bundled, and mcp skills with Claude Code style precedence', async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'x-mars-skill-'))
    const globalDir = mkdtempSync(join(tmpdir(), 'x-mars-global-skills-'))
    const bundledDir = mkdtempSync(join(tmpdir(), 'x-mars-bundled-skills-'))
    const mcpDir = mkdtempSync(join(tmpdir(), 'x-mars-mcp-skills-'))

    writeSkill(join(workspaceDir, '.x-mars', 'skills'), 'shared-skill', {
      description: 'Use when project skill should win',
      body: 'project body',
    })
    writeSkill(globalDir, 'shared-skill', {
      description: 'Use when global skill would otherwise win',
      body: 'global body',
    })
    writeSkill(bundledDir, 'verify', {
      description: 'Use when verifying completed work',
      body: 'verify body',
    })
    writeSkill(mcpDir, 'docs-reader', {
      description: 'Use when reading MCP-provided docs',
      body: 'mcp body',
    })

    const registry = createSkillRegistry({
      workspaceDir,
      library: { globalDirs: [globalDir], bundledDirs: [bundledDir], mcpDirs: [mcpDir] },
    })

    await registry.discover()

    expect(registry.get('shared-skill')?.source.type).toBe('project')
    expect(registry.get('shared-skill')?.definition.body).toBe('project body')
    expect(registry.get('verify')?.source.type).toBe('bundled')
    expect(registry.get('docs-reader')?.source.type).toBe('mcp')
  })

  it('#then catalog includes skill source labels without body content', async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'x-mars-skill-'))
    const bundledDir = mkdtempSync(join(tmpdir(), 'x-mars-bundled-skills-'))
    writeSkill(bundledDir, 'verify', {
      description: 'Use when verifying completed work',
      body: 'do not inject this body',
    })

    const registry = createSkillRegistry({
      workspaceDir,
      library: { globalDirs: [], bundledDirs: [bundledDir] },
    })
    await registry.discover()

    const catalog = registry.buildCatalog()
    expect(catalog).toContain('**verify** [bundled]')
    expect(catalog).not.toContain('do not inject this body')
  })

  it('#then views a skill body and linked files without allowing path escape', async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'x-mars-skill-'))
    const skillRoot = join(workspaceDir, '.x-mars', 'skills')
    writeSkill(skillRoot, 'research', {
      description: 'Use when researching',
      body: 'Main instructions',
    })
    mkdirSync(join(skillRoot, 'research', 'references'), { recursive: true })
    writeFileSync(join(skillRoot, 'research', 'references', 'guide.md'), 'Reference guide', 'utf-8')

    const registry = createSkillRegistry({ workspaceDir, library: { globalDirs: [] } })
    await registry.discover()

    const body = await registry.view({ name: 'research' })
    expect(body).toMatchObject({ success: true, name: 'research' })
    expect(body.content).toContain('Main instructions')
    expect(body.supportingFiles).toContain('references')

    const linked = await registry.view({ name: 'research', filePath: 'references/guide.md' })
    expect(linked).toMatchObject({ success: true, content: 'Reference guide' })

    const escaped = await registry.view({ name: 'research', filePath: '../outside.md' })
    expect(escaped.success).toBe(false)
    expect(escaped.error).toContain('escapes')
  })

  it('#then records setup_needed readiness for missing environment variables', async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'x-mars-skill-'))
    writeSkill(join(workspaceDir, '.x-mars', 'skills'), 'workspace-api', {
      description: 'Use when calling workspace API',
      body: 'Call the API.',
      extraFrontmatter: ['required_environment_variables:', '  - WORKSPACE_API_KEY'],
    })

    const original = process.env['WORKSPACE_API_KEY']
    delete process.env['WORKSPACE_API_KEY']
    try {
      const registry = createSkillRegistry({ workspaceDir, library: { globalDirs: [] } })
      await registry.discover()

      expect(registry.get('workspace-api')?.readiness).toEqual({
        status: 'setup_needed',
        missingEnvironmentVariables: ['WORKSPACE_API_KEY'],
      })
      expect(registry.buildCatalog()).toContain('[setup_needed: missing WORKSPACE_API_KEY]')
    } finally {
      if (original === undefined) {
        delete process.env['WORKSPACE_API_KEY']
      } else {
        process.env['WORKSPACE_API_KEY'] = original
      }
    }
  })

  it('#then records skill invocation evidence for view, load, and execute', async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'x-mars-skill-'))
    writeSkill(join(workspaceDir, '.x-mars', 'skills'), 'planning', {
      description: 'Use when planning',
      body: 'Plan carefully.',
    })

    const registry = createSkillRegistry({ workspaceDir, library: { globalDirs: [] } })
    await registry.discover()

    await registry.view({ name: 'planning' })
    registry.load('planning')
    registry.execute({ skillName: 'planning', workspaceDir })

    expect(registry.getInvokedSkills().map((record) => record.action)).toEqual([
      'view',
      'load',
      'execute',
    ])
    expect(registry.getInvokedSkills()[0]).toMatchObject({
      name: 'planning',
      source: { type: 'project' },
      success: true,
    })

    registry.clearInvokedSkills()
    expect(registry.getInvokedSkills()).toEqual([])
  })

  it('#then syncs MCP skill resources into the registry cache', async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'x-mars-skill-'))
    const registry = createSkillRegistry({ workspaceDir, library: { globalDirs: [] } })
    const resources = [
      {
        serverName: 'docs-server',
        uri: 'mcp://docs-server/skills/api-docs/SKILL.md',
        name: 'SKILL.md',
      },
      {
        serverName: 'docs-server',
        uri: 'mcp://docs-server/skills/api-docs/references/http.md',
        name: 'http.md',
      },
      {
        serverName: 'docs-server',
        uri: 'mcp://docs-server/other/readme.md',
        name: 'readme.md',
      },
    ]
    const contents = new Map([
      [
        resources[0]!.uri,
        [
          {
            uri: resources[0]!.uri,
            text: [
              '---',
              'name: api-docs',
              'description: Use when reading MCP-provided API docs',
              '---',
              '',
              'Read API docs from MCP.',
              '',
            ].join('\n'),
          },
        ],
      ],
      [resources[1]!.uri, [{ uri: resources[1]!.uri, text: 'HTTP reference from MCP' }]],
    ])

    const result = await registry.syncMcpSkills({
      getAllResources: () => resources,
      readResource: async (_serverName, uri) => contents.get(uri) ?? [],
    })

    expect(result).toMatchObject({ success: true, synced: 1, skipped: 1 })
    expect(registry.get('api-docs')?.source.type).toBe('mcp')
    expect(registry.get('api-docs')?.definition.body).toBe('Read API docs from MCP.')

    const linked = await registry.view({ name: 'api-docs', filePath: 'references/http.md' })
    expect(linked).toMatchObject({ success: true, content: 'HTTP reference from MCP' })
  })

  it('#then reports MCP skill sync errors without registering invalid resources', async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'x-mars-skill-'))
    const registry = createSkillRegistry({ workspaceDir, library: { globalDirs: [] } })

    const result = await registry.syncMcpSkills({
      getAllResources: () => [
        {
          serverName: 'bad-server',
          uri: 'mcp://bad-server/skills/bad/SKILL.md',
          name: 'SKILL.md',
        },
      ],
      readResource: async (_serverName, uri) => [{ uri, text: '# Missing frontmatter' }],
    })

    expect(result.success).toBe(false)
    expect(result.synced).toBe(0)
    expect(result.errors[0]?.uri).toContain('SKILL.md')
    expect(registry.size).toBe(0)
  })
})

function writeSkill(
  root: string,
  name: string,
  options: { description: string; body: string; extraFrontmatter?: string[] },
): void {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'SKILL.md'),
    [
      '---',
      `name: ${name}`,
      `description: ${options.description}`,
      ...(options.extraFrontmatter ?? []),
      '---',
      '',
      options.body,
      '',
    ].join('\n'),
    'utf-8',
  )
}
