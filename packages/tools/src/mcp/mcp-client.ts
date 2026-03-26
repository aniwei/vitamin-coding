// MCP Client — 管理与单个 MCP Server 的连接和交互
// 实现 MCP 2024-11-05 规范的 initialize / tools/list / tools/call 流程

import { McpError, createLogger } from '@vitamin/shared'
import { StdioTransport, SseTransport } from './transport'

import type { McpTransport } from './transport'
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  McpInitializeResult,
  McpToolDefinition,
  McpToolCallParams,
  McpToolCallResult,
  McpServerConfig,
  McpClientStatus,
} from './types'

const logger = createLogger('@vitamin/tools:mcp-client')

const MCP_PROTOCOL_VERSION = '2024-11-05'
const MCP_CLIENT_NAME = 'vitamin-coding'
const MCP_CLIENT_VERSION = '0.0.1'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface McpClientOptions {
  // 请求超时（毫秒）
  requestTimeoutMs?: number
}

export class McpClient {
  readonly serverName: string
  private transport: McpTransport | null = null
  private config: McpServerConfig
  private options: McpClientOptions

  private status: McpClientStatus = 'disconnected'
  private serverInfo: McpInitializeResult | null = null
  private tools: McpToolDefinition[] = []
  private nextRequestId = 1
  private pending = new Map<number | string, PendingRequest>()
  private toolsChangedCallback: (() => void) | null = null

  constructor(serverName: string, config: McpServerConfig, options: McpClientOptions = {}) {
    this.serverName = serverName
    this.config = config
    this.options = options
  }

  getStatus(): McpClientStatus {
    return this.status
  }

  getTools(): McpToolDefinition[] {
    return this.tools
  }

  getServerInfo(): McpInitializeResult | null {
    return this.serverInfo
  }

  onToolsChanged(callback: () => void): void {
    this.toolsChangedCallback = callback
  }

  // 建立连接并完成 initialize 握手
  async connect(): Promise<void> {
    if (this.status === 'ready') return

    this.status = 'connecting'

    try {
      this.transport = this.createTransport()
      this.transport.onMessage((msg) => this.handleMessage(msg))

      // 启动传输
      if (this.transport instanceof StdioTransport || this.transport instanceof SseTransport) {
        await this.transport.start()
      }

      // 发送 initialize 请求
      this.serverInfo = await this.request<McpInitializeResult>('initialize', {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          roots: { listChanged: false },
        },
        clientInfo: {
          name: MCP_CLIENT_NAME,
          version: MCP_CLIENT_VERSION,
        },
      })

      // 发送 initialized 通知
      this.notify('notifications/initialized')

      logger.info(
        'MCP server "%s" connected: %s (protocol %s)',
        this.serverName,
        this.serverInfo.serverInfo.name,
        this.serverInfo.protocolVersion,
      )

      // 获取工具列表
      await this.refreshTools()

      this.status = 'ready'
    } catch (err) {
      this.status = 'error'
      const message = err instanceof Error ? err.message : String(err)
      logger.error('MCP server "%s" connection failed: %s', this.serverName, message)
      throw new McpError(
        `Failed to connect to MCP server "${this.serverName}": ${message}`,
        { code: 'MCP_CONNECT_ERROR', cause: err instanceof Error ? err : undefined },
      )
    }
  }

  // 刷新工具列表
  async refreshTools(): Promise<McpToolDefinition[]> {
    const result = await this.request<{ tools: McpToolDefinition[] }>('tools/list')
    this.tools = result.tools ?? []

    logger.debug(
      'MCP server "%s" provides %d tools: %s',
      this.serverName,
      this.tools.length,
      this.tools.map((t) => t.name).join(', '),
    )

    return this.tools
  }

  // 调用 MCP 工具
  async callTool(params: McpToolCallParams): Promise<McpToolCallResult> {
    if (this.status !== 'ready') {
      throw new McpError(
        `MCP server "${this.serverName}" is not ready (status: ${this.status})`,
        { code: 'MCP_NOT_READY' },
      )
    }

    const result = await this.request<McpToolCallResult>('tools/call', params as unknown as Record<string, unknown>)
    return result
  }

  // 断开连接
  async disconnect(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.close()
      } catch (err) {
        logger.debug('Error closing MCP transport: %s', (err as Error).message)
      }
      this.transport = null
    }

    // 拒绝所有待处理请求
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new McpError('MCP client disconnected', { code: 'MCP_DISCONNECTED' }))
      this.pending.delete(id)
    }

    this.status = 'disconnected'
    this.tools = []
    this.serverInfo = null
  }

  // ─── 内部方法 ───

  private createTransport(): McpTransport {
    if (this.config.url) {
      return new SseTransport(this.config.url)
    }

    if (this.config.command) {
      return new StdioTransport(
        this.config.command,
        this.config.args ?? [],
        this.config.env ?? {},
      )
    }

    throw new McpError(
      `MCP server "${this.serverName}" has no command or url configured`,
      { code: 'MCP_CONFIG_ERROR' },
    )
  }

  private request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.nextRequestId++
      const timeoutMs = this.options.requestTimeoutMs ?? 30_000

      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new McpError(
          `MCP request "${method}" timed out after ${timeoutMs}ms`,
          { code: 'MCP_TIMEOUT' },
        ))
      }, timeoutMs)

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })

      const message: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        ...(params !== undefined && { params }),
      }

      try {
        this.transport!.send(message)
      } catch (err) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(err)
      }
    })
  }

  private notify(method: string, params?: Record<string, unknown>): void {
    const message: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined && { params }),
    }

    try {
      this.transport!.send(message)
    } catch (err) {
      logger.debug('Failed to send MCP notification "%s": %s', method, (err as Error).message)
    }
  }

  private handleMessage(message: JsonRpcResponse | JsonRpcNotification): void {
    // 处理通知
    if (!('id' in message) || message.id === undefined) {
      this.handleNotification(message as JsonRpcNotification)
      return
    }

    // 处理响应
    const response = message as JsonRpcResponse
    const pending = this.pending.get(response.id!)
    if (!pending) {
      logger.debug('Received response for unknown request id: %s', response.id)
      return
    }

    clearTimeout(pending.timer)
    this.pending.delete(response.id!)

    if (response.error) {
      pending.reject(new McpError(
        `MCP error: ${response.error.message} (code: ${response.error.code})`,
        { code: 'MCP_SERVER_ERROR' },
      ))
    } else {
      pending.resolve(response.result)
    }
  }

  private handleNotification(notification: JsonRpcNotification): void {
    switch (notification.method) {
      case 'notifications/tools/list_changed':
        logger.info('MCP server "%s" notified tools list changed', this.serverName)
        void this.refreshTools().then(() => {
          this.toolsChangedCallback?.()
        })
        break
      default:
        logger.debug('MCP notification: %s', notification.method)
    }
  }
}

export function createMcpClient(
  serverName: string,
  config: McpServerConfig,
  options?: McpClientOptions,
): McpClient {
  return new McpClient(serverName, config, options)
}
