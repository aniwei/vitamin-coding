// @vitamin/memory — Model-Aware 默认配置

import type { MemoryDefaults, CompactionConfig, PruneConfig } from './types'

/**
 * 根据模型参数计算合理的默认配置。
 * 
 * 设计原则:
 * - prune 先于 compaction 触发（70% vs 85%），prune 是无 LLM 成本的轻量操作
 * - keepRecent 保留 10% 最近消息，protect 保护 15% 近期 tool 输出
 * - reserveTokens 不超过模型 maxOutput（为生成回复预留空间）
 */
export function computeMemoryDefaults(model: {
  contextWindow: number
  maxOutput: number
}): MemoryDefaults {
  return {
    compaction: {
      enabled: true,
      trigger: ['fraction', 0.85],
      keepRecent: ['fraction', 0.10],
      reserveTokens: Math.min(16384, model.maxOutput),
    },
    prune: {
      trigger: ['fraction', 0.70],
      protect: ['fraction', 0.15],
      minimum: 20000,
      protectedTools: [],
      truncateTools: ['write_file', 'edit_file', 'create_file', 'replace_string_in_file'],
      truncateMaxLength: 2000,
    },
  }
}

/** 默认配置（200k 上下文窗口, 16k 输出） */
export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  enabled: true,
  trigger: ['fraction', 0.85],
  keepRecent: ['fraction', 0.10],
  reserveTokens: 16384,
}

export const DEFAULT_PRUNE_CONFIG: PruneConfig = {
  trigger: ['fraction', 0.70],
  protect: ['fraction', 0.15],
  minimum: 20000,
  protectedTools: [],
  truncateTools: ['write_file', 'edit_file', 'create_file', 'replace_string_in_file'],
  truncateMaxLength: 2000,
}

/**
 * 将 ContextSize 解析为绝对 token 数。
 * 
 * @param size - ContextSize 配置
 * @param contextWindow - 模型上下文窗口总量
 * @param messages - 当前消息列表（用于 'messages' 模式）
 */
export function resolveContextSize(
  size: import('./types').ContextSize,
  contextWindow: number,
): number {
  const [unit, value] = size
  switch (unit) {
    case 'tokens':
      return value
    case 'fraction':
      return Math.floor(contextWindow * value)
    case 'messages':
      return value // 由调用方按消息数处理
  }
}
