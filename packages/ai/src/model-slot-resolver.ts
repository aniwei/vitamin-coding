// ModelSlotResolver — WorkflowSlot → Model 配置驱动查表
import type { Model, ModelSpec } from './types'
import type { ModelRegistry } from './model-registry'

export type WorkflowSlot = 'normal' | 'thinking' | 'compact' | 'critique' | 'vision'

export interface ModelSlotConfig {
  slots: Partial<Record<WorkflowSlot, ModelSpec | ModelSpec[]>>
  default: ModelSpec
}

export class ModelSlotResolver {
  constructor(
    private readonly config: ModelSlotConfig,
    private readonly registry: ModelRegistry,
  ) {}

  resolve(slot?: WorkflowSlot): Model {
    if (!slot) {
      return this.registry.resolve(this.config.default)
    }

    const specOrSpecs = this.config.slots[slot]
    if (!specOrSpecs) {
      return this.registry.resolve(this.config.default)
    }

    // Array: try each spec in order, return first resolvable
    if (Array.isArray(specOrSpecs)) {
      for (const spec of specOrSpecs) {
        const model = this.registry.tryResolve(spec)
        if (model) return model
      }
      return this.registry.resolve(this.config.default)
    }

    return this.registry.resolve(specOrSpecs)
  }

  getConfig(): ModelSlotConfig {
    return this.config
  }
}

export function createModelSlotResolver(
  config: ModelSlotConfig,
  registry: ModelRegistry,
): ModelSlotResolver {
  return new ModelSlotResolver(config, registry)
}
