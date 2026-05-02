import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { importClaudeCodePlugin } from '../src/claude-code-compat'

describe('Claude Code plugin compatibility importer', () => {
  it('#then converts Claude Code plugin assets into a Vitamin plugin manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'claude-code-plugin-'))
    await mkdir(join(root, '.claude-plugin'), { recursive: true })
    await mkdir(join(root, 'skills/code-review'), { recursive: true })
    await mkdir(join(root, 'commands'), { recursive: true })
    await mkdir(join(root, 'agents'), { recursive: true })
    await mkdir(join(root, 'hooks'), { recursive: true })

    await writeFile(
      join(root, '.claude-plugin/plugin.json'),
      JSON.stringify({
        name: 'review-kit',
        version: '1.2.3',
        description: 'Review Kit',
      }),
      'utf-8',
    )
    await writeFile(
      join(root, 'skills/code-review/SKILL.md'),
      '---\nname: code-review\ndescription: Review code\ndependencies:\n  - git\n---\nReview code.\n',
      'utf-8',
    )
    await writeFile(
      join(root, 'commands/review.md'),
      '---\nname: review\ndescription: Run review\narguments:\n  - name: path\n    description: Target path\n    required: true\n    type: string\n---\nReview $ARGUMENTS.\n',
      'utf-8',
    )
    await writeFile(
      join(root, 'agents/reviewer.md'),
      '---\nname: reviewer\ndescription: Review agent\ntools: Read, Grep\n---\nYou review code.\n',
      'utf-8',
    )
    await writeFile(
      join(root, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          docs: {
            command: '${CLAUDE_PLUGIN_ROOT}/bin/docs-server',
            args: ['--root', '${CLAUDE_PLUGIN_ROOT}/docs'],
            env: {
              CACHE_DIR: '${CLAUDE_PLUGIN_DATA}/cache',
            },
            cwd: '${CLAUDE_PLUGIN_ROOT}',
          },
        },
      }),
      'utf-8',
    )
    await writeFile(join(root, 'hooks/hooks.json'), JSON.stringify({ hooks: {} }), 'utf-8')

    const { manifest, report } = await importClaudeCodePlugin(root, {
      dataDir: join(root, '.data'),
    })

    expect(manifest).toMatchObject({
      id: 'review-kit',
      name: 'Review Kit',
      version: '1.2.3',
      permissions: ['mcp'],
      skills: [{ name: 'code-review', path: './skills/code-review/SKILL.md', trigger: 'manual' }],
      commands: [
        {
          name: 'review',
          description: 'Run review',
          prompt: 'Review $ARGUMENTS.',
          arguments: [{ name: 'path', description: 'Target path', required: true, type: 'string' }],
        },
      ],
      agents: [
        {
          name: 'reviewer',
          description: 'Review agent',
          prompt: 'You review code.',
          tools: ['Read', 'Grep'],
        },
      ],
      mcpServers: [
        {
          name: 'docs',
          command: join(root, 'bin/docs-server'),
          args: ['--root', join(root, 'docs')],
          env: { CACHE_DIR: join(root, '.data/cache') },
        },
      ],
    })
    expect(report.imported).toEqual({
      skills: ['code-review'],
      commands: ['review'],
      agents: ['reviewer'],
      mcpServers: ['docs'],
    })
    expect(report.unsupported).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component: 'mcpServers.cwd' }),
        expect.objectContaining({ component: 'hooks', path: './hooks/hooks.json' }),
      ]),
    )
  })

  it('#then supports manifest component paths and inline MCP configs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'claude-code-plugin-'))
    await mkdir(join(root, '.claude-plugin'), { recursive: true })
    await mkdir(join(root, 'custom/skills/research'), { recursive: true })
    await mkdir(join(root, 'custom/commands'), { recursive: true })
    await mkdir(join(root, 'custom/agents'), { recursive: true })

    await writeFile(
      join(root, '.claude-plugin/plugin.json'),
      JSON.stringify({
        name: 'research-kit',
        skills: './custom/skills',
        commands: ['./custom/commands/find.md'],
        agents: './custom/agents',
        mcpServers: {
          web: {
            url: 'https://example.com/mcp',
          },
        },
        lspServers: './.lsp.json',
      }),
      'utf-8',
    )
    await writeFile(
      join(root, 'custom/skills/research/SKILL.md'),
      '---\nname: research\ndescription: Research\n---\nResearch.\n',
      'utf-8',
    )
    await writeFile(join(root, 'custom/commands/find.md'), 'Find things.\n', 'utf-8')
    await writeFile(join(root, 'custom/agents/researcher.md'), 'Research agent.\n', 'utf-8')

    const { manifest, report } = await importClaudeCodePlugin(root)

    expect(manifest).toMatchObject({
      id: 'research-kit',
      version: '0.0.0',
      skills: [{ name: 'research', path: './custom/skills/research/SKILL.md' }],
      commands: [{ name: 'find' }],
      agents: [{ name: 'researcher' }],
      mcpServers: [{ name: 'web', url: 'https://example.com/mcp' }],
    })
    expect(report.unsupported).toEqual(
      expect.arrayContaining([expect.objectContaining({ component: 'lspServers' })]),
    )
  })

  it('#then imports Claude Code command argument hints as positional schema', async () => {
    const root = await mkdtemp(join(tmpdir(), 'claude-code-plugin-'))
    await mkdir(join(root, 'commands'), { recursive: true })
    await writeFile(
      join(root, 'commands/review.md'),
      '---\nname: review\nargument-hint: <path> [focus]\n---\nReview $ARGUMENTS.\n',
      'utf-8',
    )

    const { manifest } = await importClaudeCodePlugin(root)

    expect(manifest.commands).toEqual([
      {
        name: 'review',
        description: undefined,
        prompt: 'Review $ARGUMENTS.',
        arguments: [
          { name: 'path', required: true },
          { name: 'focus', required: false },
        ],
      },
    ])
  })

  it('#then derives plugin metadata when Claude Code manifest is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'missing-manifest-plugin-'))

    const { manifest, report } = await importClaudeCodePlugin(root)

    expect(manifest).toMatchObject({
      id: root.split('/').at(-1),
      version: '0.0.0',
      name: root.split('/').at(-1),
    })
    expect(report.warnings).toContain(
      '.claude-plugin/plugin.json is missing; deriving plugin metadata from directory',
    )
  })
})
