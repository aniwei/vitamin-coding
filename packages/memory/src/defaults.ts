import type { 
  MemoryDefaults, 
  CompactionConfig, 
  PruneConfig 
} from './types'
import {
  MEMORY_COMPACTION_TRIGGER_FRACTION,
  MEMORY_COMPACTION_KEEP_RECENT_FRACTION,
  MEMORY_COMPACTION_RESERVE_TOKENS,
  MEMORY_PRUNE_TRIGGER_FRACTION,
  MEMORY_PRUNE_PROTECT_FRACTION,
  MEMORY_PRUNE_MINIMUM_TOKENS,
  MEMORY_PRUNE_TRUNCATE_MAX_LENGTH,
  MEMORY_TOOL_WRITE,
  MEMORY_TOOL_EDIT,
  MEMORY_TOOL_APPLY_PATCH,
  MEMORY_TOOL_CREATE_FILE,
  MEMORY_TOOL_EDIT_NOTEBOOK_FILE,
} from '@vitamin/env'

const defaultTruncateTools = [
  MEMORY_TOOL_WRITE,
  MEMORY_TOOL_EDIT,
  MEMORY_TOOL_APPLY_PATCH,
  MEMORY_TOOL_CREATE_FILE,
  MEMORY_TOOL_EDIT_NOTEBOOK_FILE,
] as const

export function computeMemoryDefaults(model: {
  contextWindow: number
  maxOutput: number
}): MemoryDefaults {
  return {
    compaction: {
      enabled: true,
      trigger: ['fraction', MEMORY_COMPACTION_TRIGGER_FRACTION],
      keepRecent: ['fraction', MEMORY_COMPACTION_KEEP_RECENT_FRACTION],
      reserveTokens: Math.min(MEMORY_COMPACTION_RESERVE_TOKENS, model.maxOutput),
    },
    prune: {
      trigger: ['fraction', MEMORY_PRUNE_TRIGGER_FRACTION],
      protect: ['fraction', MEMORY_PRUNE_PROTECT_FRACTION],
      minimum: MEMORY_PRUNE_MINIMUM_TOKENS,
      protectedTools: [],
      truncateTools: [...defaultTruncateTools],
      truncateMaxLength: MEMORY_PRUNE_TRUNCATE_MAX_LENGTH,
    },
  }
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  enabled: true,
  trigger: ['fraction', MEMORY_COMPACTION_TRIGGER_FRACTION],
  keepRecent: ['fraction', MEMORY_COMPACTION_KEEP_RECENT_FRACTION],
  reserveTokens: MEMORY_COMPACTION_RESERVE_TOKENS,
}

export const DEFAULT_PRUNE_CONFIG: PruneConfig = {
  trigger: ['fraction', MEMORY_PRUNE_TRIGGER_FRACTION],
  protect: ['fraction', MEMORY_PRUNE_PROTECT_FRACTION],
  minimum: MEMORY_PRUNE_MINIMUM_TOKENS,
  protectedTools: [],
  truncateTools: [...defaultTruncateTools],
  truncateMaxLength: MEMORY_PRUNE_TRUNCATE_MAX_LENGTH,
}

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
      return value 
  }
}
