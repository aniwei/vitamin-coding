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

interface SessionTokenUsage {
  model: string
  totalInput: number
  totalOutput: number
}

// 每 session 的累计 token 使用；无 sessionId 时退化为按 model 统计以兼容旧调用方
const sessionTokenUsage = new Map<string, SessionTokenUsage>()

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
    handle(input: ChatParamsInput, output: ChatParamsOutput): void {
      const usageKey = input.sessionId ?? input.model

      // 如果 maxTokens 未设或超出预算，强制上限
      if (!output.maxTokens || output.maxTokens > maxOutput) {
        output.maxTokens = maxOutput
        log.debug('Capped maxTokens to %d for model=%s', maxOutput, input.model)
      }

      // 刷新 session token 追踪
      const usage = sessionTokenUsage.get(usageKey) ?? {
        model: input.model,
        totalInput: 0,
        totalOutput: 0,
      }
      
      if (usage.totalInput > warnThreshold) {
        log.warn(
          'Session token usage high: session=%s model=%s totalInput=%d threshold=%d',
          usageKey,
          input.model,
          usage.totalInput,
          warnThreshold,
        )
        output.metadata.tokenBudgetWarning = {
          sessionId: input.sessionId,
          model: usage.model,
          totalInput: usage.totalInput,
          threshold: warnThreshold,
        }
      }
    },
  }
}

export function trackTokenUsage(
  sessionId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): void {
  const usage = sessionTokenUsage.get(sessionId) ?? { model, totalInput: 0, totalOutput: 0 }
  usage.model = model
  usage.totalInput += inputTokens
  usage.totalOutput += outputTokens
  sessionTokenUsage.set(sessionId, usage)
}

export function getTokenUsage(sessionId: string) {
  return sessionTokenUsage.get(sessionId)
}

export function clearTokenUsage(sessionId: string): void {
  sessionTokenUsage.delete(sessionId)
}
