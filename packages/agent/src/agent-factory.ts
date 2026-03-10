// Agent 工厂 — 便捷创建 Agent 实例
import { stream, ProviderStream } from '@vitamin/ai'

import { Agent } from './agent'

import type { ProviderRegistry, StreamContext } from '@vitamin/ai'
import type { StreamFunction } from './agent-loop'
import type { AgentConfig } from './types'

// 带 ProviderRegistry 的扩展配置
export interface AgentFactoryConfig extends AgentConfig {
  providerRegistry?: ProviderRegistry
  apiKey?: string
}

// 从 ProviderRegistry 构建 streamFn
function createStreamFromRegistry(
  model: AgentConfig['model'],
  provider: ProviderStream,
): StreamFunction {
  return (context: StreamContext, signal: AbortSignal) => {
    return stream(model, context, provider, { signal })
  }
}

// 工厂函数 — 创建 Agent
export function createAgent(config: AgentFactoryConfig): Agent {
  // 如果提供了 providerRegistry 但没有 streamFn，自动构建
  let stream = config.stream
  if (!stream && config.providerRegistry) {
    const provider = config.providerRegistry.getProviderForModel(config.model)
    stream = createStreamFromRegistry(
      config.model, 
      provider
    )
  }

  return new Agent({
    ...config,
    stream,
  })
}
