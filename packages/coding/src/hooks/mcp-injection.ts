import type { HookSpec } from '@vitamin/hooks'
import { defineHook } from '@vitamin/hooks'
import { appendPromptSection } from '@vitamin/prompt'
import type { McpManager } from '@vitamin/tools'

export function createMcpContextHook(manager: McpManager): HookSpec {
  return defineHook({
    name: 'mcp-context-injection',
    timing: 'system-prompt.sections.transform',
    priority: 24,
    handle: async (_input, output) => {
      const content = buildMcpContextSection(manager)
      if (!content) {
        return
      }

      output.assembly = appendPromptSection(output.assembly, {
        key: 'mcp-context',
        content,
        layer: 'dynamic',
        cacheable: false,
        source: 'mcp-manager',
        priority: 24,
      })
    },
  })
}

export function buildMcpContextSection(manager: McpManager): string {
  const servers = manager.getServerInfos()
  const readyServers = servers.filter((server) => server.status === 'ready')
  const resources = manager.getAllResources()
  const prompts = manager.getAllPrompts()
  const instructions = manager.getServerInstructions()

  if (
    readyServers.length === 0 &&
    resources.length === 0 &&
    prompts.length === 0 &&
    instructions.length === 0
  ) {
    return ''
  }

  const lines = ['### MCP Context', '']
  lines.push(
    `Connected MCP servers: ${
      readyServers.length > 0 ? readyServers.map((server) => server.name).join(', ') : 'none'
    }`,
  )

  if (instructions.length > 0) {
    lines.push('', 'Server instructions:')
    for (const item of instructions) {
      lines.push(`- ${item.serverName}: ${item.instructions}`)
    }
  }

  if (resources.length > 0) {
    lines.push('', 'Resources:')
    for (const resource of resources) {
      lines.push(`- ${resource.serverName}: ${resource.name} (${resource.uri})`)
    }
  }

  if (prompts.length > 0) {
    lines.push('', 'Prompts:')
    for (const prompt of prompts) {
      lines.push(`- ${prompt.serverName}: ${prompt.name}`)
    }
  }

  lines.push('', 'Use mcp_read_resource or mcp_get_prompt to load MCP content on demand.')
  return lines.join('\n')
}
