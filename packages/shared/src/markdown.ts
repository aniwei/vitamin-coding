// ═══════════════════════════════════════════════════════════
// Markdown 解析基础设施
// ═══════════════════════════════════════════════════════════
// 提供 mdast 类型、remark processor 工厂、AST 遍历辅助函数、
// frontmatter 提取等通用能力，供 skill / plan 解析器复用。

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'

// ═══ mdast 类型（内联声明，避免 @types/mdast 安装问题）═══

export interface MdastPosition {
  start: { line: number; column: number; offset?: number }
  end: { line: number; column: number; offset?: number }
}

export interface MdastNode {
  type: string
  position?: MdastPosition
  children?: MdastNode[]
  value?: string
  depth?: number
  checked?: boolean | null
}

export interface YamlNode extends MdastNode {
  type: 'yaml'
  value: string
}

export interface RootNode extends MdastNode {
  type: 'root'
  children: MdastNode[]
}

// ═══ Processor 类型 ═══

/** Markdown processor — 仅暴露 parse 方法，避免依赖 unified 的完整类型 */
export interface MarkdownProcessor {
  parse(content: string): RootNode
}

// ═══ Processor 工厂 ═══

/** 创建基础 remark processor（仅 remark-parse） */
export function createMarkdownProcessor(): MarkdownProcessor {
  return unified().use(remarkParse) as unknown as MarkdownProcessor
}

/** 创建 GFM remark processor（remark-parse + remark-gfm） */
export function createGfmProcessor(): MarkdownProcessor {
  return unified().use(remarkParse).use(remarkGfm) as unknown as MarkdownProcessor
}

/** 创建 frontmatter remark processor（remark-parse + remark-frontmatter） */
export function createFrontmatterProcessor(): MarkdownProcessor {
  return unified().use(remarkParse).use(remarkFrontmatter, ['yaml']) as unknown as MarkdownProcessor
}

// ═══ AST 遍历辅助函数 ═══

/** 递归提取节点的纯文本内容 */
export function getNodeText(node: MdastNode): string {
  if (node.value !== undefined) return node.value
  if (!node.children) return ''
  return node.children.map(getNodeText).join('')
}

/**
 * 从段落中提取所有 **Label:** value 模式的键值对。
 * 处理同一段落内含多个 bold label 的情况。
 */
export function extractBoldLabels(node: MdastNode): Array<{ label: string; rest: string }> {
  if (node.type !== 'paragraph' || !node.children?.length) return []
  const results: Array<{ label: string; rest: string }> = []
  const children = node.children

  for (let i = 0; i < children.length; i++) {
    const child = children[i]!
    if (child.type === 'strong' && child.children?.length) {
      const strongText = getNodeText(child)
      if (strongText.endsWith(':')) {
        const label = strongText.slice(0, -1)
        const restParts: string[] = []
        for (let j = i + 1; j < children.length; j++) {
          if (children[j]!.type === 'strong') break
          restParts.push(getNodeText(children[j]!))
        }
        results.push({ label, rest: restParts.join('').trim() })
      }
    }
  }

  return results
}

/** 递归提取所有 inlineCode 节点的值 */
export function extractInlineCodes(node: MdastNode): string[] {
  const codes: string[] = []
  function walk(n: MdastNode) {
    if (n.type === 'inlineCode' && n.value) {
      codes.push(n.value)
    }
    if (n.children) {
      for (const child of n.children) walk(child)
    }
  }
  walk(node)
  return codes
}

/** 统计 list 中 task list 项的勾选情况 */
export function countChecks(items: MdastNode[]): { total: number; checked: number } {
  let total = 0
  let checked = 0
  for (const item of items) {
    if (item.type === 'listItem' && typeof item.checked === 'boolean') {
      total++
      if (item.checked) checked++
    }
  }
  return { total, checked }
}

// ═══ Frontmatter 提取 ═══

/**
 * 行级扫描提取 frontmatter 和 body。
 * 正确处理 Windows/Unix 换行、空 frontmatter、body 中出现 --- 的情况。
 */
export function extractFrontmatter(content: string): { yaml: string | null; body: string } {
  const lines = content.split(/\r?\n/)

  if (lines[0]?.trim() !== '---') {
    return { yaml: null, body: content.trim() }
  }

  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      const yaml = lines.slice(1, i).join('\n')
      const body = lines
        .slice(i + 1)
        .join('\n')
        .trim()
      return { yaml, body }
    }
  }

  return { yaml: null, body: content.trim() }
}

/**
 * 基于 AST 的 body 提取 — 利用 yaml 节点的 position 信息精确切分。
 * 需配合 createFrontmatterProcessor 使用。
 */
export function extractBodyFromAst(content: string, yamlNode: YamlNode | undefined): string {
  if (!yamlNode?.position) {
    return content.trim()
  }

  const afterFrontmatter = content.slice(yamlNode.position.end.offset!)
  const closingMatch = afterFrontmatter.match(/^[^\S\n]*---[^\S\n]*\r?\n?/)
  const bodyStart = closingMatch ? afterFrontmatter.slice(closingMatch[0].length) : afterFrontmatter

  return bodyStart.trim()
}
