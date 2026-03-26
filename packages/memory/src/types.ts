import type { Message } from '@vitamin/ai'

// 统一的上下文大小度量方式
export type ContextSize =
  | ['tokens', number]     // 绝对 token 数
  | ['messages', number]   // 消息条数
  | ['fraction', number]   // 占上下文窗口的比例 (0-1)

// 存储类型标识
export type StorageType = 'local' | 'remote' | 'memory'

// 知识来源 
export interface MemorySource {
  /** 文件路径（支持 ~ 展开） */
  path: string
  /** 是否可写（Agent 是否可以 edit_file 写回） */
  writable: boolean
}

// 知识存储后端
export interface MemoryStore {
  /** 加载所有 sources 的内容 */
  load(sources: MemorySource[]): Promise<Map<string, string>>
  /** 写入指定 source（仅 writable=true 的 source 允许） */
  write(path: string, content: string): Promise<void>
  /** 监听文件变更（可选，支持热重载） */
  watch?(sources: MemorySource[], onChange: (path: string) => void): () => void
}

export interface PruneConfig {
  /** 触发 prune 的 token 阈值 */
  trigger: ContextSize
  /** 保留最近的消息不被 prune */
  protect: ContextSize
  /** 最少需要裁剪多少 token 才执行（避免频繁小幅修剪） */
  minimum: number
  /** 受保护不被 prune 的 tool 名称 */
  protectedTools: string[]
  /** 需要裁剪参数的 tool 名称 */
  truncateTools: string[]
  /** 参数截断最大保留长度（字符） */
  truncateMaxLength: number
}

export interface PruneResult {
  /** prune 后的消息列表 */
  messages: Message[]
  /** 被 prune 的 tool call 数量 */
  prunedCount: number
  /** 估算节省的 token 数 */
  tokensSaved: number
  /** 是否有实际变更 */
  changed: boolean
}

export interface CompactionConfig {
  /** 是否启用自动压缩 */
  enabled: boolean
  /** 触发压缩的 token 阈值 */
  trigger: ContextSize
  /** 压缩后保留的最近 token 量 */
  keepRecent: ContextSize
  /** 为摘要预留的 token 空间 */
  reserveTokens: number
  /** 自定义摘要指令（追加到默认 prompt） */
  customInstructions?: string
}

/** 切点 — 决定消息列表中哪里开始保留 */
export interface CutPoint {
  /** 第一个保留的消息索引 */
  firstKeptIndex: number
  /** 如果切在 turn 中间，turn 起始消息的索引 */
  turnStartIndex: number
  /** 是否切在 turn 中间 */
  isSplitTurn: boolean
}

/** 压缩准备结果 */
export interface CompactionPreparation {
  /** 需要被摘要的消息 */
  messagesToSummarize: Message[]
  /** 切在 turn 中间时的 prefix 消息 */
  turnPrefixMessages: Message[]
  /** 保留的消息 */
  preservedMessages: Message[]
  /** 是否切在 turn 中间 */
  isSplitTurn: boolean
  /** 压缩前的 token 数 */
  tokensBefore: number
  /** 上一次压缩的摘要（用于迭代更新） */
  previousSummary?: string
  /** 提取的文件操作记录 */
  fileOps: { read: string[]; modified: string[] }
}

/** 压缩执行结果 */
export interface CompactionResult {
  /** 生成的摘要文本 */
  summary: string
  /** 第一个保留的 entry 索引 */
  firstKeptIndex: number
  /** 压缩前的 token 数 */
  tokensBefore: number
  /** 归档文件路径（如果归档成功） */
  archivePath?: string
}

/** 归档存储后端 */
export interface ArchiveStorage {
  /** 存储类型 */
  readonly type: StorageType
  /** 归档被压缩的消息 */
  archive(sessionId: string, messages: Message[], summary: string): Promise<string>
  /** 读取归档内容 */
  read(archivePath: string): Promise<string>
  /** 列出某 session 的所有归档 */
  list(sessionId: string): Promise<ArchiveEntry[]>
}

export interface ArchiveEntry {
  /** 归档路径或标识符 */
  path: string
  /** 归档时间戳 */
  timestamp: number
  /** 归档消息数 */
  messageCount: number
  /** 摘要缩略 */
  summary: string
}

export interface ContextTokenEstimate {
  /** 总估算 token 数 */
  total: number
  /** 来自 usage 元数据的精确 token 数 */
  fromUsage: number
  /** 来自启发式估算的 token 数 */
  fromEstimate: number
  /** 最后一条带 usage 的消息索引 (-1 表示没有) */
  lastUsageIndex: number
}

export interface MemoryManagerConfig {
  // ── L1 ──
  /** 持久化知识 sources */
  sources?: MemorySource[]
  /** 知识存储后端 */
  memoryStore?: MemoryStore

  // ── L2 ──
  /** 压缩配置 */
  compaction?: Partial<CompactionConfig>
  /** Prune 配置 */
  prune?: Partial<PruneConfig>

  // ── L3 ──
  /** 归档存储后端 */
  archiveStorage?: ArchiveStorage

  // ── 外部依赖注入 ──
  /** 摘要生成函数（从调用方注入，解耦 Provider） */
  summarize: (prompt: string, options?: { maxTokens?: number; signal?: AbortSignal }) => Promise<string>
  /** Token 计数函数 */
  estimateTokens?: (text: string) => number

  // ── 模型信息 ──
  /** 模型参数（用于 model-aware defaults） */
  model?: { contextWindow: number; maxOutput: number }
}

export interface MemoryDefaults {
  compaction: CompactionConfig
  prune: PruneConfig
}

 // StorageProvider — 统一的持久化策略工厂。 
 // 确保 Session 和 Memory 使用一致的存储后端：
 // - local → LocalSessionStorage + LocalArchiveStorage
 // - remote → RemoteSessionStorage + RemoteArchiveStorage
 // - memory → MemorySessionStorage + InMemoryArchiveStorage
export interface StorageProvider {
  /** 存储类型标识 */
  readonly type: StorageType
  /** 创建归档存储 */
  createArchiveStorage(): ArchiveStorage
}

// 本地存储配置
export interface LocalStorageConfig {
  type: 'local'
  /** 覆盖根目录，默认 $VITAMIN_HOME */
  baseDir?: string
}

// 远程存储配置
export interface RemoteStorageConfig {
  type: 'remote'
  /** API 基础 URL */
  baseUrl: string
  /** 认证信息获取函数 */
  getAuth: () => Promise<{ token: string }>
  /** 请求超时 (ms) */
  timeout?: number
  /** 自定义 fetch */
  fetch?: typeof globalThis.fetch
}

/** 内存存储配置 */
export interface MemoryStorageConfig {
  type: 'memory'
}

export type StorageConfig = LocalStorageConfig | RemoteStorageConfig | MemoryStorageConfig
