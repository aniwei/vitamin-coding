import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { discoverFileAgents, parseAgentMarkdown } from '../src/agent-files'

describe('file agent profiles', () => {
  it('parses markdown frontmatter into an agent config', () => {
    const agent = parseAgentMarkdown(
      [
        '---',
        'name: code-reviewer',
        'description: Reviews code changes',
        'tools: [read, grep, bash]',
        'capabilities: [review, typescript]',
        'categories: [review]',
        'default_workflow_slot: critique',
        'max_tool_turns: 7',
        '---',
        'Review the implementation carefully.',
      ].join('\n'),
      { fallbackName: 'fallback' },
    )

    expect(agent).toMatchObject({
      name: 'code-reviewer',
      description: 'Reviews code changes',
      system_prompt: 'Review the implementation carefully.',
      tools: ['read', 'grep', 'bash'],
      capabilities: ['review', 'typescript'],
      categories: ['review'],
      default_workflow_slot: 'critique',
      max_tool_turns: 7,
    })
  })

  it('discovers enabled markdown agents from .x-mars/agents', async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), 'x-mars-agents-'))
    const agentsDir = join(workspaceDir, '.x-mars', 'agents')
    await mkdir(agentsDir, { recursive: true })
    await writeFile(
      join(agentsDir, 'explorer.md'),
      ['---', 'tools: [read, grep]', '---', 'Explore the codebase.'].join('\n'),
      'utf-8',
    )
    await writeFile(
      join(agentsDir, 'disabled.md'),
      ['---', 'disabled: true', '---', 'Disabled agent.'].join('\n'),
      'utf-8',
    )
    await writeFile(join(agentsDir, 'note.txt'), 'ignored', 'utf-8')

    const agents = await discoverFileAgents({ workspaceDir })

    expect(Object.keys(agents)).toEqual(['explorer'])
    expect(agents.explorer).toMatchObject({
      system_prompt: 'Explore the codebase.',
      tools: ['read', 'grep'],
    })
  })
})
