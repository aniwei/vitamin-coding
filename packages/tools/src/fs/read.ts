import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isFile, exists, mime } from '@vitamin/shared'
import { truncateHead, formatBytes, normalizePath } from '@vitamin/shared'
import type { AgentTool, ToolResult } from '@vitamin/agent'
import { TOOLS_MAX_OUTPUT_BYTES, TOOLS_MAX_OUTPUT_LINES } from '@vitamin/env'

// 参数 schema
const ReadArgsSchema = z.object({
  path: z.string().describe('Path to the file to read (relative or absolute)'),
  limit: z.number().int().min(1).optional().describe('Maximum number of lines to read (text files only)'),
  offset: z.number().int().min(1).optional().describe('Starting line number (1-based, text files only)'),
})

export type ReadArgs = z.infer<typeof ReadArgsSchema>

// 创建 read 工具
export function createRead(projectRoot: string): AgentTool<ReadArgs> {
 
  return {
    name: 'read',
    description: 'Read file content. For text files, can specify line range with limit and offset.',
    parameters: ReadArgsSchema,
    visibility: 'always',

    async execute(_id, args, signal): Promise<ToolResult> {
      const resolvedPath = resolve(projectRoot, args.path)
      const normalizedPath = normalizePath(resolvedPath)

      // 检查文件是否存在
      if (!await exists(normalizedPath)) {
        throw new Error(`File not found: ${args.path}`)
      }

      if (!await isFile(normalizedPath)) {
        throw new Error(`Not a file: ${args.path}`)
      }

      const mt = await mime(normalizedPath)
      const isSuppotedImage = mt?.startsWith('image/') && mt !== 'image/svg+xml'

      // 图片文件处理
      if (isSuppotedImage) {
        return readImage(normalizedPath, args.path, mt)
      } 

      // 文本文件处理
      return readTextWithRange(
        normalizedPath, 
        args.path, 
        args.limit, 
        args.offset
      )
    },
  }
}

// 读取图片文件并返回 base64 编码
async function readImage(
  absolutePath: string, 
  displayPath: string,
  mime?: string,
): Promise<ToolResult> {
  const buffer = await readFile(absolutePath)
  const base64 = buffer.toString('base64')

  return {
    content: [{
      type: 'text',
      text: `Read image file ${displayPath} (${buffer.length} bytes)`,
    }, {
      type: 'image',
      mime,
      source: `data:${mime};base64,${base64}`,
    }],
    details: { 
      path: absolutePath, 
      type: 'image', 
      size: buffer.length, 
      mime 
    }
  }
}

// 读取文本文件并按行范围裁切
async function readTextWithRange(
  absolutePath: string,
  displayPath: string,
  offset: number = 1,
  limit: number = TOOLS_MAX_OUTPUT_LINES,
  maxBytes: number = TOOLS_MAX_OUTPUT_LINES,
): Promise<ToolResult> {
  const content = await readFile(absolutePath, 'utf-8')
  if (content === undefined) {
    throw new Error(`Failed to read file ${displayPath}`)
  }

  const lines = content.split('\n')

  const start = offset ? Math.max(0, offset - 1) : 0
  const displayLine = start + 1

  // Check if offset is out of bounds
  if (start >= lines.length) {
    throw new Error(`Offset ${offset} is beyond end of file (${lines.length} lines total)`)
  }

  let selectedContent: string
  let userLimitedLines: number | undefined

  const end = Math.min(start + limit, lines.length)
  selectedContent = lines.slice(start, end).join('\n')
  userLimitedLines = end - start

  const truncation = truncateHead(selectedContent, {
    maxBytes: TOOLS_MAX_OUTPUT_BYTES,
    maxLines: TOOLS_MAX_OUTPUT_LINES
  })
  let output: string

  if (truncation.firstLineExceedsLimit) {
    // 第一个行超过限制 - 提示模型使用 bash 来读取特定行
    const size = formatBytes(Buffer.byteLength(lines[start] as string, 'utf-8'))
    output = `(Line ${displayLine} is ${size}, exceeds ${formatBytes(maxBytes)} limit. Use bash: sed -n '${displayLine}p' ${absolutePath} | head -c ${maxBytes})`
  } else if (truncation.truncated) {
    const end = displayLine + truncation.outputLines - 1
    const offset = end + 1

    output = truncation.content

    if (truncation.truncatedBy === 'lines') {
      output += `\n\n(Showing lines ${displayLine}-${end} of ${lines.length}. Use offset=${offset} to continue)`;
    } else {
      output += `\n\n(Showing lines ${displayLine}-${end} of ${lines.length} (${formatBytes(maxBytes)} limit). Use offset=${offset} to continue)`;
    }

  } else if (userLimitedLines !== undefined && start + userLimitedLines < lines.length) {
    const remaining = lines.length - (start + userLimitedLines)
    const offset = start + userLimitedLines + 1

    output = truncation.content;
    output += `\n\n(${remaining} more lines in file. Use offset=${offset} to continue)`;
  } else {
    // No truncation, no user limit exceeded
    output = truncation.content;
  }

  return {
    content: [{ type: 'text', text: output }],
    details: {
      truncation
    }
  }
}
