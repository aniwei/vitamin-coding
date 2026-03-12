import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

import { isFile, exists, readText } from '@vitamin/shared'
import { normalizePath, resolvePath } from '@vitamin/shared'
// read 工具 — 读取文件内容
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'


const IMAGE_MAX_SIZE = 5 * 1024 * 1024
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])


// 参数 schema
const ReadArgsSchema = z.object({
  path: z.string().describe('要读取的文件路径（相对于项目根目录或绝对路径）'),
  startLine: z.number().int().min(1).optional().describe('起始行号（1-based，仅文本文件）'),
  endLine: z.number().int().min(1).optional().describe('结束行号（1-based，包含，仅文本文件）'),
})

type ReadArgs = z.infer<typeof ReadArgsSchema>

export interface ReadToolOptions {
  
}

// 创建 read 工具
export function createRead(projectRoot: string, options: ReadToolOptions): AgentTool<ReadArgs> {
  const { 
    imageMaxSize = IMAGE_MAX_SIZE, 
    imageExts = IMAGE_EXTS
  } = options

  return {
    name: 'read',
    description: '读取文件内容，可选指定行范围',
    parameters: ReadArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      const resolvedPath = resolvePath(projectRoot, args.path)
      const normalizedPath = normalizePath(resolvedPath)

      // 检查文件是否存在
      if (!(await exists(normalizedPath))) {
        return {
          content: [{ type: 'text', text: `File not found: ${args.path}` }],
          isError: true,
        }
      }

      if (!(await isFile(normalizedPath))) {
        return {
          content: [{ type: 'text', text: `Not a file: ${args.path}` }],
          isError: true,
        }
      }

      // 检查是否为图片文件
      const ext = extname(normalizedPath).toLowerCase()
      if (imageExts?.has(ext)) {
        return readImageFile(
          normalizedPath, 
          args.path, 
          imageMaxSize
        )
      }

      // 文本文件处理
      return readTextWithRange(
        normalizedPath, 
        args.path, 
        args.startLine, 
        args.endLine
      )
    },
  }
}

// 读取图片文件并返回 base64 编码
async function readImageFile(
  absolutePath: string, 
  displayPath: string,
  maxSize: number
): Promise<ToolResult> {
  try {
    const buffer = await readFile(absolutePath)
    if (buffer.length > maxSize) {
      return {
        content: [{
          type: 'text',
          text: `Image too large: ${displayPath} (${(buffer.length / 1024 / 1024).toFixed(1)}MB, max ${(maxSize / 1024 / 1024).toFixed(1)}MB)`,
        }],
        isError: true,
      }
    }

    const ext = extname(absolutePath).toLowerCase()
    // SVG 返回文本内容
    if (ext === '.svg') {
      return {
        content: [{ type: 'text', text: buffer.toString('utf-8') }],
        metadata: { path: absolutePath, type: 'svg', size: buffer.length },
      }
    }

    let mediaType = 'image/jpeg' // 默认媒体类型
    if (ext === '.png') {
      mediaType = 'image/png'
    } else if (ext === '.gif') {
      mediaType = 'image/gif'
    } else if (ext === '.webp') {
      mediaType = 'image/webp'
    } else if (ext === '.bmp') {
      mediaType = 'image/bmp'
    }

    const base64 = buffer.toString('base64')
    return {
      content: [{
        type: 'image',
        source: { type: 'base64', data: base64, mediaType },
      }],
      metadata: { path: absolutePath, type: 'image', size: buffer.length, mediaType },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: 'text', text: `Failed to read image: ${message}` }],
      isError: true,
    }
  }
}

// 读取文本文件并按行范围裁切
async function readTextWithRange(
  absolutePath: string,
  displayPath: string,
  startLineArg?: number,
  endLineArg?: number,
): Promise<ToolResult> {
  try {
    const content = await readText(absolutePath)
    if (content === undefined) {
      return {
        content: [{ type: 'text', text: `Failed to read file: ${displayPath}` }],
        isError: true,
      }
    }
    const lines = content.split('\n')

    // 行范围裁切
    const startLine = (startLineArg ?? 1) - 1
    const endLine = endLineArg ?? lines.length
    const selectedLines = lines.slice(startLine, endLine)

    // 添加行号
    const numberedContent = selectedLines
      .map((line, i) => `${startLine + i + 1} | ${line}`)
      .join('\n')

    const header = `File: ${displayPath} (${lines.length} lines total, showing ${startLine + 1}-${Math.min(endLine, lines.length)})`

    return {
      content: [{ type: 'text', text: `${header}\n${numberedContent}` }],
      metadata: {
        path: absolutePath,
        totalLines: lines.length,
        startLine: startLine + 1,
        endLine: Math.min(endLine, lines.length),
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: 'text', text: `Failed to read file: ${message}` }],
      isError: true,
    }
  }
}
