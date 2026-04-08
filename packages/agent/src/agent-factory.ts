import { stream } from '@vitamin/ai'
import { Agent } from './agent'

import type { Model, ProviderRegistry, ProviderStream, StreamContext } from '@vitamin/ai'
import type { StreamFunction } from './work-loop'
import type { AgentOptions } from './types'

// 工厂配置
export interface AgentFactoryOptions extends AgentOptions {
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
export function createAgent(options: AgentFactoryOptions = {}): Agent {
  let stream = options.stream
  const devtools = options.devtools

  if (!stream) {
    if (options.model && options.providerRegistry) {
      const provider = options.providerRegistry.get(options.model.api)
      stream = createStreamFromRegistry(options.model, provider)
    }
  }

  return new Agent({ stream, devtools })
}
