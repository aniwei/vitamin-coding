// Agent 记忆管理 — 结构化的消息压缩、摘要和上下文管理
import { createLogger } from '@vitamin/shared'

import type { Message } from '@vitamin/ai'
import type { AgentMessage } from './types'

const log = createLogger('@vitamin/agent:memory')

// 记忆条目 — 保存消息及其元数据
export interface MemoryEntry {
  message: AgentMessage
  timestamp: number
  tokenEstimate: number
  preserved: boolean
}

// 记忆摘要
export interface MemorySummary {
  text: string
  coveredRange: { from: number; to: number }
  createdAt: number
}

// 记忆管理器配置
export interface MemoryManagerConfig {
  // 上下文窗口（token 数）
  contextWindow: number
  // 保留最近消息数
  retainRecent: number
  // 自动压缩阈值（占上下文窗口的比例）
  compactionThreshold: number
  // 摘要函数（由外部注入，解耦 Provider）
  summarize?: (prompt: string) => Promise<string>
  // token 计数估算函数
  estimateTokens?: (text: string) => number
}

const DEFAULT_CONFIG: MemoryManagerConfig = {
  contextWindow: 200_000,
  retainRecent: 5,
  compactionThreshold: 0.8,
}

// 简单 token 估算：每 4 字符约 1 token
function defaultEstimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// Agent 记忆管理器
export class MemoryManager {
  private entries: MemoryEntry[] = []
  private summaries: MemorySummary[] = []

  private readonly config: MemoryManagerConfig
  private readonly estimateTokens: (text: string) => number

  constructor(config: Partial<MemoryManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.estimateTokens = config.estimateTokens ?? defaultEstimateTokens
  }

  // 添加消息到记忆
  append(message: AgentMessage, options?: { preserved?: boolean }): void {
    const text = this.messageToText(message)
    const entry: MemoryEntry = {
      message,
      timestamp: Date.now(),
      tokenEstimate: this.estimateTokens(text),
      preserved: options?.preserved ?? false,
    }

    this.entries.push(entry)
  }

  // 获取所有消息
  getMessages(): AgentMessage[] {
    return this.entries.map((e) => e.message)
  }

  // 获取当前 token 使用估算
  getTokenUsage(): number {
    let total = 0

    for (const summary of this.summaries) {
      total += this.estimateTokens(summary.text)
    }

    for (const entry of this.entries) {
      total += entry.tokenEstimate
    }
    
    return total
  }

  // 检查是否需要压缩
  needsCompaction(): boolean {
    const usage = this.getTokenUsage()
    return usage > this.config.contextWindow * this.config.compactionThreshold
  }

  // 执行压缩 — 将旧消息压缩为摘要，保留最近消息
  async compact(): Promise<MemorySummary | null> {
    if (!this.config.summarize) {
      log.warn('记忆压缩跳过: 未配置 summarize 函数')
      return null
    }

    const retainCount = this.config.retainRecent
    if (this.entries.length <= retainCount) {
      log.info('消息数不足，跳过压缩')
      return null
    }

    // 分离需要压缩和需要保留的消息
    const toCompact = this.entries.slice(0, -retainCount)
    const toRetain = this.entries.slice(-retainCount)

    // 提取需要始终保留的消息（标记为 preserved）
    const preservedEntries = toCompact.filter((e) => e.preserved)

    // 构建摘要 prompt
    const existingSummaryText = this.summaries.length > 0
      ? `已有上下文摘要:\n${this.summaries.map((s) => s.text).join('\n---\n')}\n\n`
      : ''

    const messagesText = toCompact
      .filter((e) => !e.preserved)
      .map((e) => this.messageToText(e.message))
      .join('\n')

    const summaryPrompt = `${existingSummaryText}请摘要以下对话消息，保留关键决策、重要上下文和技术细节:\n\n${messagesText}`

    log.info(`压缩 ${toCompact.length} 条消息`)

    const summaryText = await this.config.summarize(summaryPrompt)

    const summary: MemorySummary = {
      text: summaryText,
      coveredRange: {
        from: toCompact[0]?.timestamp ?? 0,
        to: toCompact[toCompact.length - 1]?.timestamp ?? 0,
      },
      createdAt: Date.now(),
    }

    this.summaries.push(summary)
    this.entries = [...preservedEntries, ...toRetain]

    log.info(`压缩完成: 摘要 ${summaryText.length} 字符, 保留 ${this.entries.length} 条消息`)
    return summary
  }

  // 构建上下文消息列表（摘要 + 保留消息）
  buildContext(): AgentMessage[] {
    const context: AgentMessage[] = []

    // 摘要注入为系统消息
    if (this.summaries.length > 0) {
      const summaryText = this.summaries.map((s) => s.text).join('\n---\n')
      context.push({
        role: 'user',
        content: [{ type: 'text', data: `[上下文摘要]\n${summaryText}` }],
        timestamp: Date.now(),
      } as AgentMessage)
    }

    // 保留的消息
    for (const entry of this.entries) {
      context.push(entry.message)
    }

    return context
  }

  // 获取所有摘要
  getSummaries(): readonly MemorySummary[] {
    return this.summaries
  }

  // 清空记忆
  clear(): void {
    this.entries = []
    this.summaries = []
  }

  // 获取条目数
  get size(): number {
    return this.entries.length
  }

  // 将消息转为文本用于 token 估算和摘要
  private messageToText(message: AgentMessage): string {
    const msg = message as Message
    if (typeof msg.content === 'string') {
      return msg.content
    }
    if (Array.isArray(msg.content)) {
      return msg.content
        .map((c) => (c.type === 'text' ? c.data : ''))
        .filter(Boolean)
        .join('\n')
    }
    return JSON.stringify(msg)
  }
}

// 工厂函数
export function createMemoryManager(
  config?: Partial<MemoryManagerConfig>,
): MemoryManager {
  return new MemoryManager(config)
}
