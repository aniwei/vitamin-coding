// Skill 解析器 — 解析 SKILL.md 文件为 SkillDefinition
// 支持 YAML frontmatter + Markdown body

import { parse as parseYaml } from 'yaml'
import { createLogger } from '@vitamin/shared'
import type { SkillMetadata, SkillDefinition } from './types'

const logger = createLogger('@vitamin/skill:parser')

// frontmatter 分隔符正则
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/

/**
 * 从 SKILL.md 原始文本解析出 SkillDefinition
 */
export function parseSkillContent(
  content: string,
  filePath: string,
  directory: string,
  supportingFiles: string[] = [],
): SkillDefinition {
  const match = FRONTMATTER_RE.exec(content.trim())

  if (!match) {
    throw new Error(`SKILL.md at "${filePath}" has no valid YAML frontmatter`)
  }

  const [, yamlStr, body] = match
  let raw: Record<string, unknown>

  try {
    raw = parseYaml(yamlStr!) as Record<string, unknown>
  } catch (err) {
    throw new Error(
      `Failed to parse YAML frontmatter in "${filePath}": ${(err as Error).message}`,
    )
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error(`YAML frontmatter in "${filePath}" is not a valid object`)
  }

  const metadata = extractMetadata(raw, filePath)

  return {
    metadata,
    body: (body ?? '').trim(),
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
    logger.warn(
      'Skill name "%s" in "%s" does not follow kebab-case convention',
      name,
      filePath,
    )
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
    tags: Array.isArray(raw['tags']) ? raw['tags'].filter((t): t is string => typeof t === 'string') : undefined,
    dependencies: Array.isArray(raw['dependencies'])
      ? raw['dependencies'].filter((d): d is string => typeof d === 'string')
      : undefined,
    trigger: raw['trigger'] === 'manual' ? 'manual' : 'auto',
    priority: typeof raw['priority'] === 'number' ? raw['priority'] : 100,
  }
}
