// MCP Server — 将 Vitamin AgentTool 暴露为 MCP Server
// 允许外部 MCP 客户端使用 vitamin 的工具
// 参考 open-agent-sdk 的 createSdkMcpServer 模式

import { createLogger } from '@vitamin/shared'
import type { AgentTool } from '@vitamin/agent'
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpServerCapabilities,
  McpToolDefinition,
  McpJsonSchemaProperty,
} from './types'

const logger = createLogger('@vitamin/mcp:server')

const MCP_PROTOCOL_VERSION = '2024-11-05'

export interface McpServerOptions {
  /** 服务器名称 */
  name: string
  /** 服务器版本 */
  version?: string
  /** 可选：暴露的能力 */
  capabilities?: Partial<McpServerCapabilities>
}

/**
 * 轻量级 MCP Server 实现
 * 使用 stdio 传输，将 vitamin AgentTool[] 暴露给外部客户端
 */
export class VitaminMcpServer {
  private tools: AgentTool[]
  private options: McpServerOptions

  constructor(tools: AgentTool[], options: McpServerOptions) {
    this.tools = tools
    this.options = options
  }

  /** 启动 MCP Server（基于 stdio） */
  async start(): Promise<void> {
    logger.info('Starting MCP server "%s"', this.options.name)

    // 使用 process stdin/stdout 进行通信
    const stdin = process.stdin
    const stdout = process.stdout

    let buffer = ''

    stdin.setEncoding('utf8')
    stdin.on('data', (chunk: string) => {
      buffer += chunk

      // Content-Length framing
      while (true) {
        const headerEnd = buffer.indexOf('\r\n\r\n')
        if (headerEnd === -1) {
          break
        }

        const header = buffer.substring(0, headerEnd)
        const match = header.match(/Content-Length:\s*(\d+)/i)
        if (!match) {
          buffer = buffer.substring(headerEnd + 4)
          continue
        }

        const contentLength = parseInt(match[1]!, 10)
        const bodyStart = headerEnd + 4

        if (buffer.length < bodyStart + contentLength) {
          break
        }

        const body = buffer.substring(bodyStart, bodyStart + contentLength)
        buffer = buffer.substring(bodyStart + contentLength)

        try {
          const message = JSON.parse(body) as JsonRpcRequest
          void this.handleRequest(message, stdout)
        } catch (err) {
          logger.error('Failed to parse MCP message: %s', (err as Error).message)
        }
      }
    })

    stdin.on('end', () => {
      logger.info('MCP server stdin closed')
    })
  }

  private async handleRequest(request: JsonRpcRequest, stdout: NodeJS.WriteStream): Promise<void> {
    let response: JsonRpcResponse

    try {
      switch (request.method) {
        case 'initialize':
          response = this.handleInitialize(request)
          break
        case 'notifications/initialized':
          // 客户端确认初始化，不需要回复
          return
        case 'tools/list':
          response = this.handleToolsList(request)
          break
        case 'tools/call':
          response = await this.handleToolsCall(request)
          break
        default:
          response = {
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32601, message: `Method not found: ${request.method}` },
          }
      }
    } catch (err) {
      response = {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32603, message: (err as Error).message },
      }
    }

    this.sendResponse(stdout, response)
  }

  private handleInitialize(request: JsonRpcRequest): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
          ...this.options.capabilities,
        },
        serverInfo: {
          name: this.options.name,
          version: this.options.version ?? '0.0.1',
        },
      },
    }
  }

  private handleToolsList(request: JsonRpcRequest): JsonRpcResponse {
    const toolDefs: McpToolDefinition[] = this.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: this.zodToJsonSchema(tool),
    }))

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: { tools: toolDefs },
    }
  }

  private async handleToolsCall(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as
      | { name: string; arguments?: Record<string, unknown> }
      | undefined
    if (!params?.name) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32602, message: 'Missing tool name' },
      }
    }

    const tool = this.tools.find((t) => t.name === params.name)
    if (!tool) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32602, message: `Unknown tool: ${params.name}` },
      }
    }

    try {
      const abortController = new AbortController()
      const result = await tool.execute({
        id: String(request.id),
        params: params.arguments ?? {},
        signal: abortController.signal,
      })

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: (result.content ?? []).map((c) => {
            if (c.type === 'text') {
              return { type: 'text', text: c.text }
            }
            if (c.type === 'image') {
              return { type: 'image', data: c.source, mimeType: c.mime }
            }
            return { type: 'text', text: JSON.stringify(c) }
          }),
          isError: result.isError ?? false,
        },
      }
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [{ type: 'text', text: (err as Error).message }],
          isError: true,
        },
      }
    }
  }

  /** 简化 Zod → JSON Schema 转换（仅用于 server 暴露工具定义） */
  private zodToJsonSchema(_tool: AgentTool): {
    type: string
    properties?: Record<string, McpJsonSchemaProperty>
    required?: string[]
  } {
    // 基础实现：输出 object + 空 properties
    // 完整 Zod→JSON Schema 转换建议使用 zod-to-json-schema 库
    return {
      type: 'object',
      properties: {},
      required: [],
    }
  }

  private sendResponse(stdout: NodeJS.WriteStream, response: JsonRpcResponse): void {
    const body = JSON.stringify(response)
    const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`
    stdout.write(header + body)
  }
}

/**
 * 创建一个 MCP Server，将 vitamin 工具暴露给外部客户端
 */
export function createMcpServer(tools: AgentTool[], options: McpServerOptions): VitaminMcpServer {
  return new VitaminMcpServer(tools, options)
}
