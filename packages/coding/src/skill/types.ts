// Skill 系统类型定义

/** Skill 来源标识 */
export type SkillSource = 'user' | 'project' | 'path' | 'remote'

/** SKILL.md frontmatter 字段 */
export interface SkillFrontmatter {
  /** Skill 名称，仅 [a-z0-9-]，≤ 64 字符 */
  name?: string
  /** Skill 描述，≤ 1024 字符，用于 LLM 判断是否加载 */
  description: string
  /** 为 true 时不写入 System Prompt，仅可通过显式调用加载 */
  'disable-model-invocation'?: boolean
}

/** 已解析的 Skill */
export interface Skill {
  /** Skill 名称（来自 frontmatter 或目录名） */
  name: string
  /** 描述 */
  description: string
  /** SKILL.md 文件的绝对路径或 URL */
  filePath: string
  /** Skill 所在目录的绝对路径（remote 时为 URL 前缀） */
  directory: string
  /** Markdown body（不含 frontmatter） */
  body: string
  /** 来源 */
  source: SkillSource
  /** 是否禁止自动注入 System Prompt */
  disableModelInvocation: boolean
}

/** 资源诊断信息 */
export interface SkillDiagnostic {
  type: 'warning' | 'collision' | 'error'
  skillName: string
  filePath: string
  message: string
}

/** loadSkills 的返回结果 */
export interface LoadSkillsResult {
  skills: Skill[]
  diagnostics: SkillDiagnostic[]
}

/** loadSkills 配置 */
export interface LoadSkillsOptions {
  /** 项目根目录，默认 process.cwd() */
  cwd?: string
  /** Agent 配置目录，默认 ~/.vitamin */
  agentDir?: string
  /** 显式 Skill 路径（文件或目录） */
  skillPaths?: string[]
  /** 是否包含默认目录，默认 true */
  includeDefaults?: boolean
  /** 额外的 SkillReader 实例（如 RemoteSkillReader） */
  readers?: SkillReader[]
}

// ── SkillReader 抽象接口 ──────────────────────────────────────────

/** Skill 读取入口描述 */
export interface SkillEntry {
  /** 文件路径或 URL */
  location: string
  /** 来源（用于标记 Skill.source） */
  source: SkillSource
}

/** 读取到的原始内容 */
export interface SkillContent {
  /** 文件原始文本 */
  content: string
  /** 文件路径或 URL */
  location: string
  /** 推导目录（用于相对路径解析） */
  directory: string
  /** 来源 */
  source: SkillSource
}

/**
 * Skill 读取器抽象 — 支持本地/远程等不同来源
 */
export interface SkillReader {
  /** 列举所有可发现的 Skill 入口 */
  discover(): Promise<SkillEntry[]>
  /** 读取单个 Skill 文件内容 */
  read(entry: SkillEntry): Promise<SkillContent | null>
}
