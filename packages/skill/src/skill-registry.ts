import { TypedEventEmitter, createLogger } from '@x-mars/shared'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { discoverSkills, getDefaultGlobalSkillDirs } from './skill-discovery'
import { matchSkills } from './skill-matcher'
import { parseSkillContent } from './skill-parser'
import type {
  SkillDefinition,
  SkillMetadata,
  SkillLibraryConfig,
  SkillSource,
  SkillMatch,
  RegisteredSkill,
  SkillStatus,
  SkillReadiness,
  SkillInvocationAction,
  SkillInvocationRecord,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillEvents,
  SkillSearchResult,
  SkillViewInput,
  SkillViewResult,
  SkillCreateInput,
  SkillMutationResult,
  SkillImproveInput,
  SkillMcpResourceEntry,
  SkillMcpResourceProvider,
  SkillMcpSyncResult,
} from './types'

const logger = createLogger('@x-mars/skill:registry')

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
  private invocationLog: SkillInvocationRecord[] = []

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
      projectDirs: this.library?.projectDirs ?? ['.x-mars/skills'],
      globalDirs: this.library?.globalDirs ?? getDefaultGlobalSkillDirs(),
      bundledDirs: this.library?.bundledDirs ?? [],
      mcpDirs: this.library?.mcpDirs ?? [],
      disabled: [...this.disabledSet],
    }

    const discovered = await discoverSkills(config, this.workspaceDir)

    for (const [name, { definition, source }] of discovered) {
      const status: SkillStatus = this.disabledSet.has(name) ? 'disabled' : 'available'

      this.skills.set(name, {
        definition,
        source,
        status,
        readiness: evaluateSkillReadiness(definition.metadata),
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

    this.skills.set(name, {
      definition,
      source,
      status,
      readiness: evaluateSkillReadiness(definition.metadata),
    })
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
      this.recordInvocation({
        name,
        action: 'load',
        registered,
        success: false,
        error: `Skill "${name}" is disabled`,
      })
      return { success: false, error: `Skill "${name}" is disabled` }
    }

    registered.status = 'loaded'
    registered.loadedAt = Date.now()

    this.emit('skill_loaded', { name, source: registered.source })
    this.recordInvocation({ name, action: 'load', registered, success: true })

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
      this.recordInvocation({
        name: context.skillName,
        action: 'execute',
        registered,
        success: false,
        error: `Skill "${context.skillName}" is disabled`,
      })
      return { success: false, error: `Skill "${context.skillName}" is disabled` }
    }

    // 标记为已加载
    if (registered.status === 'available') {
      registered.status = 'loaded'
      registered.loadedAt = Date.now()
    }

    const durationMs = Date.now() - startTime
    this.emit('skill_executed', { name: context.skillName, success: true, durationMs })
    this.recordInvocation({ name: context.skillName, action: 'execute', registered, success: true })

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
        readiness: match.skill.readiness,
        relevance: match.relevance,
        matchedKeywords: match.matchedKeywords,
      }
    })
  }

  async view(input: SkillViewInput): Promise<SkillViewResult> {
    const registered = this.skills.get(input.name)
    if (!registered) {
      return { success: false, error: `Skill "${input.name}" not found` }
    }
    if (registered.status === 'disabled') {
      this.recordInvocation({
        name: input.name,
        action: 'view',
        registered,
        success: false,
        filePath: input.filePath,
        error: `Skill "${input.name}" is disabled`,
      })
      return { success: false, error: `Skill "${input.name}" is disabled` }
    }

    const { definition, source } = registered
    if (!input.filePath) {
      this.recordInvocation({ name: input.name, action: 'view', registered, success: true })
      return {
        success: true,
        name: definition.metadata.name,
        source,
        path: definition.filePath,
        content: definition.body,
        supportingFiles: formatSupportingFiles(definition),
      }
    }

    const resolved = resolveSkillLinkedFile(definition, input.filePath)
    if ('error' in resolved) {
      this.recordInvocation({
        name: input.name,
        action: 'view',
        registered,
        success: false,
        filePath: input.filePath,
        error: resolved.error,
      })
      return { success: false, error: resolved.error }
    }

    try {
      this.recordInvocation({
        name: input.name,
        action: 'view',
        registered,
        success: true,
        filePath: input.filePath,
      })
      return {
        success: true,
        name: definition.metadata.name,
        source,
        path: resolved.path,
        content: fs.readFileSync(resolved.path, 'utf-8'),
        supportingFiles: formatSupportingFiles(definition),
      }
    } catch (error) {
      this.recordInvocation({
        name: input.name,
        action: 'view',
        registered,
        success: false,
        filePath: input.filePath,
        error: error instanceof Error ? error.message : String(error),
      })
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async create(input: SkillCreateInput): Promise<SkillMutationResult> {
    const validation = validateSkillName(input.name)
    if (validation) {
      return { success: false, error: validation }
    }

    const skillDir = path.join(this.workspaceDir, '.x-mars', 'skills', input.name)
    const skillFile = path.join(skillDir, 'SKILL.md')
    if (fs.existsSync(skillFile) && !input.overwrite) {
      return { success: false, error: `Skill "${input.name}" already exists` }
    }

    fs.mkdirSync(skillDir, { recursive: true })
    const content = renderSkillFile(input)
    fs.writeFileSync(skillFile, content, 'utf-8')

    try {
      const definition = parseSkillContent(content, skillFile, skillDir, [])
      this.register(definition, {
        type: 'project',
        root: path.join(this.workspaceDir, '.x-mars', 'skills'),
      })
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

  async syncMcpSkills(
    provider: SkillMcpResourceProvider,
    options?: { cacheDir?: string },
  ): Promise<SkillMcpSyncResult> {
    const cacheDir = options?.cacheDir ?? path.join(this.workspaceDir, '.x-mars', 'mcp-skills')
    const result: SkillMcpSyncResult = {
      success: true,
      synced: 0,
      skipped: 0,
      errors: [],
      cacheDir,
    }
    const resources = provider.getAllResources()
    const skillResources = resources.filter(isMcpSkillResource)
    const handledResourceKeys = new Set(skillResources.map(getMcpResourceKey))

    for (const resource of skillResources) {
      try {
        const content = await readTextResource(provider, resource)
        const previewDir = path.join(
          cacheDir,
          sanitizePathSegment(resource.serverName),
          '__preview__',
        )
        const previewPath = path.join(previewDir, 'SKILL.md')
        const preview = parseSkillContent(content, previewPath, previewDir, [])
        const skillDir = path.join(
          cacheDir,
          sanitizePathSegment(resource.serverName),
          preview.metadata.name,
        )
        const skillPath = path.join(skillDir, 'SKILL.md')

        fs.mkdirSync(skillDir, { recursive: true })
        fs.writeFileSync(skillPath, content, 'utf-8')

        const supportingResources = resources.filter((candidate) =>
          isSupportingMcpSkillResource(resource, candidate),
        )
        for (const supporting of supportingResources) {
          handledResourceKeys.add(getMcpResourceKey(supporting))
          await writeSupportingMcpResource(provider, resource, supporting, skillDir)
        }

        const definition = parseSkillContent(
          content,
          skillPath,
          skillDir,
          listMcpCacheFiles(skillDir),
        )
        this.register(definition, {
          type: 'mcp',
          root: path.join(cacheDir, sanitizePathSegment(resource.serverName)),
        })
        result.synced += 1
      } catch (error) {
        result.success = false
        result.errors.push({
          uri: resource.uri,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    result.skipped = resources.filter(
      (resource) => !handledResourceKeys.has(getMcpResourceKey(resource)),
    ).length
    return result
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
    for (const { definition, readiness, source } of available) {
      const { name, description, trigger } = definition.metadata
      const triggerTag = trigger === 'manual' ? ' [manual]' : ''
      const readinessTag =
        readiness.status === 'available'
          ? ''
          : ` [${readiness.status}${readiness.missingEnvironmentVariables.length > 0 ? `: missing ${readiness.missingEnvironmentVariables.join(', ')}` : ''}]`
      lines.push(`- **${name}**${triggerTag} [${source.type}]${readinessTag}: ${description}`)
    }

    return lines.join('\n')
  }

  /**
   * 获取 skill 总数
   */
  get size(): number {
    return this.skills.size
  }

  getInvokedSkills(): SkillInvocationRecord[] {
    return [...this.invocationLog]
  }

  clearInvokedSkills(): void {
    this.invocationLog = []
  }

  private recordInvocation(input: {
    name: string
    action: SkillInvocationAction
    registered: RegisteredSkill
    success: boolean
    filePath?: string
    error?: string
  }): void {
    const record: SkillInvocationRecord = {
      name: input.name,
      action: input.action,
      source: input.registered.source,
      at: Date.now(),
      success: input.success,
      filePath: input.filePath,
      error: input.error,
    }
    this.invocationLog.push(record)
    this.emit('skill_invoked', record)
  }
}

function evaluateSkillReadiness(metadata: SkillMetadata): SkillReadiness {
  const currentPlatform = currentSkillPlatform()
  if (
    metadata.platforms?.length &&
    currentPlatform &&
    !metadata.platforms.includes(currentPlatform)
  ) {
    return {
      status: 'unsupported',
      missingEnvironmentVariables: [],
      unsupportedPlatform: currentPlatform,
    }
  }

  const required = [
    ...(metadata.requiredEnvironmentVariables ?? []),
    ...(metadata.setup?.collectSecrets ?? []),
  ].filter((entry) => entry.required !== false)
  const missing = [
    ...new Set(required.map((entry) => entry.name).filter((name) => !process.env[name])),
  ]

  return {
    status: missing.length > 0 ? 'setup_needed' : 'available',
    missingEnvironmentVariables: missing,
  }
}

function currentSkillPlatform(): 'macos' | 'linux' | 'windows' | undefined {
  if (process.platform === 'darwin') {
    return 'macos'
  }
  if (process.platform === 'linux') {
    return 'linux'
  }
  if (process.platform === 'win32') {
    return 'windows'
  }
  return undefined
}

function formatSupportingFiles(definition: SkillDefinition): string[] {
  return definition.supportingFiles.map((file) =>
    path.relative(definition.directory, file).split(path.sep).join('/'),
  )
}

function resolveSkillLinkedFile(
  definition: SkillDefinition,
  filePath: string,
): { path: string } | { error: string } {
  if (path.isAbsolute(filePath)) {
    return { error: 'Skill linked file path must be relative to the skill directory' }
  }

  const requested = path.resolve(definition.directory, filePath)
  const relative = path.relative(definition.directory, requested)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { error: 'Skill linked file path escapes the skill directory' }
  }

  if (path.basename(requested) === 'SKILL.md') {
    return { path: definition.filePath }
  }

  if (!fs.existsSync(requested)) {
    return { error: `Skill linked file not found: ${filePath}` }
  }

  if (!fs.statSync(requested).isFile()) {
    return { error: `Skill linked file is not a file: ${filePath}` }
  }

  return { path: requested }
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

function isMcpSkillResource(resource: SkillMcpResourceEntry): boolean {
  return resource.name === 'SKILL.md' || /(^|\/)SKILL\.md$/u.test(resource.uri)
}

function getMcpResourceKey(resource: SkillMcpResourceEntry): string {
  return `${resource.serverName}\n${resource.uri}`
}

function isSupportingMcpSkillResource(
  skill: SkillMcpResourceEntry,
  candidate: SkillMcpResourceEntry,
): boolean {
  if (candidate.serverName !== skill.serverName || candidate.uri === skill.uri) {
    return false
  }

  const skillBase = skill.uri.replace(/(^|\/)SKILL\.md$/u, '')
  return candidate.uri.startsWith(`${skillBase}/`)
}

async function readTextResource(
  provider: SkillMcpResourceProvider,
  resource: SkillMcpResourceEntry,
): Promise<string> {
  const contents = await provider.readResource(resource.serverName, resource.uri)
  const text = contents.find((entry) => entry.text !== undefined)?.text
  if (text === undefined) {
    throw new Error(`MCP resource "${resource.uri}" does not contain text content`)
  }
  return text
}

async function writeSupportingMcpResource(
  provider: SkillMcpResourceProvider,
  skill: SkillMcpResourceEntry,
  supporting: SkillMcpResourceEntry,
  skillDir: string,
): Promise<void> {
  const relativePath = getMcpSupportingRelativePath(skill, supporting)
  if (!relativePath) {
    return
  }

  const content = await readTextResource(provider, supporting)
  const targetPath = path.resolve(skillDir, relativePath)
  const relative = path.relative(skillDir, targetPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`MCP supporting resource "${supporting.uri}" escapes skill cache directory`)
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, content, 'utf-8')
}

function getMcpSupportingRelativePath(
  skill: SkillMcpResourceEntry,
  supporting: SkillMcpResourceEntry,
): string | undefined {
  const skillBase = skill.uri.replace(/(^|\/)SKILL\.md$/u, '')
  const relativeUri = supporting.uri.slice(skillBase.length).replace(/^\/+/u, '')
  if (!relativeUri || relativeUri === 'SKILL.md') {
    return undefined
  }
  return relativeUri
    .split('/')
    .map((segment) => sanitizePathSegment(decodeURIComponent(segment)))
    .join(path.sep)
}

function listMcpCacheFiles(skillDir: string): string[] {
  const files: string[] = []
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(fullPath)
      } else if (entry.isFile() && entry.name !== 'SKILL.md') {
        files.push(fullPath)
      }
    }
  }
  visit(skillDir)
  return files
}

function sanitizePathSegment(segment: string): string {
  const sanitized = segment.replace(/[^A-Za-z0-9._-]/gu, '-').replace(/^-+|-+$/gu, '')
  return sanitized || 'resource'
}

// ─── 工厂 ───

export function createSkillRegistry(options: SkillRegistryOptions): SkillRegistry {
  return new SkillRegistry(options)
}
