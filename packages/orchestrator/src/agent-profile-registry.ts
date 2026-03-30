// ═══════════════════════════════════════════════════════════
// AgentProfileRegistry — 静态 AgentProfile 注册表
// ═══════════════════════════════════════════════════════════

import type { RegisteredAgentProfile, AgentProfileRegistry as IAgentProfileRegistry, TaskType } from './types'

class AgentProfileRegistryImpl implements IAgentProfileRegistry {
  private profiles = new Map<string, RegisteredAgentProfile>()
  /** taskType → profile name 快速索引 */
  private taskTypeIndex = new Map<TaskType, string>()

  register(profile: RegisteredAgentProfile): void {
    this.profiles.set(profile.name, profile)
    // 更新 taskType 索引（后注册的覆盖先注册的）
    for (const tt of profile.taskTypes) {
      this.taskTypeIndex.set(tt, profile.name)
    }
  }

  get(name: string): RegisteredAgentProfile | undefined {
    return this.profiles.get(name)
  }

  resolve(query: { name?: string; category?: string }): RegisteredAgentProfile | undefined {
    if (query.name) {
      return this.profiles.get(query.name)
    }
    if (query.category) {
      // category 当作 taskType 查 index
      const profileName = this.taskTypeIndex.get(query.category as TaskType)
      if (profileName) return this.profiles.get(profileName)

      // 再尝试 capability 匹配
      for (const p of this.profiles.values()) {
        if (p.capabilities.includes(query.category)) return p
      }
    }
    return undefined
  }

  list(): RegisteredAgentProfile[] {
    return Array.from(this.profiles.values())
  }
}

export function createAgentProfileRegistry(): IAgentProfileRegistry {
  return new AgentProfileRegistryImpl()
}
