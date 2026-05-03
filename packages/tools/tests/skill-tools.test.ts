import { describe, expect, it } from 'vitest'

import { createSkillCreate, createSkillImprove, createSkillSearch, createSkillView } from '../src'

describe('skill tools', () => {
  it('#then skill_search returns matching catalog summaries', async () => {
    const tool = createSkillSearch(async () => [
      {
        name: 'code-review',
        description: 'Use when reviewing code',
        trigger: 'manual',
        status: 'available',
        source: { type: 'project', root: '/workspace/.x-mars/skills' },
        readiness: {
          status: 'setup_needed',
          missingEnvironmentVariables: ['OPENAI_API_KEY'],
        },
        relevance: 0.8,
        matchedKeywords: ['review'],
      },
    ])

    const result = await tool.execute({
      id: 'call_1',
      params: { query: 'review' },
      signal: new AbortController().signal,
    })

    const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
    expect(text).toContain('code-review [manual]')
    expect(text).toContain('source: project')
    expect(text).toContain('status: available')
    expect(text).toContain('readiness: setup_needed')
    expect(text).toContain('missing env: OPENAI_API_KEY')
    expect(text).toContain('relevance: 0.80')
  })

  it('#then skill_create delegates valid SKILL.md creation', async () => {
    const tool = createSkillCreate(async (input) => ({
      success: true,
      name: input.name,
      path: `/workspace/.x-mars/skills/${input.name}/SKILL.md`,
    }))

    const result = await tool.execute({
      id: 'call_1',
      params: {
        name: 'planning',
        description: 'Use when planning',
        body: '# Planning',
      },
      signal: new AbortController().signal,
    })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toContain(
      'Skill "planning" created',
    )
  })

  it('#then skill_view returns skill content and linked file metadata', async () => {
    const tool = createSkillView(async (input) => ({
      success: true,
      name: input.name,
      source: { type: 'project', root: '/workspace/.x-mars/skills' },
      path: input.filePath
        ? `/workspace/.x-mars/skills/${input.name}/${input.filePath}`
        : `/workspace/.x-mars/skills/${input.name}/SKILL.md`,
      content: input.filePath ? 'Reference content' : '# Skill body',
      supportingFiles: ['references/guide.md'],
    }))

    const result = await tool.execute({
      id: 'call_1',
      params: { name: 'planning', filePath: 'references/guide.md' },
      signal: new AbortController().signal,
    })

    const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
    expect(text).toContain('Skill: planning')
    expect(text).toContain('Source: project')
    expect(text).toContain('Linked files: references/guide.md')
    expect(text).toContain('Reference content')
  })

  it('#then skill_improve delegates preserving existing skill content', async () => {
    const tool = createSkillImprove(async (input) => ({
      success: true,
      name: input.name,
      path: `/workspace/.x-mars/skills/${input.name}/SKILL.md`,
    }))

    const result = await tool.execute({
      id: 'call_1',
      params: {
        name: 'planning',
        instructions: 'Record better acceptance checks.',
      },
      signal: new AbortController().signal,
    })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toContain(
      'Skill "planning" improved',
    )
  })
})
