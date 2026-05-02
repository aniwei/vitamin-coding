import { TypedEventEmitter, createLogger } from '@vitamin/shared'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { discoverSkills, getDefaultGlobalSkillDirs } from './skill-discovery'
import { matchSkills } from './skill-matcher'
import { parseSkillContent } from './skill-parser'
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
  SkillSearchResult,
  SkillCreateInput,
  SkillMutationResult,
  SkillImproveInput,
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

  async search(
    query: string,
    options?: { maxResults?: number; minRelevance?: number },
  ): Promise<SkillSearchResult[]> {
    return this.match(query, options).map((match) => {
      const { definition, source, status } = match.skill
      return {
        name: definition.metadata.name,
        description: definition.metadata.description,
        trigger: definition.metadata.trigger ?? 'auto',
        status,
        source,
        relevance: match.relevance,
        matchedKeywords: match.matchedKeywords,
      }
    })
  }

  async create(input: SkillCreateInput): Promise<SkillMutationResult> {
    const validation = validateSkillName(input.name)
    if (validation) {
      return { success: false, error: validation }
    }

    const skillDir = path.join(this.workspaceDir, '.vitamin', 'skills', input.name)
    const skillFile = path.join(skillDir, 'SKILL.md')
    if (fs.existsSync(skillFile) && !input.overwrite) {
      return { success: false, error: `Skill "${input.name}" already exists` }
    }

    fs.mkdirSync(skillDir, { recursive: true })
    const content = renderSkillFile(input)
    fs.writeFileSync(skillFile, content, 'utf-8')

    try {
      const definition = parseSkillContent(content, skillFile, skillDir, [])
      this.register(definition, { type: 'project', root: path.join(this.workspaceDir, '.vitamin', 'skills') })
      return { success: true, name: input.name, path: skillFile }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async improve(input: SkillImproveInput): Promise<SkillMutationResult> {
    const registered = this.skills.get(input.name)
    if (!registered) {
      return { success: false, error: `Skill "${input.name}" not found` }
    }
    if (registered.status === 'disabled') {
      return { success: false, error: `Skill "${input.name}" is disabled` }
    }

    const filePath = registered.definition.filePath
    const existing = fs.readFileSync(filePath, 'utf-8')
    const timestamp = new Date().toISOString()
    const updated = `${existing.trimEnd()}\n\n## Improvement Log\n\n- ${timestamp}: ${input.instructions.trim()}\n`
    fs.writeFileSync(filePath, updated, 'utf-8')

    try {
      const definition = parseSkillContent(
        updated,
        filePath,
        registered.definition.directory,
        registered.definition.supportingFiles,
      )
      this.register(definition, registered.source)
      return { success: true, name: input.name, path: filePath }
    } catch (error) {
      fs.writeFileSync(filePath, existing, 'utf-8')
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async catalog(): Promise<string> {
    return this.buildCatalog()
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
    if (available.length === 0) {
      return ''
    }

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

function validateSkillName(name: string): string | undefined {
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(name)) {
    return 'Skill name must be kebab-case'
  }
  return undefined
}

function renderSkillFile(input: SkillCreateInput): string {
  const lines = [
    '---',
    `name: ${input.name}`,
    `description: ${input.description}`,
    `trigger: ${input.trigger ?? 'manual'}`,
  ]
  if (input.tags?.length) {
    lines.push('tags:')
    for (const tag of input.tags) {
      lines.push(`  - ${tag}`)
    }
  }
  lines.push('---', '', input.body.trim(), '')
  return lines.join('\n')
}

// ─── 工厂 ───

export function createSkillRegistry(options: SkillRegistryOptions): SkillRegistry {
  return new SkillRegistry(options)
}
