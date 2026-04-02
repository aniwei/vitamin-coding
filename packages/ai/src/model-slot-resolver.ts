import type { Model, ModelSpec } from './types'
import type { ModelRegistry } from './model-registry'

export type WorkflowSlot = 'normal' | 'thinking' | 'compact' | 'critique' | 'vision'

export interface ModelSlotOptions {
  slots: Partial<Record<WorkflowSlot, ModelSpec | ModelSpec[]>>
  default: ModelSpec
}

export class ModelSlot {
  public slots: Partial<Record<WorkflowSlot, ModelSpec | ModelSpec[]>>
  public default: ModelSpec

  constructor(
    options: ModelSlotOptions,
    private readonly registry: ModelRegistry,
  ) {
    this.slots = options.slots
    this.default = options.default
  }

  resolve(slot?: WorkflowSlot): Model {
    if (!slot) {
      return this.registry.resolve(this.default)
    }

    const specOrSpecs = this.slots[slot]
    if (!specOrSpecs) {
      return this.registry.resolve(this.default)
    }

    if (Array.isArray(specOrSpecs)) {
      for (const spec of specOrSpecs) {
        const model = this.registry.tryResolve(spec)
        if (model) return model
      }
      return this.registry.resolve(this.default)
    }

    return this.registry.resolve(specOrSpecs)
  }
}

export function createModelSlot(
  options: ModelSlotOptions,
  registry: ModelRegistry,
): ModelSlot {
  return new ModelSlot(options, registry)
}
