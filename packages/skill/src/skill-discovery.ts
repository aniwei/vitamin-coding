// Skill 发现器 — 扫描文件系统发现 SKILL.md 文件
// 支持项目本地目录和全局目录

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createLogger } from '@vitamin/shared'
import { parseSkillContent } from './skill-parser'
import type { SkillDefinition, SkillSource, SkillSourceType, SkillLibraryConfig } from './types'

const logger = createLogger('@vitamin/skill:discovery')

const SKILL_FILENAME = 'SKILL.md'

/**
 * 扫描指定目录列表，发现所有有效 skill
 */
export async function discoverSkills(
  config: SkillLibraryConfig,
  workspaceDir: string,
): Promise<Map<string, { definition: SkillDefinition; source: SkillSource }>> {
  const results = new Map<string, { definition: SkillDefinition; source: SkillSource }>()

  // 1. 扫描项目本地 skill 目录
  const projectDirs = config.projectDirs ?? ['.vitamin/skills']
  for (const relDir of projectDirs) {
    const absDir = path.resolve(workspaceDir, relDir)
    const source: SkillSource = { type: 'project', root: absDir }
    const skills = await scanDirectory(absDir, source)

    for (const [name, entry] of skills) {
      // 项目 skill 优先于全局 skill
      results.set(name, entry)
    }
  }

  // 2. 扫描全局 skill 目录
  const globalDirs = config.globalDirs ?? []
  for (const absDir of globalDirs) {
    const source: SkillSource = { type: 'global', root: absDir }
    const skills = await scanDirectory(absDir, source)

    for (const [name, entry] of skills) {
      // 不覆盖已有的项目 skill
      if (!results.has(name)) {
        results.set(name, entry)
      }
    }
  }

  logger.info(
    'Discovered %d skills from %d directories',
    results.size,
    projectDirs.length + globalDirs.length,
  )

  return results
}

/**
 * 扫描单个目录下的所有 skill 子目录
 *
 * 目录结构:
 *   skills/
 *     skill-name/
 *       SKILL.md
 *       supporting-file.ts
 *     another-skill/
 *       SKILL.md
 */
async function scanDirectory(
  dir: string,
  source: SkillSource,
): Promise<Map<string, { definition: SkillDefinition; source: SkillSource }>> {
  const results = new Map<string, { definition: SkillDefinition; source: SkillSource }>()

  if (!fs.existsSync(dir)) {
    logger.debug('Skill directory does not exist: %s', dir)
    return results
  }

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    logger.warn('Cannot read skill directory: %s', dir)
    return results
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      // 根目录下直接放 SKILL.md 的情况 (flat layout)
      if (entry.name === SKILL_FILENAME) {
        const skill = await tryParseSkill(dir, dir, source)
        if (skill) {
          results.set(skill.definition.metadata.name, skill)
        }
      }
      continue
    }

    const skillDir = path.join(dir, entry.name)
    const skillFile = path.join(skillDir, SKILL_FILENAME)

    if (!fs.existsSync(skillFile)) continue

    const skill = await tryParseSkill(skillDir, skillFile, source)
    if (skill) {
      results.set(skill.definition.metadata.name, skill)
    }
  }

  return results
}

/**
 * 尝试读取并解析单个 SKILL.md
 */
async function tryParseSkill(
  skillDir: string,
  _skillFilePath: string,
  source: SkillSource,
): Promise<{ definition: SkillDefinition; source: SkillSource } | null> {
  const skillFile = path.join(skillDir, SKILL_FILENAME)

  try {
    const content = fs.readFileSync(skillFile, 'utf-8')
    const supportingFiles = listSupportingFiles(skillDir)
    const definition = parseSkillContent(content, skillFile, skillDir, supportingFiles)

    logger.debug('Parsed skill "%s" from %s', definition.metadata.name, skillFile)

    return { definition, source }
  } catch (err) {
    logger.warn('Failed to parse skill at "%s": %s', skillFile, (err as Error).message)
    return null
  }
}

/**
 * 列出 skill 目录下的附属文件（排除 SKILL.md 自身）
 */
function listSupportingFiles(skillDir: string): string[] {
  try {
    return fs
      .readdirSync(skillDir)
      .filter((name) => name !== SKILL_FILENAME)
      .map((name) => path.join(skillDir, name))
  } catch {
    return []
  }
}

/**
 * 获取默认的全局 skill 目录列表
 */
export function getDefaultGlobalSkillDirs(): string[] {
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? ''
  if (!home) return []

  return [path.join(home, '.vitamin', 'skills')]
}

/**
 * 检查 skill source type
 */
export function resolveSourceType(dir: string, workspaceDir: string): SkillSourceType {
  if (dir.startsWith(workspaceDir)) return 'project'
  return 'global'
}
