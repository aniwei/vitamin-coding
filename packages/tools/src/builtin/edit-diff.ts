// edit-diff 工具 — 模糊匹配差异编辑
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'
import { readText, writeText, resolvePath, normalizePath, exists } from '@vitamin/shared'

const EditDiffArgsSchema = z.object({
  path: z.string().describe('要编辑的文件路径'),
  oldString: z.string().describe('要替换的文本（支持模糊匹配）'),
  newString: z.string().describe('替换后的新文本'),
  fuzzyThreshold: z.number().min(0).max(1).optional().default(0.8)
    .describe('模糊匹配阈值（0-1，默认 0.8）'),
})

type EditDiffArgs = z.infer<typeof EditDiffArgsSchema>

interface EditDiffOptions {
  projectRoot: string,
}

export function createEditDiff(options: EditDiffOptions): AgentTool<EditDiffArgs> {
  const { projectRoot } = options
  
  return {
    name: 'edit-diff',
    description: '模糊匹配编辑：当 oldString 有微小差异时仍能匹配并替换。',
    parameters: EditDiffArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      const resolved = normalizePath(resolvePath(projectRoot, args.path))

      if (!(await exists(resolved))) {
        return { content: [{ type: 'text', text: `File not found: ${args.path}` }], isError: true }
      }

      const content = await readText(resolved)

      if (content === undefined) {
        return { content: [{ type: 'text', text: `Failed to read file: ${args.path}` }], isError: true }
      }

      // 精确匹配
      if (content.includes(args.oldString)) {
        const updated = content.replace(args.oldString, args.newString)
        await writeText(resolved, updated)
        return { content: [{ type: 'text', text: `Exact match replaced in ${args.path}` }] }
      }

      // 模糊匹配 — 按行计算相似度
      const oldLines = args.oldString.split('\n')
      const contentLines = content.split('\n')
      const bestMatch = findBestFuzzyMatch(contentLines, oldLines, args.fuzzyThreshold)

      if (bestMatch) {
        const before = contentLines.slice(0, bestMatch.start)
        const after = contentLines.slice(bestMatch.end)
        const updated = [...before, args.newString, ...after].join('\n')
        await writeText(resolved, updated)
        return {
          content: [{
            type: 'text',
            text: `Fuzzy match (similarity: ${bestMatch.similarity.toFixed(2)}) replaced at lines ${bestMatch.start + 1}-${bestMatch.end} in ${args.path}`,
          }],
        }
      }

      return {
        content: [{ type: 'text', text: `No match found for oldString in ${args.path} (threshold: ${args.fuzzyThreshold})` }],
        isError: true,
      }
    },
  }
}

// 滑动窗口模糊匹配
function findBestFuzzyMatch(
  contentLines: string[],
  oldLines: string[],
  threshold: number,
): { start: number; end: number; similarity: number } | undefined {
  let bestSimilarity = 0
  let bestStart = -1

  for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
    const window = contentLines.slice(i, i + oldLines.length)
    const similarity = computeLineSimilarity(window, oldLines)

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity
      bestStart = i
    }
  }

  if (bestSimilarity >= threshold && bestStart >= 0) {
    return { start: bestStart, end: bestStart + oldLines.length, similarity: bestSimilarity }
  }

  return undefined
}

// 行级相似度 (匹配行数 / 总行数)
function computeLineSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  const maxLen = Math.max(a.length, b.length)
  let matched = 0

  for (let i = 0; i < maxLen; i++) {
    const lineA = a[i]?.trim() ?? ''
    const lineB = b[i]?.trim() ?? ''
    if (lineA === lineB) {
      matched++
    } else if (lineA.length > 0 && lineB.length > 0) {
      // 字符级相似度
      const charSim = computeCharSimilarity(lineA, lineB)
      if (charSim > 0.8) matched += charSim
    }
  }

  return matched / maxLen
}

// 简单字符相似度 (公共字符 / 最大长度)
function computeCharSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  let common = 0
  const shorter = a.length <= b.length ? a : b
  const longer = a.length > b.length ? a : b

  for (const char of shorter) {
    if (longer.includes(char)) common++
  }

  return common / maxLen
}
