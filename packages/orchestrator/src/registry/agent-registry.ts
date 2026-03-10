// Agent 注册表 — 注册/查找/热插拔/委派表生成
import { AgentError, createLogger } from '@vitamin/shared'

import type { AgentMode, AgentRegistration } from '../types'

const log = createLogger('orchestrator:registry')

export class AgentRegistry {
  private readonly agents = new Map<string, AgentRegistration>()

  // 注册 Agent
  register(registration: AgentRegistration): void {
    if (this.agents.has(registration.name)) {
      log.warn(`Agent "${registration.name}" already registered, overwriting`)
    }
    
    this.agents.set(registration.name, registration)
    log.debug(`Agent registered: ${registration.name} (mode=${registration.mode})`)
  }

  // 获取 Agent
  get(name: string): AgentRegistration {
    const reg = this.agents.get(name)
    if (!reg) {
      throw new AgentError(`Agent "${name}" not found`, { code: 'AGENT_NOT_FOUND' })
    }
    return reg
  }

  // 查找 Agent (不抛异常)
  find(name: string): AgentRegistration | undefined {
    return this.agents.get(name)
  }

  // 检查 Agent 是否已注册
  has(name: string): boolean {
    return this.agents.has(name)
  }

  // 获取所有可用 Agent (已启用的)
  getAvailable(mode?: AgentMode): AgentRegistration[] {
    const all = [...this.agents.values()].filter((a) => a.enabled)
    if (!mode) return all
    return all.filter((a) => a.mode === mode || a.mode === 'all')
  }

  // 获取全部 Agent (包含禁用的)
  getAll(): AgentRegistration[] {
    return [...this.agents.values()]
  }

  // 启用/禁用 Agent (热插拔)
  setEnabled(name: string, enabled: boolean): void {
    const reg = this.agents.get(name)
    if (!reg) {
      log.warn(`Cannot toggle unknown agent: ${name}`)
      return
    }
    if (!reg.disableable && !enabled) {
      log.warn(`Agent "${name}" is not disableable`)
      return
    }
    reg.enabled = enabled
    log.info(`Agent "${name}" ${enabled ? 'enabled' : 'disabled'}`)
  }

  // 注销 Agent
  unregister(name: string): boolean {
    return this.agents.delete(name)
  }

  // 清空注册表
  clear(): void {
    this.agents.clear()
  }

  get size(): number {
    return this.agents.size
  }
}

export function createAgentRegistry(): AgentRegistry {
  return new AgentRegistry()
}
