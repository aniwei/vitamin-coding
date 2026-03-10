// Anthropic Effort 级别调整 Hook — 根据模型调整 reasoning effort
import type { ChatParamsInput, ChatParamsOutput, HookRegistration } from '../../types'

export function createAnthropicEffortHook(): HookRegistration<'chat.params'> {
  return {
    name: 'anthropic-effort',
    timing: 'chat.params',
    priority: 10,
    enabled: true,
    handler(input: ChatParamsInput, output: ChatParamsOutput): void {
      // 仅对 Anthropic 模型调整
      if (input.provider !== 'anthropic') return

      // 如果未显式设置 thinkingLevel，使用默认策略
      if (!output.thinkingLevel) {
        // Claude Opus 默认高思考深度
        if (input.model.includes('opus')) {
          output.thinkingLevel = 'high'
        }
        // Claude Sonnet 默认中等
        if (input.model.includes('sonnet')) {
          output.thinkingLevel = 'medium'
        }
        // Claude Haiku 默认低
        if (input.model.includes('haiku')) {
          output.thinkingLevel = 'low'
        }
      }
    },
  }
}
