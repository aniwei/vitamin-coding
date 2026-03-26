// SkillRegistry — 已加载 Skill 的内存注册表

import type { Skill, SkillDiagnostic } from './types'

export class SkillRegistry {
  private readonly skills = new Map<string, Skill>()

  // 注册数量
  get size(): number {
    return this.skills.size
  }

  // 注册一个 Skill，返回冲突诊断（如有）
  register(skill: Skill): SkillDiagnostic | null {
    const existing = this.skills.get(skill.name)
    if (existing) {
      return {
        type: 'collision',
        skillName: skill.name,
        filePath: skill.filePath,
        message: `Skill "${skill.name}" already registered from ${existing.filePath}`,
      }
    }
    this.skills.set(skill.name, skill)
    return null
  }

  // 批量注册
  registerAll(skills: Skill[]): SkillDiagnostic[] {
    const diagnostics: SkillDiagnostic[] = []
    for (const skill of skills) {
      const diag = this.register(skill)
      if (diag) diagnostics.push(diag)
    }
    return diagnostics
  }

  // 按名称获取
  get(name: string): Skill | undefined {
    return this.skills.get(name)
  }

  // 检查是否存在
  has(name: string): boolean {
    return this.skills.has(name)
  }

  // 获取所有已注册 Skill
  getAll(): Skill[] {
    return [...this.skills.values()]
  }

  // 获取可注入 System Prompt 的 Skill（排除 disableModelInvocation）
  getPromptVisible(): Skill[] {
    return this.getAll().filter((s) => !s.disableModelInvocation)
  }

  // 注销
  unregister(name: string): boolean {
    return this.skills.delete(name)
  }

  // 清空
  clear(): void {
    this.skills.clear()
  }
}
