// look-at 工具 — 多模态查看（截图/图片分析）
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'
import { resolvePath, normalizePath, exists } from '@vitamin/shared'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB

const LookAtArgsSchema = z.object({
  path: z.string().describe('图片文件路径'),
  question: z.string().optional().describe('关于图片的问题'),
})

type LookAtArgs = z.infer<typeof LookAtArgsSchema>

export function createLookAtTool(projectRoot: string): AgentTool<LookAtArgs> {
  return {
    name: 'look-at',
    description: '查看图片/截图内容。传入图片路径，返回 base64 编码供多模态模型分析。',
    parameters: LookAtArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      const resolved = normalizePath(resolvePath(projectRoot, args.path))

      if (!(await exists(resolved))) {
        return { content: [{ type: 'text', text: `Image not found: ${args.path}` }], isError: true }
      }

      const ext = extname(resolved).toLowerCase()
      if (!IMAGE_EXTENSIONS.has(ext)) {
        return { content: [{ type: 'text', text: `Not a supported image format: ${ext}` }], isError: true }
      }

      const buffer = await readFile(resolved)
      if (buffer.length > MAX_IMAGE_SIZE) {
        return {
          content: [{
            type: 'text',
            text: `Image too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`,
          }],
          isError: true,
        }
      }

      const base64 = buffer.toString('base64')
      const mediaType = ext === '.png' ? 'image/png'
        : ext === '.gif' ? 'image/gif'
          : ext === '.webp' ? 'image/webp'
            : 'image/jpeg'

      const content: ToolResult['content'] = [
        {
          type: 'image',
          source: { type: 'base64', mediaType, data: base64 },
        },
      ]

      if (args.question) {
        content.push({ type: 'text', text: `Please analyze this image and answer: ${args.question}` })
      } else {
        content.push({ type: 'text', text: 'Please describe what you see in this image.' })
      }

      return { content }
    },
  }
}
