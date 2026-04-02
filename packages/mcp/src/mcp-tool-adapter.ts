// MCP Tool → AgentTool 适配器
// 将 MCP Server 暴露的 tools 转换为 @vitamin/agent 的 AgentTool 格式
// 从 @vitamin/tools 迁移

import { z } from 'zod'
import { createLogger } from '@vitamin/shared'
import type { AgentTool, ToolResult } from '@vitamin/agent'
import type { McpClient } from './mcp-client'
import type { McpToolDefinition, McpJsonSchemaProperty, McpContent } from './types'

const logger = createLogger('@vitamin/mcp:adapter')

/**
 * 将 MCP JSON Schema property → Zod Schema
 */
export function jsonSchemaPropertyToZod(prop: McpJsonSchemaProperty): z.ZodType {
  switch (prop.type) {
    case 'string':
      if (prop.enum) {
        const values = prop.enum as [string, ...string[]]
        return z.enum(values)
      }
      return prop.description ? z.string().describe(prop.description) : z.string()

    case 'number':
    case 'integer':
      return prop.description ? z.number().describe(prop.description) : z.number()

    case 'boolean':
      return prop.description ? z.boolean().describe(prop.description) : z.boolean()

    case 'array': {
      const itemSchema = prop.items ? jsonSchemaPropertyToZod(prop.items) : z.unknown()
      return prop.description ? z.array(itemSchema).describe(prop.description) : z.array(itemSchema)
    }

    case 'object': {
      if (prop.properties) {
        const shape: Record<string, z.ZodType> = {}
        const requiredSet = new Set(prop.required ?? [])

        for (const [key, value] of Object.entries(prop.properties)) {
          const fieldSchema = jsonSchemaPropertyToZod(value)
          shape[key] = requiredSet.has(key) ? fieldSchema : fieldSchema.optional()
        }

        return prop.description ? z.object(shape).describe(prop.description) : z.object(shape)
      }
      return prop.description
        ? z.record(z.string(), z.unknown()).describe(prop.description)
        : z.record(z.string(), z.unknown())
    }

    default:
      return z.unknown()
  }
}

/**
 * 将 MCP tool inputSchema → Zod schema
 */
export function mcpSchemaToZod(tool: McpToolDefinition): z.ZodType {
  const props = tool.inputSchema.properties
  if (!props || Object.keys(props).length === 0) {
    return z.object({})
  }

  const shape: Record<string, z.ZodType> = {}
  const requiredSet = new Set(tool.inputSchema.required ?? [])

  for (const [key, value] of Object.entries(props)) {
    const fieldSchema = jsonSchemaPropertyToZod(value)
    shape[key] = requiredSet.has(key) ? fieldSchema : fieldSchema.optional()
  }

  return z.object(shape)
}

/**
 * 将 MCP content → ToolResult content
 */
export function mcpContentToToolContent(content: McpContent[]): ToolResult['content'] {
  return content.map((item) => {
    switch (item.type) {
      case 'text':
        return { type: 'text' as const, text: item.text }
      case 'image':
        return {
          type: 'image' as const,
          mime: item.mimeType,
          source: `data:${item.mimeType};base64,${item.data}`,
        }
      case 'resource':
        return {
          type: 'text' as const,
          text: item.resource.text ?? `[Resource: ${item.resource.uri}]`,
        }
      default:
        return { type: 'text' as const, text: JSON.stringify(item) }
    }
  })
}

/**
 * 为单个 MCP tool 创建 AgentTool 适配器
 * 工具名格式: mcp__{serverName}__{toolName}
 */
export function createMcpToolAdapter(
  client: McpClient,
  toolDef: McpToolDefinition,
  serverName: string,
): AgentTool {
  const qualifiedName = `mcp__${serverName}__${toolDef.name}`
  const description = toolDef.description
    ? `[MCP: ${serverName}] ${toolDef.description}`
    : `[MCP: ${serverName}] ${toolDef.name}`

  const parameters = mcpSchemaToZod(toolDef)

  return {
    name: qualifiedName,
    description,
    parameters,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      logger.debug('Calling MCP tool %s on server %s', toolDef.name, serverName)

      const result = await client.callTool({
        name: toolDef.name,
        arguments: params as Record<string, unknown>,
      })

      const content = mcpContentToToolContent(result.content)

      return {
        content: content.length > 0 ? content : [{ type: 'text', text: '(empty result)' }],
        isError: result.isError ?? false,
        details: {
          mcpServer: serverName,
          mcpTool: toolDef.name,
        },
      }
    },
  }
}

/**
 * 为一个 MCP Client 的所有工具创建适配器
 */
export function createMcpToolAdapters(
  client: McpClient,
  serverName: string,
): AgentTool[] {
  const tools = client.getTools()
  return tools.map((toolDef) => createMcpToolAdapter(client, toolDef, serverName))
}
