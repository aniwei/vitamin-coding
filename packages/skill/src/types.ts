// 兼容 Agent Skills 开放标准 (agentskills.io/specification)

import type { Events } from '@vitamin/shared'

// ─── Skill 元数据 (YAML frontmatter) ───

export interface SkillMetadata {
  /** skill 唯一名称，kebab-case: e.g. "test-driven-development" */
  name: string
  /** skill 说明，描述触发条件而非 skill 做什么
   *  推荐以 "Use when..." 开头，最长 500 字符 */
  description: string
  /** skill 版本 */
  version?: string
  /** 作者 */
  author?: string
  /** 标签用于分类搜索 */
  tags?: string[]
  /** skill 依赖的其他 skill 名称 */
  dependencies?: string[]
  /** 触发模式：auto = 根据 description 自动匹配 | manual = 仅显式调用 */
  trigger?: 'auto' | 'manual'
  /** skill 优先级，数字越小优先级越高（默认 100） */
  priority?: number
}

// ─── Skill 定义（已解析的完整 skill） ───

export interface SkillDefinition {
  /** 解析后的元数据 */
  metadata: SkillMetadata
  /** SKILL.md 去除 frontmatter 后的正文内容 */
  body: string
  /** skill 文件所在目录的绝对路径 */
  directory: string
  /** SKILL.md 文件的绝对路径 */
  filePath: string
  /** skill 目录下的附属文件路径（不含 SKILL.md） */
  supportingFiles: string[]
}

// ─── Skill 注册状态 ───

export type SkillStatus = 'available' | 'loaded' | 'disabled' | 'error'

export interface RegisteredSkill {
  definition: SkillDefinition
  status: SkillStatus
  /** skill 来源 */
  source: SkillSource
  /** 加载错误信息 */
  error?: string
  /** 上次加载时间 */
  loadedAt?: number
}

// ─── Skill 来源 ───

export type SkillSourceType = 'project' | 'global' | 'plugin' | 'inline'

export interface SkillSource {
  type: SkillSourceType
  /** 来源根路径（如 project: ".vitamin/skills", global: "~/.vitamin/skills"） */
  root: string
}

// ─── Skill 库路径配置 ───

export interface SkillLibraryConfig {
  /** 项目本地 skill 目录（相对于 workspaceDir） */
  projectDirs?: string[]
  /** 全局 skill 目录（绝对路径） */
  globalDirs?: string[]
  /** 禁用的 skill 名称列表 */
  disabled?: string[]
}

// ─── Skill 搜索/匹配结果 ───

export interface SkillMatch {
  skill: RegisteredSkill
  /** 匹配度（0-1） */
  relevance: number
  /** 匹配到的关键词 */
  matchedKeywords: string[]
}

// ─── Skill 执行上下文 ───

export interface SkillExecutionContext {
  /** skill 名称 */
  skillName: string
  /** 用户输入的原始文本 */
  input?: string
  /** 额外参数 */
  parameters?: Record<string, string>
  /** 工作目录 */
  workspaceDir: string
}

// ─── Skill 执行结果 ───

export interface SkillExecutionResult {
  success: boolean
  /** skill 正文内容（注入到 agent context） */
  content?: string
  /** 执行输出 */
  output?: string
  /** 错误信息 */
  error?: string
}

export interface SkillSearchResult {
  name: string
  description: string
  trigger: 'auto' | 'manual'
  status: SkillStatus
  source: SkillSource
  relevance: number
  matchedKeywords: string[]
}

export interface SkillCreateInput {
  name: string
  description: string
  body: string
  tags?: string[]
  trigger?: 'auto' | 'manual'
  overwrite?: boolean
}

export interface SkillMutationResult {
  success: boolean
  name?: string
  path?: string
  error?: string
}

export interface SkillImproveInput {
  name: string
  instructions: string
}

// ─── Events ───

export interface SkillEvents extends Events {
  skill_discovered: (info: { source: SkillSource; count: number }) => void
  skill_loaded: (info: { name: string; source: SkillSource }) => void
  skill_unloaded: (info: { name: string }) => void
  skill_error: (info: { name: string; error: string }) => void
  skill_executed: (info: { name: string; success: boolean; durationMs: number }) => void
}

// ─── Skill Provider 接口（供上层 VitaminApp 注入） ───

/**
 * 上层（如 VitaminApp）通过此接口注入 skill 能力。
 * 未注入时 skill 相关工具返回"功能未配置"提示。
 */
export interface SkillProvider {
  /** 从指定路径加载 SKILL.md 定义 */
  load(path: string): Promise<{ success: boolean; name?: string; error?: string }>
  /** 执行已加载的 skill */
  execute(
    name: string,
    input?: string,
    parameters?: Record<string, string>,
  ): Promise<SkillExecutionResult>
  /** 搜索 skill catalog，不返回正文 */
  search?(
    query: string,
    options?: { maxResults?: number; minRelevance?: number },
  ): Promise<SkillSearchResult[]>
  /** 创建新的项目级 SKILL.md */
  create?(input: SkillCreateInput): Promise<SkillMutationResult>
  /** 改进既有 SKILL.md，保留原内容并记录变更 */
  improve?(input: SkillImproveInput): Promise<SkillMutationResult>
  /** 构建可注入 system prompt 的 catalog 摘要 */
  catalog?(): Promise<string>
}
