import { TypedEventEmitter, createLogger } from '@vitamin/shared'
import { discoverSkills, getDefaultGlobalSkillDirs } from './skill-discovery'
import { matchSkills } from './skill-matcher'
import type {
  SkillDefinition,
  SkillLibraryConfig,
  SkillSource,
  SkillMatch,
  RegisteredSkill,
  SkillStatus,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillEvents,
} from './types'

const logger = createLogger('@vitamin/skill:registry')

export interface SkillRegistryOptions {
  /** 工作目录 */
  workspaceDir: string
  /** skill 库配置 */
  library?: SkillLibraryConfig
  /** 禁用的 skill 名称列表 */
  disabled?: string[]
}

export class SkillRegistry extends TypedEventEmitter<SkillEvents> {
  private skills = new Map<string, RegisteredSkill>()
  private readonly workspaceDir: string
  private readonly library?: SkillLibraryConfig
  private disabledSet: Set<string>

  constructor({ workspaceDir, library, disabled }: SkillRegistryOptions) {
    super()
    this.workspaceDir = workspaceDir
    this.library = library
    this.disabledSet = new Set(disabled ?? library?.disabled ?? [])
  }

  /**
   * 发现并注册所有可用 skill
   * 扫描项目本地 + 全局目录
   */
  async discover(): Promise<void> {
    const config: SkillLibraryConfig = {
      projectDirs: this.library?.projectDirs ?? ['.vitamin/skills'],
      globalDirs: this.library?.globalDirs ?? getDefaultGlobalSkillDirs(),
      disabled: [...this.disabledSet],
    }

    const discovered = await discoverSkills(config, this.workspaceDir)

    for (const [name, { definition, source }] of discovered) {
      const status: SkillStatus = this.disabledSet.has(name) ? 'disabled' : 'available'

      this.skills.set(name, {
        definition,
        source,
        status,
      })

      this.emit('skill_discovered', { source, count: 1 })
    }

    logger.info(
      'Skill registry initialized: %d skills (%d available, %d disabled)',
      this.skills.size,
      this.getAvailable().length,
      [...this.skills.values()].filter((s) => s.status === 'disabled').length,
    )
  }

  /**
   * 手动注册一个 skill（用于内联/插件 skill）
   */
  register(definition: SkillDefinition, source: SkillSource): void {
    const { name } = definition.metadata
    const status: SkillStatus = this.disabledSet.has(name) ? 'disabled' : 'available'

    this.skills.set(name, { definition, source, status })
    logger.debug('Registered skill "%s" from %s', name, source.type)
  }

  /**
   * 注销 skill
   */
  unregister(name: string): boolean {
    const had = this.skills.delete(name)
    if (had) {
      this.emit('skill_unloaded', { name })
    }
    return had
  }

  /**
   * 获取所有已注册 skill
   */
  getAll(): ReadonlyMap<string, RegisteredSkill> {
    return this.skills
  }

  /**
   * 获取所有可用（非 disabled/error）skill
   */
  getAvailable(): RegisteredSkill[] {
    return [...this.skills.values()].filter(
      (s) => s.status === 'available' || s.status === 'loaded',
    )
  }

  /**
   * 按名称获取 skill
   */
  get(name: string): RegisteredSkill | undefined {
    return this.skills.get(name)
  }

  /**
   * 按名称加载 skill（将状态从 available → loaded）
   */
  load(name: string): SkillExecutionResult {
    const registered = this.skills.get(name)
    if (!registered) {
      return { success: false, error: `Skill "${name}" not found` }
    }

    if (registered.status === 'disabled') {
      return { success: false, error: `Skill "${name}" is disabled` }
    }

    registered.status = 'loaded'
    registered.loadedAt = Date.now()

    this.emit('skill_loaded', { name, source: registered.source })

    return {
      success: true,
      content: registered.definition.body,
    }
  }

  execute(context: SkillExecutionContext): SkillExecutionResult {
    const startTime = Date.now()
    const registered = this.skills.get(context.skillName)

    if (!registered) {
      return { success: false, error: `Skill "${context.skillName}" not found` }
    }

    if (registered.status === 'disabled') {
      return { success: false, error: `Skill "${context.skillName}" is disabled` }
    }

    // 标记为已加载
    if (registered.status === 'available') {
      registered.status = 'loaded'
      registered.loadedAt = Date.now()
    }

    const durationMs = Date.now() - startTime
    this.emit('skill_executed', { name: context.skillName, success: true, durationMs })

    return {
      success: true,
      content: registered.definition.body,
      output: `Skill "${context.skillName}" loaded successfully`,
    }
  }

  match(query: string, options?: { maxResults?: number; minRelevance?: number }): SkillMatch[] {
    return matchSkills(query, this.skills, options)
  }

  /**
   * 禁用 skill
   */
  disable(name: string): void {
    this.disabledSet.add(name)
    const registered = this.skills.get(name)
    if (registered) {
      registered.status = 'disabled'
    }
  }

  /**
   * 启用 skill
   */
  enable(name: string): void {
    this.disabledSet.delete(name)
    const registered = this.skills.get(name)
    if (registered) {
      registered.status = 'available'
    }
  }

  /**
   * 构建 skill catalog（用于 system prompt 注入）
   * 格式：简短列表，仅 name + description
   */
  buildCatalog(): string {
    const available = this.getAvailable()
    if (available.length === 0) return ''

    const lines = ['## Available Skills', '']
    for (const { definition } of available) {
      const { name, description, trigger } = definition.metadata
      const triggerTag = trigger === 'manual' ? ' [manual]' : ''
      lines.push(`- **${name}**${triggerTag}: ${description}`)
    }

    return lines.join('\n')
  }

  /**
   * 获取 skill 总数
   */
  get size(): number {
    return this.skills.size
  }
}

// ─── 工厂 ───

export function createSkillRegistry(options: SkillRegistryOptions): SkillRegistry {
  return new SkillRegistry(options)
}
