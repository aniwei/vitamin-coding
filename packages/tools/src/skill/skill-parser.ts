import { parse as parseYaml, YAMLParseError } from 'yaml'
import { z } from 'zod'
import type { SkillFrontmatter, SkillDiagnostic } from './types'

// Skill 名称验证：仅 [a-z0-9-]，≤ 64 字符，不以 - 开头/结尾，无连续 --
const SKILL_NAME_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

// Zod schema — frontmatter 字段校验
const FrontmatterSchema = z.object({
  name: z.string().max(64).optional(),
  description: z.string().max(1024),
  'disable-model-invocation': z.boolean().optional(),
}).passthrough()

export interface ParseResult {
  frontmatter: SkillFrontmatter | null
  body: string
  diagnostics: SkillDiagnostic[]
}

// 从 Markdown 文本中提取 frontmatter 和 body
// 
// 使用行级扫描而非正则，正确处理：
// - Windows/Unix 换行
// - 空 frontmatter
// - body 中出现 --- 的情况
function extractFrontmatter(content: string): { yaml: string | null; body: string } {
  const lines = content.split(/\r?\n/)

  // 第一行必须是 ---
  if (lines[0]?.trim() !== '---') {
    return { yaml: null, body: content.trim() }
  }

  // 寻找闭合 ---
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      const yaml = lines.slice(1, i).join('\n')
      const body = lines.slice(i + 1).join('\n').trim()
      return { yaml, body }
    }
  }

  // 未闭合 — 视为无 frontmatter
  return { yaml: null, body: content.trim() }
}

// 解析 SKILL.md 文件内容，提取 YAML frontmatter 和 body
export function parseSkillFile(
  content: string,
  filePath: string,
): ParseResult {
  const diagnostics: SkillDiagnostic[] = []
  const { yaml: rawYaml, body } = extractFrontmatter(content)

  if (rawYaml === null) {
    return { frontmatter: null, body, diagnostics }
  }

  // 用 yaml 库解析
  let parsed: unknown
  try {
    parsed = parseYaml(rawYaml)
  } catch (err) {
    const message = err instanceof YAMLParseError
      ? `YAML parse error: ${err.message}`
      : `YAML parse error: ${String(err)}`
    diagnostics.push({ type: 'error', skillName: '', filePath, message })
    return { frontmatter: null, body, diagnostics }
  }

  // 空 frontmatter (只有 ---)
  if (parsed === null || parsed === undefined) {
    diagnostics.push({
      type: 'warning',
      skillName: '',
      filePath,
      message: 'Empty frontmatter',
    })
    return { frontmatter: null, body, diagnostics }
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    diagnostics.push({
      type: 'error',
      skillName: '',
      filePath,
      message: 'Frontmatter must be a YAML mapping (key-value pairs)',
    })
    return { frontmatter: null, body, diagnostics }
  }

  // Zod schema 校验
  const result = FrontmatterSchema.safeParse(parsed)
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.')
      diagnostics.push({
        type: 'warning',
        skillName: (parsed as Record<string, unknown>).name as string ?? '',
        filePath,
        message: `Frontmatter validation: ${path ? `${path}: ` : ''}${issue.message}`,
      })
    }
    // 即使校验不通过也尽量提取可用字段
    const raw = parsed as Record<string, unknown>
    const frontmatter: SkillFrontmatter = {
      description: typeof raw.description === 'string' ? raw.description : '',
    }
    if (typeof raw.name === 'string') frontmatter.name = raw.name
    if (typeof raw['disable-model-invocation'] === 'boolean') {
      frontmatter['disable-model-invocation'] = raw['disable-model-invocation']
    }
    return { frontmatter, body, diagnostics }
  }

  const data = result.data

  // 额外校验 name 格式
  if (data.name) {
    if (!SKILL_NAME_RE.test(data.name)) {
      diagnostics.push({
        type: 'warning',
        skillName: data.name,
        filePath,
        message: `Skill name "${data.name}" does not match pattern [a-z0-9-]`,
      })
    } else if (data.name.includes('--')) {
      diagnostics.push({
        type: 'warning',
        skillName: data.name,
        filePath,
        message: `Skill name "${data.name}" contains consecutive hyphens`,
      })
    }
  }

  const frontmatter: SkillFrontmatter = {
    description: data.description,
  }

  if (data.name) frontmatter.name = data.name
  if (data['disable-model-invocation'] !== undefined) {
    frontmatter['disable-model-invocation'] = data['disable-model-invocation']
  }

  return { frontmatter, body, diagnostics }
}
