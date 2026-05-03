import { describe, expect, it } from 'vitest'

import {
  createMcpAgentTools,
  createMcpListPromptsTool,
  createMcpListResourcesTool,
  createMcpReadResourceTool,
  type McpManager,
} from '../src'

function createManagerStub(): McpManager {
  return {
    getAllResources: () => [
      {
        serverName: 'docs',
        uri: 'file:///guide.md',
        name: 'Guide',
        description: 'Project guide',
        mimeType: 'text/markdown',
      },
    ],
    getAllPrompts: () => [
      {
        serverName: 'docs',
        name: 'summarize',
        description: 'Summarize a document',
        arguments: [{ name: 'topic', required: true }],
      },
    ],
    getClient: (serverName: string) =>
      serverName === 'docs'
        ? {
            readResource: async () => [{ uri: 'file:///guide.md', text: '# Guide' }],
            getPrompt: async () => ({
              description: 'Summarize a document',
              messages: [
                {
                  role: 'user' as const,
                  content: { type: 'text' as const, text: 'Summarize ${topic}' },
                },
              ],
            }),
          }
        : undefined,
  } as unknown as McpManager
}

describe('MCP agent tools', () => {
  it('#then creates the resource and prompt tool set', () => {
    const tools = createMcpAgentTools(createManagerStub())

    expect(tools.map((tool) => tool.name)).toEqual([
      'mcp_list_resources',
      'mcp_read_resource',
      'mcp_list_prompts',
      'mcp_get_prompt',
    ])
    expect(tools.every((tool) => tool.readonly === true)).toBe(true)
  })

  it('#then lists MCP resources with server and URI', async () => {
    const tool = createMcpListResourcesTool(createManagerStub())

    const result = await tool.execute({
      id: 'call_1',
      params: { query: 'guide' },
      signal: new AbortController().signal,
    })

    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toContain(
      'docs: Guide',
    )
    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toContain(
      'file:///guide.md',
    )
  })

  it('#then reads MCP resources from the selected server', async () => {
    const tool = createMcpReadResourceTool(createManagerStub())

    const result = await tool.execute({
      id: 'call_1',
      params: { serverName: 'docs', uri: 'file:///guide.md' },
      signal: new AbortController().signal,
    })

    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toBe('# Guide')
  })

  it('#then returns an error for unknown MCP servers', async () => {
    const tool = createMcpReadResourceTool(createManagerStub())

    const result = await tool.execute({
      id: 'call_1',
      params: { serverName: 'missing', uri: 'file:///guide.md' },
      signal: new AbortController().signal,
    })

    expect(result.isError).toBe(true)
  })

  it('#then lists MCP prompts with required arguments', async () => {
    const tool = createMcpListPromptsTool(createManagerStub())

    const result = await tool.execute({
      id: 'call_1',
      params: {},
      signal: new AbortController().signal,
    })

    const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
    expect(text).toContain('docs: summarize')
    expect(text).toContain('topic*')
  })
})
