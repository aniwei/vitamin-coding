// MCP Client — 管理与单个 MCP Server 的连接和交互
// 实现 MCP 2024-11-05 规范的 initialize / tools/list / tools/call
// 扩展支持 resources/list / resources/read / prompts/list / prompts/get

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
  McpServerCapabilities,
  McpResource,
  McpResourceContents,
  McpPrompt,
  McpPromptMessage,
} from './types'

const logger = createLogger('@vitamin/mcp:client')

const MCP_PROTOCOL_VERSION = '2024-11-05'
const MCP_CLIENT_NAME = 'vitamin-coding'
const MCP_CLIENT_VERSION = '0.0.1'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface McpClientOptions {
  /** 请求超时（毫秒），默认 30000 */
  requestTimeoutMs?: number
  /** 自动重连（默认 true） */
  autoReconnect?: boolean
  /** 最大重连次数（默认 3） */
  maxReconnectAttempts?: number
}

export class McpClient {
  readonly serverName: string
  private transport: McpTransport | null = null
  private config: McpServerConfig
  private options: McpClientOptions

  private status: McpClientStatus = 'disconnected'
  private serverInfo: McpInitializeResult | null = null
  private capabilities: McpServerCapabilities | null = null
  private tools: McpToolDefinition[] = []
  private resources: McpResource[] = []
  private prompts: McpPrompt[] = []
  private nextRequestId = 1
  private pending = new Map<number | string, PendingRequest>()
  // 回调
  private toolsChangedCallback: (() => void) | null = null
  private resourcesChangedCallback: (() => void) | null = null
  private disconnectedCallback: ((reason?: string) => void) | null = null

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

  getResources(): McpResource[] {
    return this.resources
  }

  getPrompts(): McpPrompt[] {
    return this.prompts
  }

  getCapabilities(): McpServerCapabilities | null {
    return this.capabilities
  }

  getServerInfo(): McpInitializeResult | null {
    return this.serverInfo
  }

  onToolsChanged(callback: () => void): void {
    this.toolsChangedCallback = callback
  }

  onResourcesChanged(callback: () => void): void {
    this.resourcesChangedCallback = callback
  }

  onDisconnected(callback: (reason?: string) => void): void {
    this.disconnectedCallback = callback
  }

  // 建立连接并完成 initialize 握手
  async connect(): Promise<void> {
    if (this.status === 'ready') return

    this.status = 'connecting'

    try {
      this.transport = this.createTransport()
      this.transport.onMessage((msg) => this.handleMessage(msg))
      await this.transport.start()

      // initialize 握手
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

      this.capabilities = this.serverInfo.capabilities
      this.notify('notifications/initialized')

      logger.info(
        'MCP server "%s" connected: %s (protocol %s)',
        this.serverName,
        this.serverInfo.serverInfo.name,
        this.serverInfo.protocolVersion,
      )

      // 获取工具列表
      await this.refreshTools()

      // 获取 resources（如 server 支持）
      if (this.capabilities?.resources) {
        await this.refreshResources()
      }

      // 获取 prompts（如 server 支持）
      if (this.capabilities?.prompts) {
        await this.refreshPrompts()
      }

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

  // 刷新资源列表
  async refreshResources(): Promise<McpResource[]> {
    try {
      const result = await this.request<{ resources: McpResource[] }>('resources/list')
      this.resources = result.resources ?? []

      logger.debug(
        'MCP server "%s" provides %d resources',
        this.serverName,
        this.resources.length,
      )
    } catch (err) {
      logger.debug('MCP server "%s" resources/list failed: %s', this.serverName, (err as Error).message)
      this.resources = []
    }

    return this.resources
  }

  // 读取单个资源
  async readResource(uri: string): Promise<McpResourceContents[]> {
    const result = await this.request<{ contents: McpResourceContents[] }>('resources/read', { uri })
    return result.contents ?? []
  }

  // 刷新 prompt 列表
  async refreshPrompts(): Promise<McpPrompt[]> {
    try {
      const result = await this.request<{ prompts: McpPrompt[] }>('prompts/list')
      this.prompts = result.prompts ?? []

      logger.debug(
        'MCP server "%s" provides %d prompts',
        this.serverName,
        this.prompts.length,
      )
    } catch (err) {
      logger.debug('MCP server "%s" prompts/list failed: %s', this.serverName, (err as Error).message)
      this.prompts = []
    }

    return this.prompts
  }

  // 获取单个 prompt
  async getPrompt(name: string, args?: Record<string, string>): Promise<{ description?: string; messages: McpPromptMessage[] }> {
    const result = await this.request<{ description?: string; messages: McpPromptMessage[] }>('prompts/get', {
      name,
      arguments: args,
    })
    return result
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

    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new McpError('MCP client disconnected', { code: 'MCP_DISCONNECTED' }))
      this.pending.delete(id)
    }

    this.status = 'disconnected'
    this.tools = []
    this.resources = []
    this.prompts = []
    this.serverInfo = null
    this.capabilities = null
    this.disconnectedCallback?.('client disconnect')
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
      const timeoutMs = this.config.requestTimeoutMs ?? this.options.requestTimeoutMs ?? 30_000

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
    if (!('id' in message) || message.id === undefined) {
      this.handleNotification(message as JsonRpcNotification)
      return
    }

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

      case 'notifications/resources/list_changed':
        logger.info('MCP server "%s" notified resources list changed', this.serverName)
        void this.refreshResources().then(() => {
          this.resourcesChangedCallback?.()
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
