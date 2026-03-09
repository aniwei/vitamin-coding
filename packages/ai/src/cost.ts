// 费用精算工具
// 支持 input/output/cache_read/cache_write 四类费率

import type { Api, Model, Usage } from './types'

// 费用明细
export interface CostBreakdown {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}
// 计算单次请求费用
export function calculate(
  model: Model<Api>, 
  usage: Usage
): CostBreakdown {
  const { cost } = model
  const input = (usage.inputTokens / 1_000_000) * cost.input
  const output = (usage.outputTokens / 1_000_000) * cost.output
  const cacheRead = (usage.cacheReadTokens / 1_000_000) * cost.cacheRead
  const cacheWrite = (usage.cacheWriteTokens / 1_000_000) * cost.cacheWrite

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    total: input + output + cacheRead + cacheWrite,
  }
}

interface CostTrackerEntry {
  model: string
  usage: Usage
  cost: CostBreakdown
}

// 跟踪器
export class CostTracker {
  private entries: CostTrackerEntry[] = []

  // 条目数
  get count(): number {
    return this.entries.length
  }

  // 总费用
  get total(): number {
    return this.entries.reduce((sum, e) => sum + e.cost.total, 0)
  }

  // 总 token 使用量
  get totalTokens(): { input: number; output: number } {
    return this.entries.reduce((acc, e) => ({
      input: acc.input + e.usage.inputTokens,
      output: acc.output + e.usage.outputTokens,
    }),
    { input: 0, output: 0 })
  }

    // 记录一次请求
  record(model: Model<Api>, usage: Usage): CostBreakdown {
    const cost = calculate(model, usage)

    this.entries.push({ model: model.id, usage, cost })
    return cost
  }

  // 按模型分组的费用汇总
  byModel(): Record<string, { count: number; cost: number }> {
    const result: Record<string, { count: number; cost: number }> = {}

    for (const entry of this.entries) {
      const existing = result[entry.model] ?? { count: 0, cost: 0 }

      existing.count++
      existing.cost += entry.cost.total
      
      result[entry.model] = existing
    }

    return result
  }

  // 清除记录
  reset(): void {
    this.entries = []
  }
}

// 创建跟踪器
export function createCostTracker(): CostTracker {
  return new CostTracker()
}


