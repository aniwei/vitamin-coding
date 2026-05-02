import { z } from 'zod'
import type { AgentTool, ToolResult } from '@x-mars/agent'
import type { McpManager } from './mcp-manager'
import type { McpPromptMessage, McpResourceContents } from './types'

const ListResourcesArgs = z.object({
  query: z.string().optional().describe('Optional resource name/description/URI filter'),
  serverName: z.string().optional().describe('Optional MCP server name filter'),
})

const ReadResourceArgs = z.object({
  serverName: z.string().describe('MCP server name'),
  uri: z.string().describe('Resource URI to read'),
})

const ListPromptsArgs = z.object({
  query: z.string().optional().describe('Optional prompt name/description filter'),
  serverName: z.string().optional().describe('Optional MCP server name filter'),
})

const GetPromptArgs = z.object({
  serverName: z.string().describe('MCP server name'),
  name: z.string().describe('Prompt name'),
  arguments: z.record(z.string(), z.string()).optional().describe('Prompt arguments'),
})

export function createMcpListResourcesTool(
  manager: McpManager,
): AgentTool<z.infer<typeof ListResourcesArgs>> {
  return {
    name: 'mcp_list_resources',
    description: 'List available MCP resources across connected MCP servers.',
    parameters: ListResourcesArgs,
    readonly: true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    async execute({ params }): Promise<ToolResult> {
      const query = params.query?.toLowerCase()
      const resources = manager
        .getAllResources()
        .filter((resource) => !params.serverName || resource.serverName === params.serverName)
        .filter((resource) => {
          if (!query) {
            return true
          }
          return [resource.uri, resource.name, resource.description ?? '']
            .join('\n')
            .toLowerCase()
            .includes(query)
        })

      if (resources.length === 0) {
        return { content: [{ type: 'text', text: 'No MCP resources found.' }] }
      }

      return {
        content: [
          {
            type: 'text',
            text: resources
              .map((resource) =>
                [
                  `- ${resource.serverName}: ${resource.name}`,
                  `  uri: ${resource.uri}`,
                  resource.description ? `  description: ${resource.description}` : undefined,
                  resource.mimeType ? `  mimeType: ${resource.mimeType}` : undefined,
                ]
                  .filter(Boolean)
                  .join('\n'),
              )
              .join('\n'),
          },
        ],
      }
    },
  }
}

export function createMcpReadResourceTool(
  manager: McpManager,
): AgentTool<z.infer<typeof ReadResourceArgs>> {
  return {
    name: 'mcp_read_resource',
    description: 'Read a resource from a specific MCP server.',
    parameters: ReadResourceArgs,
    readonly: true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    async execute({ params }): Promise<ToolResult> {
      const client = manager.getClient(params.serverName)
      if (!client) {
        return {
          content: [{ type: 'text', text: `MCP server "${params.serverName}" not found.` }],
          isError: true,
        }
      }

      const contents = await client.readResource(params.uri)
      return { content: [{ type: 'text', text: formatResourceContents(contents) }] }
    },
  }
}

export function createMcpListPromptsTool(
  manager: McpManager,
): AgentTool<z.infer<typeof ListPromptsArgs>> {
  return {
    name: 'mcp_list_prompts',
    description: 'List available MCP prompts across connected MCP servers.',
    parameters: ListPromptsArgs,
    readonly: true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    async execute({ params }): Promise<ToolResult> {
      const query = params.query?.toLowerCase()
      const prompts = manager
        .getAllPrompts()
        .filter((prompt) => !params.serverName || prompt.serverName === params.serverName)
        .filter((prompt) => {
          if (!query) {
            return true
          }
          return [prompt.name, prompt.description ?? ''].join('\n').toLowerCase().includes(query)
        })

      if (prompts.length === 0) {
        return { content: [{ type: 'text', text: 'No MCP prompts found.' }] }
      }

      return {
        content: [
          {
            type: 'text',
            text: prompts
              .map((prompt) => {
                const args = prompt.arguments?.map((arg) => `${arg.name}${arg.required ? '*' : ''}`)
                return [
                  `- ${prompt.serverName}: ${prompt.name}`,
                  prompt.description ? `  description: ${prompt.description}` : undefined,
                  args?.length ? `  arguments: ${args.join(', ')}` : undefined,
                ]
                  .filter(Boolean)
                  .join('\n')
              })
              .join('\n'),
          },
        ],
      }
    },
  }
}

export function createMcpGetPromptTool(
  manager: McpManager,
): AgentTool<z.infer<typeof GetPromptArgs>> {
  return {
    name: 'mcp_get_prompt',
    description: 'Get a prompt from a specific MCP server.',
    parameters: GetPromptArgs,
    readonly: true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    async execute({ params }): Promise<ToolResult> {
      const client = manager.getClient(params.serverName)
      if (!client) {
        return {
          content: [{ type: 'text', text: `MCP server "${params.serverName}" not found.` }],
          isError: true,
        }
      }

      const prompt = await client.getPrompt(params.name, params.arguments)
      return {
        content: [
          {
            type: 'text',
            text: [
              prompt.description ? `description: ${prompt.description}` : undefined,
              formatPromptMessages(prompt.messages),
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
        ],
      }
    },
  }
}

export function createMcpAgentTools(
  manager: McpManager,
): Array<
  | AgentTool<z.infer<typeof ListResourcesArgs>>
  | AgentTool<z.infer<typeof ReadResourceArgs>>
  | AgentTool<z.infer<typeof ListPromptsArgs>>
  | AgentTool<z.infer<typeof GetPromptArgs>>
> {
  return [
    createMcpListResourcesTool(manager),
    createMcpReadResourceTool(manager),
    createMcpListPromptsTool(manager),
    createMcpGetPromptTool(manager),
  ]
}

function formatResourceContents(contents: McpResourceContents[]): string {
  if (contents.length === 0) {
    return '(empty resource)'
  }
  return contents
    .map((content) => {
      if (content.text !== undefined) {
        return content.text
      }
      if (content.blob !== undefined) {
        return `[Binary resource: ${content.uri}]`
      }
      return `[Resource: ${content.uri}]`
    })
    .join('\n\n')
}

function formatPromptMessages(messages: McpPromptMessage[]): string {
  if (messages.length === 0) {
    return '(empty prompt)'
  }
  return messages
    .map((message) => {
      const content = message.content
      if (content.type === 'text') {
        return `${message.role}: ${content.text}`
      }
      if (content.type === 'image') {
        return `${message.role}: [Image: ${content.mimeType}]`
      }
      return `${message.role}: ${content.resource.text ?? `[Resource: ${content.resource.uri}]`}`
    })
    .join('\n\n')
}
