// Agent 工厂 — 便捷创建 Agent 实例
import { stream } from '@vitamin/ai'

import { Agent } from './agent'

import type { ProviderRegistry, ProviderStream, StreamContext } from '@vitamin/ai'
import type { StreamFunction } from './work-loop'
import type { AgentConfig } from './types'

// 带 ProviderRegistry 的扩展配置
export interface AgentFactoryConfig extends AgentConfig {
  providerRegistry?: ProviderRegistry
}

// 从 ProviderRegistry 构建 stream
function createStreamFromRegistry(
  model: AgentConfig['model'],
  provider: ProviderStream,
): StreamFunction {
  return (context: StreamContext, signal: AbortSignal) => {
    return stream(model, provider, context, { signal })
  }
}

// 工厂函数 — 创建 Agent
export function createAgent(config: AgentFactoryConfig): Agent {
  // 如果提供了 providerRegistry 但没有 stream，自动构建
  let stream = config.stream

  if (!stream && config.providerRegistry) {
    const provider = config.providerRegistry.get(config.model.api)
    stream = createStreamFromRegistry(config.model, provider)
  }

  return new Agent({
    ...config,
    stream,
  })
}
