// Skill 解析器 — 解析 SKILL.md 文件为 SkillDefinition
// 支持 YAML frontmatter + Markdown body

import { parseYamlFrontmatter } from '@x-mars/manifest'
import { createLogger } from '@x-mars/shared'
import type {
  SkillDefinition,
  SkillEnvironmentVariableRequirement,
  SkillMetadata,
  SkillSetupMetadata,
} from './types'

const logger = createLogger('@x-mars/skill:parser')

/**
 * 从 SKILL.md 原始文本解析出 SkillDefinition
 */
export function parseSkillContent(
  content: string,
  filePath: string,
  directory: string,
  supportingFiles: string[] = [],
): SkillDefinition {
  let parsed: ReturnType<typeof parseYamlFrontmatter>
  try {
    parsed = parseYamlFrontmatter(content, filePath)
  } catch (error) {
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
    if (code === 'missing_frontmatter') {
      throw new Error(`SKILL.md at "${filePath}" has no valid YAML frontmatter`)
    }
    throw error
  }

  const raw = parsed.metadata
  if (!raw || typeof raw !== 'object') {
    throw new Error(`YAML frontmatter in "${filePath}" is not a valid object`)
  }

  const metadata = extractMetadata(raw, filePath)

  return {
    metadata,
    body: parsed.body.trim(),
    directory,
    filePath,
    supportingFiles,
  }
}

/**
 * 从 raw YAML 提取并验证 SkillMetadata
 */
function extractMetadata(raw: Record<string, unknown>, filePath: string): SkillMetadata {
  const name = raw['name']
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`SKILL.md at "${filePath}" missing required "name" field in frontmatter`)
  }

  // 验证 name 格式 (kebab-case: 字母、数字、连字符)
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(name)) {
    logger.warn('Skill name "%s" in "%s" does not follow kebab-case convention', name, filePath)
  }

  const description = raw['description']
  if (typeof description !== 'string' || description.length === 0) {
    throw new Error(`SKILL.md at "${filePath}" missing required "description" field in frontmatter`)
  }

  // frontmatter 总长度限制 (agentskills.io spec)
  const frontmatterText = `${name}\n${description}`
  if (frontmatterText.length > 1024) {
    logger.warn(
      'Skill "%s" frontmatter exceeds 1024 character limit (%d chars)',
      name,
      frontmatterText.length,
    )
  }

  return {
    name,
    description,
    version: typeof raw['version'] === 'string' ? raw['version'] : undefined,
    author: typeof raw['author'] === 'string' ? raw['author'] : undefined,
    tags: Array.isArray(raw['tags'])
      ? raw['tags'].filter((t): t is string => typeof t === 'string')
      : undefined,
    dependencies: Array.isArray(raw['dependencies'])
      ? raw['dependencies'].filter((d): d is string => typeof d === 'string')
      : undefined,
    trigger: raw['trigger'] === 'manual' ? 'manual' : 'auto',
    priority: typeof raw['priority'] === 'number' ? raw['priority'] : 100,
    platforms: extractPlatforms(raw['platforms']),
    requiredEnvironmentVariables: extractRequiredEnvironmentVariables(raw),
    setup: extractSetup(raw['setup']),
  }
}

function extractPlatforms(value: unknown): Array<'macos' | 'linux' | 'windows'> | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const platforms = value.filter(
    (platform): platform is 'macos' | 'linux' | 'windows' =>
      platform === 'macos' || platform === 'linux' || platform === 'windows',
  )

  return platforms.length > 0 ? platforms : undefined
}

function extractRequiredEnvironmentVariables(
  raw: Record<string, unknown>,
): SkillEnvironmentVariableRequirement[] | undefined {
  const values: SkillEnvironmentVariableRequirement[] = []

  const required = raw['required_environment_variables']
  const requiredList = Array.isArray(required) ? required : required ? [required] : []
  for (const item of requiredList) {
    const entry = normalizeEnvironmentVariableRequirement(item)
    if (entry) {
      values.push(entry)
    }
  }

  const prereqs = raw['prerequisites']
  if (prereqs && typeof prereqs === 'object') {
    const envVars = (prereqs as Record<string, unknown>)['env_vars']
    const envList = Array.isArray(envVars) ? envVars : envVars ? [envVars] : []
    for (const item of envList) {
      const entry = normalizeEnvironmentVariableRequirement(item)
      if (entry && !values.some((existing) => existing.name === entry.name)) {
        values.push(entry)
      }
    }
  }

  return values.length > 0 ? values : undefined
}

function extractSetup(value: unknown): SkillSetupMetadata | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const raw = value as Record<string, unknown>
  const setup: SkillSetupMetadata = {}

  if (typeof raw['help'] === 'string' && raw['help'].trim()) {
    setup.help = raw['help'].trim()
  }

  const collectSecrets = raw['collect_secrets']
  const rawList = Array.isArray(collectSecrets)
    ? collectSecrets
    : collectSecrets
      ? [collectSecrets]
      : []
  const secrets = rawList
    .map(normalizeEnvironmentVariableRequirement)
    .filter((entry): entry is SkillEnvironmentVariableRequirement => entry !== undefined)
  if (secrets.length > 0) {
    setup.collectSecrets = secrets
  }

  return setup.help || setup.collectSecrets?.length ? setup : undefined
}

function normalizeEnvironmentVariableRequirement(
  value: unknown,
): SkillEnvironmentVariableRequirement | undefined {
  if (typeof value === 'string') {
    const name = value.trim()
    return isValidEnvName(name) ? { name, required: true } : undefined
  }

  if (!value || typeof value !== 'object') {
    return undefined
  }

  const raw = value as Record<string, unknown>
  const nameValue = raw['name'] ?? raw['env_var']
  if (typeof nameValue !== 'string') {
    return undefined
  }

  const name = nameValue.trim()
  if (!isValidEnvName(name)) {
    return undefined
  }

  return {
    name,
    description: typeof raw['description'] === 'string' ? raw['description'] : undefined,
    required: typeof raw['required'] === 'boolean' ? raw['required'] : true,
    secret: typeof raw['secret'] === 'boolean' ? raw['secret'] : undefined,
  }
}

function isValidEnvName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
}
