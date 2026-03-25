// Token Budget Hook — 在 chat.params 阶段强制 token 预算
import { createLogger } from '@vitamin/shared'
import type { ChatParamsInput, ChatParamsOutput, HookRegistration } from '../../types'

const log = createLogger('@vitamin/hooks:token-budget')

export interface TokenBudgetConfig {
  /** 单次请求最大输出 token (默认 16384) */
  maxOutputTokens?: number
  /** 多轮累计输入 token 上限（超过后降级 temperature） */
  inputTokenWarningThreshold?: number
}

// 每 session 的累计 token 使用
const sessionTokenUsage = new Map<string, { totalInput: number; totalOutput: number }>()

export function createTokenBudgetHook(
  config?: TokenBudgetConfig,
): HookRegistration<'chat.params'> {
  const maxOutput = config?.maxOutputTokens ?? 16384
  const warnThreshold = config?.inputTokenWarningThreshold ?? 100_000

  return {
    name: 'token-budget',
    timing: 'chat.params',
    priority: 20,
    enabled: true,
    handler(input: ChatParamsInput, output: ChatParamsOutput): void {
      // 如果 maxTokens 未设或超出预算，强制上限
      if (!output.maxTokens || output.maxTokens > maxOutput) {
        output.maxTokens = maxOutput
        log.debug('Capped maxTokens to %d for model=%s', maxOutput, input.model)
      }

      // 刷新 session token 追踪
      const usage = sessionTokenUsage.get(input.model) ?? { totalInput: 0, totalOutput: 0 }
      
      if (usage.totalInput > warnThreshold) {
        log.warn(
          'Session token usage high: model=%s totalInput=%d threshold=%d',
          input.model,
          usage.totalInput,
          warnThreshold,
        )
        output.metadata.tokenBudgetWarning = {
          totalInput: usage.totalInput,
          threshold: warnThreshold,
        }
      }
    },
  }
}

export function trackTokenUsage(model: string, inputTokens: number, outputTokens: number): void {
  const usage = sessionTokenUsage.get(model) ?? { totalInput: 0, totalOutput: 0 }
  usage.totalInput += inputTokens
  usage.totalOutput += outputTokens
  sessionTokenUsage.set(model, usage)
}

export function getTokenUsage(model: string) {
  return sessionTokenUsage.get(model)
}

export function clearTokenUsage(model: string): void {
  sessionTokenUsage.delete(model)
}
