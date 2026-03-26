import { stream } from '@vitamin/ai'
import { Agent } from './agent'

import type { Model, ProviderRegistry, ProviderStream, StreamContext } from '@vitamin/ai'
import type { StreamFunction } from './work-loop'
import type { AgentConfig } from './types'

// 工厂配置
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
  let stream = config.stream
  const devtools = config.devtools

  if (!stream) {
    if (config.model && config.providerRegistry) {
      const provider = config.providerRegistry.get(config.model.api)
      stream = createStreamFromRegistry(config.model, provider)
    }
  }

  return new Agent({ stream, devtools })
}
