import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createLogger } from '@vitamin/shared'
import { EXT_TO_LANG } from './constants'
import type { Diagnostic, ResolvedServer } from './types'

const logger = createLogger('@vitamin/tools:lsp')

// ─── JSON-RPC transport (hand-written, no vscode-jsonrpc needed) ────────────

const CONTENT_LENGTH = 'Content-Length: '

function encodeMessage(body: string): Buffer {
  const buf = Buffer.from(body, 'utf-8')
  return Buffer.concat([Buffer.from(`Content-Length: ${buf.byteLength}\r\n\r\n`, 'ascii'), buf])
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class LSPClient {
  private process: ChildProcess | null = null
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private buffer = Buffer.alloc(0)
  private contentLength = -1
  private processExited = false
  private stderrBuffer: string[] = []
  private diagnosticsStore = new Map<string, Diagnostic[]>()

  private openedFiles = new Set<string>()
  private documentVersions = new Map<string, number>()
  private lastSyncedText = new Map<string, string>()

  private readonly REQUEST_TIMEOUT = 15_000

  constructor(
    private readonly root: string,
    private readonly server: ResolvedServer,
  ) {}

  async start(): Promise<void> {
    const cwdValidation = validateCwd(this.root)
    if (!cwdValidation.valid) {
      throw new Error(`[LSP] ${cwdValidation.error}`)
    }

    if (this.server.command.length === 0) {
      throw new Error('[LSP] Server command is empty')
    }

    const [cmd, ...args] = this.server.command
    if (!cmd) {
      throw new Error('[LSP] Server command is empty')
    }
    this.process = spawn(cmd, args, {
      cwd: this.root,
      env: { ...process.env, ...this.server.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const proc = this.process

    proc.on('exit', (code) => {
      this.processExited = true
      logger.debug(`LSP server exited with code ${code}`)
    })

    proc.on('error', (err) => {
      this.processExited = true
      logger.error(`LSP spawn error: ${err.message}`)
    })

    // 等待片刻以检测进程是否立即崩溃
    await new Promise((r) => setTimeout(r, 100))

    if (proc.exitCode !== null) {
      const stderr = this.stderrBuffer.join('\n')
      throw new Error(
        `LSP server exited immediately with code ${proc.exitCode}${stderr ? `\nstderr: ${stderr}` : ''}`,
      )
    }

    // 连接 stdout 解析器
    proc.stdout?.on('data', (chunk: Buffer) => {
      this.processBuffer(chunk)
    })

    // 连接 stderr
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      this.stderrBuffer.push(text)
      if (this.stderrBuffer.length > 100) {
        this.stderrBuffer.shift()
      }
    })

    // 处理服务器主动发起的通知/请求（publishDiagnostics、workspace/configuration 等在 onMessage 中处理）
  }

  async initialize(): Promise<void> {
    const rootUri = pathToFileURL(this.root).href
    await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri,
      rootPath: this.root,
      workspaceFolders: [{ uri: rootUri, name: 'workspace' }],
      capabilities: {
        textDocument: {
          hover: { contentFormat: ['markdown', 'plaintext'] },
          definition: { linkSupport: true },
          references: {},
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          publishDiagnostics: {},
          rename: {
            prepareSupport: true,
            prepareSupportDefaultBehavior: 1,
            honorsChangeAnnotations: true,
          },
          codeAction: {
            codeActionLiteralSupport: {
              codeActionKind: {
                valueSet: [
                  'quickfix',
                  'refactor',
                  'refactor.extract',
                  'refactor.inline',
                  'refactor.rewrite',
                  'source',
                  'source.organizeImports',
                  'source.fixAll',
                ],
              },
            },
            isPreferredSupport: true,
            disabledSupport: true,
            dataSupport: true,
            resolveSupport: { properties: ['edit', 'command'] },
          },
        },
        workspace: {
          symbol: {},
          workspaceFolders: true,
          configuration: true,
          applyEdit: true,
          workspaceEdit: { documentChanges: true },
        },
      },
      ...this.server.initialization,
    })

    this.sendNotification('initialized')
    this.sendNotification('workspace/didChangeConfiguration', {
      settings: { json: { validate: { enable: true } } },
    })

    await new Promise((r) => setTimeout(r, 300))
  }

  async stop(): Promise<void> {
    // 拒绝所有未完成的请求
    for (const [, req] of this.pending) {
      clearTimeout(req.timer)
      req.reject(new Error('LSP client stopping'))
    }
    this.pending.clear()

    if (!this.processExited && this.process) {
      try {
        this.sendNotification('shutdown')
        this.sendNotification('exit')
      } catch {
        /* intentional */
      }

      const proc = this.process
      this.process = null

      // 等待优雅退出
      const exited = await Promise.race([
        new Promise<boolean>((res) => proc.on('exit', () => res(true))),
        new Promise<boolean>((res) => setTimeout(() => res(false), 5000)),
      ])

      if (!exited) {
        logger.debug('LSP process did not exit within timeout, sending SIGKILL')
        try {
          proc.kill('SIGKILL')
        } catch {
          /* intentional */
        }
      }
    }

    this.processExited = true
    this.process = null
    this.diagnosticsStore.clear()
    this.openedFiles.clear()
    this.documentVersions.clear()
    this.lastSyncedText.clear()
  }

  isAlive(): boolean {
    return this.process !== null && !this.processExited && this.process.exitCode === null
  }

  // ─── JSON-RPC protocol ─────────────────────────────────────────────────

  private processBuffer(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])

    while (true) {
      if (this.contentLength === -1) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n')
        if (headerEnd === -1) {
          break
        }

        const header = this.buffer.subarray(0, headerEnd).toString('ascii')
        for (const line of header.split('\r\n')) {
          if (line.startsWith(CONTENT_LENGTH)) {
            this.contentLength = parseInt(line.slice(CONTENT_LENGTH.length), 10)
          }
        }

        if (this.contentLength === -1) {
          // 头部格式错误 — 丢弃直到 headerEnd
          this.buffer = this.buffer.subarray(headerEnd + 4)
          continue
        }

        this.buffer = this.buffer.subarray(headerEnd + 4)
      }

      if (this.buffer.length < this.contentLength) {
        break
      }

      const body = this.buffer.subarray(0, this.contentLength).toString('utf-8')
      this.buffer = this.buffer.subarray(this.contentLength)
      this.contentLength = -1

      try {
        this.onMessage(JSON.parse(body))
      } catch (err) {
        logger.error(`Failed to parse LSP message: ${err}`)
      }
    }
  }

  private onMessage(msg: Record<string, unknown>): void {
    // 响应我方发出的请求
    if ('id' in msg && ('result' in msg || 'error' in msg)) {
      const id = msg.id as number
      const pending = this.pending.get(id)
      if (pending) {
        this.pending.delete(id)
        clearTimeout(pending.timer)
        if ('error' in msg) {
          const err = msg.error as { message: string; code?: number }
          pending.reject(new Error(`LSP error ${err.code ?? ''}: ${err.message}`))
        } else {
          pending.resolve(msg.result)
        }
      }
      return
    }

    const method = msg.method as string | undefined
    if (!method) {
      return
    }

    // 服务器主动发起的通知
    if (!('id' in msg)) {
      if (method === 'textDocument/publishDiagnostics') {
        const params = msg.params as { uri?: string; diagnostics?: Diagnostic[] }
        if (params.uri) {
          this.diagnosticsStore.set(params.uri, params.diagnostics ?? [])
        }
      }
      return
    }

    // 服务器主动发起的请求（需要响应）
    const id = msg.id as number
    if (method === 'workspace/configuration') {
      const params = msg.params as { items?: Array<{ section?: string }> }
      const items = params?.items ?? []
      const result = items.map((item) => {
        if (item.section === 'json') {
          return { validate: { enable: true } }
        }
        return {}
      })
      this.respond(id, result)
    } else if (
      method === 'client/registerCapability' ||
      method === 'window/workDoneProgress/create'
    ) {
      this.respond(id, null)
    } else {
      // 未知的服务器请求 — 回复 null
      this.respond(id, null)
    }
  }

  private sendRequest<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.process?.stdin?.writable) {
      throw new Error('LSP client not started')
    }

    if (this.processExited || (this.process && this.process.exitCode !== null)) {
      const stderr = this.stderrBuffer.slice(-10).join('\n')
      throw new Error(
        `LSP server already exited (code: ${this.process?.exitCode})${stderr ? `\nstderr: ${stderr}` : ''}`,
      )
    }

    const id = this.nextId++

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        const stderr = this.stderrBuffer.slice(-5).join('\n')
        reject(
          new Error(
            `LSP request timeout (method: ${method})${stderr ? `\nrecent stderr: ${stderr}` : ''}`,
          ),
        )
      }, this.REQUEST_TIMEOUT)

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })

      const body = JSON.stringify({ jsonrpc: '2.0', id, method, params })
      this.process?.stdin?.write(encodeMessage(body))
    })
  }

  private sendNotification(method: string, params?: unknown): void {
    if (!this.process?.stdin?.writable) {
      return
    }
    if (this.processExited || (this.process && this.process.exitCode !== null)) {
      return
    }

    const body = JSON.stringify({ jsonrpc: '2.0', method, params })
    this.process.stdin.write(encodeMessage(body))
  }

  private respond(id: number, result: unknown): void {
    if (!this.process?.stdin?.writable) {
      return
    }
    const body = JSON.stringify({ jsonrpc: '2.0', id, result })
    this.process.stdin.write(encodeMessage(body))
  }

  // ─── Document management ───────────────────────────────────────────────

  async openFile(filePath: string): Promise<void> {
    const absPath = resolve(filePath)
    const uri = pathToFileURL(absPath).href
    const text = readFileSync(absPath, 'utf-8')

    if (!this.openedFiles.has(absPath)) {
      const ext = extname(absPath)
      const languageId = EXT_TO_LANG[ext] || 'plaintext'
      const version = 1

      this.sendNotification('textDocument/didOpen', {
        textDocument: { uri, languageId, version, text },
      })

      this.openedFiles.add(absPath)
      this.documentVersions.set(uri, version)
      this.lastSyncedText.set(uri, text)
      await new Promise((r) => setTimeout(r, 1000))
      return
    }

    const prevText = this.lastSyncedText.get(uri)
    if (prevText === text) {
      return
    }

    const nextVersion = (this.documentVersions.get(uri) ?? 1) + 1
    this.documentVersions.set(uri, nextVersion)
    this.lastSyncedText.set(uri, text)

    this.sendNotification('textDocument/didChange', {
      textDocument: { uri, version: nextVersion },
      contentChanges: [{ text }],
    })

    this.sendNotification('textDocument/didSave', {
      textDocument: { uri },
      text,
    })
  }

  // ─── LSP operations ────────────────────────────────────────────────────

  async definition(filePath: string, line: number, character: number): Promise<unknown> {
    const absPath = resolve(filePath)
    await this.openFile(absPath)
    return this.sendRequest('textDocument/definition', {
      textDocument: { uri: pathToFileURL(absPath).href },
      position: { line: line - 1, character },
    })
  }

  async references(
    filePath: string,
    line: number,
    character: number,
    includeDeclaration = true,
  ): Promise<unknown> {
    const absPath = resolve(filePath)
    await this.openFile(absPath)
    return this.sendRequest('textDocument/references', {
      textDocument: { uri: pathToFileURL(absPath).href },
      position: { line: line - 1, character },
      context: { includeDeclaration },
    })
  }

  async documentSymbols(filePath: string): Promise<unknown> {
    const absPath = resolve(filePath)
    await this.openFile(absPath)
    return this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri: pathToFileURL(absPath).href },
    })
  }

  async workspaceSymbols(query: string): Promise<unknown> {
    return this.sendRequest('workspace/symbol', { query })
  }

  async diagnostics(filePath: string): Promise<{ items: Diagnostic[] }> {
    const absPath = resolve(filePath)
    const uri = pathToFileURL(absPath).href
    await this.openFile(absPath)
    await new Promise((r) => setTimeout(r, 500))

    try {
      const result = await this.sendRequest<{ items?: Diagnostic[] }>('textDocument/diagnostic', {
        textDocument: { uri },
      })
      if (result && typeof result === 'object' && 'items' in result) {
        return result as { items: Diagnostic[] }
      }
    } catch {
      /* intentional */
    }

    return { items: this.diagnosticsStore.get(uri) ?? [] }
  }

  async prepareRename(filePath: string, line: number, character: number): Promise<unknown> {
    const absPath = resolve(filePath)
    await this.openFile(absPath)
    return this.sendRequest('textDocument/prepareRename', {
      textDocument: { uri: pathToFileURL(absPath).href },
      position: { line: line - 1, character },
    })
  }

  async rename(
    filePath: string,
    line: number,
    character: number,
    newName: string,
  ): Promise<unknown> {
    const absPath = resolve(filePath)
    await this.openFile(absPath)
    return this.sendRequest('textDocument/rename', {
      textDocument: { uri: pathToFileURL(absPath).href },
      position: { line: line - 1, character },
      newName,
    })
  }
}

// ─── LSP Server Manager (singleton with ref-counting) ────────────────────────

interface ManagedClient {
  client: LSPClient
  lastUsedAt: number
  refCount: number
  initPromise?: Promise<void>
  isInitializing: boolean
  initializingSince?: number
}

type ProcessCleanupHandle = { unregister: () => void }

class LSPServerManager {
  private static instance: LSPServerManager
  private clients = new Map<string, ManagedClient>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null
  private cleanupHandle: ProcessCleanupHandle | null = null
  private readonly IDLE_TIMEOUT = 5 * 60 * 1000
  private readonly INIT_TIMEOUT = 60 * 1000

  private constructor() {
    this.startCleanupTimer()
    this.registerProcessCleanup()
  }

  static getInstance(): LSPServerManager {
    if (!LSPServerManager.instance) {
      LSPServerManager.instance = new LSPServerManager()
    }
    return LSPServerManager.instance
  }

  private getKey(root: string, serverId: string): string {
    return `${root}::${serverId}`
  }

  private startCleanupTimer(): void {
    if (this.cleanupInterval) {
      return
    }
    this.cleanupInterval = setInterval(() => this.cleanupIdleClients(), 60_000)
    // 不阻止进程仅为清理而存活
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref()
    }
  }

  private cleanupIdleClients(): void {
    const now = Date.now()
    for (const [key, managed] of this.clients) {
      if (managed.refCount === 0 && now - managed.lastUsedAt > this.IDLE_TIMEOUT) {
        void managed.client.stop()
        this.clients.delete(key)
      }
    }
  }

  private registerProcessCleanup(): void {
    const handlers: Array<{ event: string; listener: (...args: unknown[]) => void }> = []

    const syncCleanup = () => {
      for (const [, managed] of this.clients) {
        try {
          void managed.client.stop().catch(() => {})
        } catch {
          /* intentional */
        }
      }
      this.clients.clear()
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval)
        this.cleanupInterval = null
      }
    }

    const asyncCleanup = async () => {
      const promises: Promise<void>[] = []
      for (const [, managed] of this.clients) {
        promises.push(managed.client.stop().catch(() => {}))
      }
      await Promise.allSettled(promises)
      this.clients.clear()
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval)
        this.cleanupInterval = null
      }
    }

    const register = (event: string, listener: (...args: unknown[]) => void) => {
      handlers.push({ event, listener })
      process.on(event, listener)
    }

    register('exit', syncCleanup)
    const signalCleanup = () => void asyncCleanup().catch(() => {})
    register('SIGINT', signalCleanup)
    register('SIGTERM', signalCleanup)

    this.cleanupHandle = {
      unregister: () => {
        for (const { event, listener } of handlers) {
          process.off(event, listener)
        }
        handlers.length = 0
      },
    }
  }

  async getClient(root: string, server: ResolvedServer): Promise<LSPClient> {
    const key = this.getKey(root, server.id)
    let managed = this.clients.get(key)

    // 处理过期的初始化
    if (managed) {
      const now = Date.now()
      if (
        managed.isInitializing &&
        managed.initializingSince !== undefined &&
        now - managed.initializingSince >= this.INIT_TIMEOUT
      ) {
        try {
          await managed.client.stop()
        } catch {
          /* intentional */
        }
        this.clients.delete(key)
        managed = undefined
      }
    }

    // 等待已有的初始化完成
    if (managed) {
      if (managed.initPromise) {
        try {
          await managed.initPromise
        } catch {
          try {
            await managed.client.stop()
          } catch {
            /* intentional */
          }
          this.clients.delete(key)
          managed = undefined
        }
      }

      if (managed) {
        if (managed.client.isAlive()) {
          managed.refCount++
          managed.lastUsedAt = Date.now()
          return managed.client
        }
        try {
          await managed.client.stop()
        } catch {
          /* intentional */
        }
        this.clients.delete(key)
      }
    }

    // 创建新客户端
    const client = new LSPClient(root, server)
    const initStartedAt = Date.now()
    const initPromise = (async () => {
      await client.start()
      await client.initialize()
    })()

    this.clients.set(key, {
      client,
      lastUsedAt: initStartedAt,
      refCount: 1,
      initPromise,
      isInitializing: true,
      initializingSince: initStartedAt,
    })

    try {
      await initPromise
    } catch (error) {
      this.clients.delete(key)
      try {
        await client.stop()
      } catch {
        /* intentional */
      }
      throw error
    }

    const m = this.clients.get(key)
    if (m) {
      m.initPromise = undefined
      m.isInitializing = false
      m.initializingSince = undefined
    }

    return client
  }

  warmupClient(root: string, server: ResolvedServer): void {
    const key = this.getKey(root, server.id)
    if (this.clients.has(key)) {
      return
    }

    const client = new LSPClient(root, server)
    const initStartedAt = Date.now()
    const initPromise = (async () => {
      await client.start()
      await client.initialize()
    })()

    this.clients.set(key, {
      client,
      lastUsedAt: initStartedAt,
      refCount: 0,
      initPromise,
      isInitializing: true,
      initializingSince: initStartedAt,
    })

    initPromise
      .then(() => {
        const m = this.clients.get(key)
        if (m) {
          m.initPromise = undefined
          m.isInitializing = false
          m.initializingSince = undefined
        }
      })
      .catch(() => {
        this.clients.delete(key)
        void client.stop().catch(() => {})
      })
  }

  releaseClient(root: string, serverId: string): void {
    const key = this.getKey(root, serverId)
    const managed = this.clients.get(key)
    if (managed && managed.refCount > 0) {
      managed.refCount--
      managed.lastUsedAt = Date.now()
    }
  }

  isServerInitializing(root: string, serverId: string): boolean {
    const key = this.getKey(root, serverId)
    return this.clients.get(key)?.isInitializing ?? false
  }

  async stopAll(): Promise<void> {
    this.cleanupHandle?.unregister()
    this.cleanupHandle = null
    for (const [, managed] of this.clients) {
      await managed.client.stop()
    }
    this.clients.clear()
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}

export const lspManager = LSPServerManager.getInstance()

// ─── Utilities ─────────────────────────────────────────────────────────────

export function validateCwd(cwd: string): { valid: boolean; error?: string } {
  try {
    if (!existsSync(cwd)) {
      return { valid: false, error: `Working directory does not exist: ${cwd}` }
    }
    const stats = statSync(cwd)
    if (!stats.isDirectory()) {
      return { valid: false, error: `Path is not a directory: ${cwd}` }
    }
    return { valid: true }
  } catch (err) {
    return {
      valid: false,
      error: `Cannot access working directory: ${cwd} (${err instanceof Error ? err.message : String(err)})`,
    }
  }
}
