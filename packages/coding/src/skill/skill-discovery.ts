// Skill 发现与加载 — 通过 SkillReader 抽象统一本地/远程读取

import { join } from 'node:path'
import { homedir } from 'node:os'
import { parseSkillFile } from './skill-parser'
import { LocalSkillReader, deriveSkillName } from './local-reader'
import type {
  Skill,
  SkillDiagnostic,
  SkillReader,
  SkillContent,
  LoadSkillsOptions,
  LoadSkillsResult,
} from './types'

 // 从多个 SkillReader 扫描并加载所有 Skill
 //
 // 默认构建 LocalSkillReader 扫描：
 //   1. ~/.vitamin/skills/  — 用户全局
 //   2. <cwd>/.vitamin/skills/  — 项目本地
 //   3. skillPaths 显式路径
 //
 // 可通过 options.readers 注入额外读取器（如 RemoteSkillReader）
 // 同名 Skill 按先到者胜，后续冲突产生 collision 诊断
export async function loadSkills(
  options: LoadSkillsOptions = {},
): Promise<LoadSkillsResult> {
  const cwd = options.cwd ?? process.cwd()
  const agentDir = options.agentDir ?? join(homedir(), '.vitamin')
  const includeDefaults = options.includeDefaults ?? true

  // 构建默认的本地读取器
  const directories: Array<{ path: string; source: 'user' | 'project' | 'path' }> = []

  if (includeDefaults) {
    directories.push({ path: join(agentDir, 'skills'), source: 'user' })
    directories.push({ path: join(cwd, '.vitamin', 'skills'), source: 'project' })
  }

  if (options.skillPaths) {
    for (const p of options.skillPaths) {
      directories.push({ path: p, source: 'path' })
    }
  }

  const readers: SkillReader[] = []

  if (directories.length > 0) {
    readers.push(new LocalSkillReader({ directories }))
  }

  // 注入额外读取器
  if (options.readers) {
    readers.push(...options.readers)
  }

  // 从所有读取器收集 Skill
  const allSkills: Skill[] = []
  const diagnostics: SkillDiagnostic[] = []
  const seenNames = new Map<string, string>()

  for (const reader of readers) {
    const entries = await reader.discover()

    for (const entry of entries) {
      const content = await reader.read(entry)
      if (!content) continue

      const skill = buildSkill(content, diagnostics)
      if (!skill) continue

      // 名称冲突检测
      const existing = seenNames.get(skill.name)
      if (existing) {
        diagnostics.push({
          type: 'collision',
          skillName: skill.name,
          filePath: skill.filePath,
          message: `Skill "${skill.name}" already loaded from ${existing}`,
        })
        continue
      }

      seenNames.set(skill.name, skill.filePath)
      allSkills.push(skill)
    }
  }

  return { skills: allSkills, diagnostics }
}

/**
 * 从读取到的内容构建 Skill 对象
 */
function buildSkill(
  content: SkillContent,
  diagnostics: SkillDiagnostic[],
): Skill | null {
  const { frontmatter, body, diagnostics: parseDiags } = parseSkillFile(
    content.content,
    content.location,
  )
  diagnostics.push(...parseDiags)

  const name = frontmatter?.name ?? deriveSkillName(content.location)

  if (!frontmatter?.description) {
    diagnostics.push({
      type: 'warning',
      skillName: name,
      filePath: content.location,
      message: 'Skill has no description — LLM cannot determine when to use it',
    })
  }

  return {
    name,
    description: frontmatter?.description ?? '',
    filePath: content.location,
    directory: content.directory,
    body,
    source: content.source,
    disableModelInvocation: frontmatter?.['disable-model-invocation'] === true,
  }
}
