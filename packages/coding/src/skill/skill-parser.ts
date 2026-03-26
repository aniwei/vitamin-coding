// Skill Markdown 解析器 — 基于 remark/unified 的 AST 解析
//
// 使用 remark-parse + remark-frontmatter 解析 SKILL.md，
// 通过 mdast 访问 YAML frontmatter 节点，再用 yaml + zod 校验字段。

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkFrontmatter from 'remark-frontmatter'
import { parse as parseYaml, YAMLParseError } from 'yaml'
import { z } from 'zod'

import type { SkillFrontmatter, SkillDiagnostic } from './types'

// mdast 节点类型（仅用到 Root 和 Yaml，内联避免 @types/mdast 安装问题）
interface MdastPosition {
  start: { line: number; column: number; offset?: number }
  end: { line: number; column: number; offset?: number }
}

interface MdastNode {
  type: string
  position?: MdastPosition
  children?: MdastNode[]
}

interface YamlNode extends MdastNode {
  type: 'yaml'
  value: string
}

interface RootNode extends MdastNode {
  type: 'root'
  children: MdastNode[]
}

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

// remark processor — 识别 YAML frontmatter
const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])

 // 解析 SKILL.md 文件内容，提取 YAML frontmatter 和 body。
 // 使用 remark AST 解析，正确处理：
 // - Windows/Unix 换行
 // - 空 frontmatter
 // - body 中出现 --- 的情况
 // - 多行 YAML 值（block scalar 等)
export function parseSkillFile(
  content: string,
  filePath: string,
): ParseResult {
  const diagnostics: SkillDiagnostic[] = []

  // 解析为 mdast
  const tree = processor.parse(content) as RootNode

  // 在 AST 中查找 yaml 节点（remark-frontmatter 将其解析为 type: 'yaml'）
  const yamlNode = tree.children.find((node): node is YamlNode => node.type === 'yaml')

  // 提取 body — frontmatter 节点之后的所有内容
  const body = extractBody(content, yamlNode)

  if (!yamlNode) {
    return { frontmatter: null, body, diagnostics }
  }

  const rawYaml = yamlNode.value

  // 空 frontmatter（只有 ---\n---）
  if (!rawYaml.trim()) {
    diagnostics.push({
      type: 'warning',
      skillName: '',
      filePath,
      message: 'Empty frontmatter',
    })
    return { frontmatter: null, body, diagnostics }
  }

  // yaml 库解析
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

/**
 * 从原始文本中提取 body — frontmatter 之后的内容。
 * 利用 yaml 节点的 position 信息精确切分，避免手写行扫描。
 */
function extractBody(content: string, yamlNode: YamlNode | undefined): string {
  if (!yamlNode?.position) {
    // 没有 frontmatter，整个文件就是 body
    return content.trim()
  }

  // yamlNode.position.end 指向 frontmatter 值的结尾
  // 闭合 --- 在它之后，需要跳过闭合行
  const afterFrontmatter = content.slice(yamlNode.position.end.offset!)
  // 跳过闭合的 `---` 行
  const closingMatch = afterFrontmatter.match(/^[^\S\n]*---[^\S\n]*\r?\n?/)
  const bodyStart = closingMatch
    ? afterFrontmatter.slice(closingMatch[0].length)
    : afterFrontmatter

  return bodyStart.trim()
}
