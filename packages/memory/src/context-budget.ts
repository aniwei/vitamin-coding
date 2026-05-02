import { resolveContextSize } from './defaults'
import { estimateContextTokens, estimateTokens as defaultEstimateTokens } from './token-estimator'

import type {
  CachedMicroConfig,
  CompactionConfig,
  ContextBudgetAction,
  ContextBudgetPlan,
  PruneConfig,
  SnipConfig,
} from './types'
import type { Message } from '@vitamin/ai'

export interface ContextBudgetPlannerConfig {
  contextWindow: number
  reservedOutputTokens: number
  compaction: CompactionConfig
  prune: PruneConfig
  cachedMicro: CachedMicroConfig
  snip: SnipConfig
  estimateTokens?: (text: string) => number
}

export function planContextBudget(
  messages: readonly Message[],
  config: ContextBudgetPlannerConfig,
): ContextBudgetPlan {
  const estimator = config.estimateTokens ?? defaultEstimateTokens
  const tokenEstimate = estimateContextTokens(messages, estimator)
  const availableInputTokens = Math.max(0, config.contextWindow - config.reservedOutputTokens)
  const remainingInputTokens = availableInputTokens - tokenEstimate.total
  const utilization = config.contextWindow === 0 ? 0 : tokenEstimate.total / config.contextWindow
  const pruneTriggerTokens = resolveContextSize(config.prune.trigger, config.contextWindow)
  const microTriggerTokens = resolveContextSize(config.cachedMicro.trigger, config.contextWindow)
  const compactionTriggerTokens = resolveContextSize(
    config.compaction.trigger,
    config.contextWindow,
  )

  const trace: string[] = [
    `tokens=${tokenEstimate.total}`,
    `contextWindow=${config.contextWindow}`,
    `reservedOutput=${config.reservedOutputTokens}`,
    `availableInput=${availableInputTokens}`,
    `remainingInput=${remainingInputTokens}`,
  ]

  const action = selectAction({
    messages,
    totalTokens: tokenEstimate.total,
    pruneTriggerTokens,
    microTriggerTokens,
    compactionTriggerTokens,
    compactionEnabled: config.compaction.enabled,
    snipConfig: config.snip,
    trace,
  })

  const shouldCompact = action === 'compact'

  return {
    action,
    shouldProcess: action !== 'none',
    shouldCompact,
    tokenEstimate,
    contextWindow: config.contextWindow,
    reservedOutputTokens: config.reservedOutputTokens,
    availableInputTokens,
    pruneTriggerTokens,
    microTriggerTokens,
    compactionTriggerTokens,
    remainingInputTokens,
    utilization,
    trace,
  }
}

function selectAction(input: {
  messages: readonly Message[]
  totalTokens: number
  pruneTriggerTokens: number
  microTriggerTokens: number
  compactionTriggerTokens: number
  compactionEnabled: boolean
  snipConfig: SnipConfig
  trace: string[]
}): ContextBudgetAction {
  if (hasOversizedToolOutput(input.messages, input.snipConfig.maxOutputChars)) {
    input.trace.push('action=snip reason=oversized-tool-output')
    return 'snip'
  }

  if (input.compactionEnabled && input.totalTokens >= input.compactionTriggerTokens) {
    input.trace.push('action=compact reason=compaction-trigger')
    return 'compact'
  }

  if (input.totalTokens >= input.microTriggerTokens) {
    input.trace.push('action=micro-compact reason=micro-trigger')
    return 'micro-compact'
  }

  if (input.totalTokens >= input.pruneTriggerTokens) {
    input.trace.push('action=prune reason=prune-trigger')
    return 'prune'
  }

  input.trace.push('action=none reason=below-thresholds')
  return 'none'
}

function hasOversizedToolOutput(messages: readonly Message[], maxOutputChars: number): boolean {
  return messages.some((message) => {
    if (message.role !== 'tool_result' || !Array.isArray(message.content)) {
      return false
    }

    return message.content.some((part) => part.type === 'text' && part.text.length > maxOutputChars)
  })
}
