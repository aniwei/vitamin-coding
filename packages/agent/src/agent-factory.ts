// Agent 工厂 — 便捷创建 Agent 实例（从 Model + ProviderRegistry 自动构建 stream）
import { stream } from '@vitamin/ai'

import { Agent } from './agent'

import type { Model, ProviderRegistry, ProviderStream, StreamContext } from '@vitamin/ai'
import type { StreamFunction } from './work-loop'
import type { AgentConfig } from './types'

// 工厂配置 — 可通过 model + providerRegistry 自动构建 stream
export interface AgentFactoryConfig extends AgentConfig {
  model?: Model
  providerRegistry?: ProviderRegistry
}

// 从 ProviderRegistry 构建 stream
function createStreamFromRegistry(
  model: Model,
  provider: ProviderStream,
): StreamFunction {
  return (context: StreamContext, signal: AbortSignal) => {
    return stream(model, provider, context, { signal })
  }
}

// 工厂函数 — 创建 Agent
export function createAgent(config: AgentFactoryConfig = {}): Agent {
  let streamFn = config.stream

  if (!streamFn && config.model && config.providerRegistry) {
    const provider = config.providerRegistry.get(config.model.api)
    streamFn = createStreamFromRegistry(config.model, provider)
  }

  return new Agent({
    stream: streamFn,
    devtools: config.devtools,
  })
}
