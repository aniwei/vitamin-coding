// capture_file_state 工具 — 捕获工作空间文件状态快照
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const CaptureFileStateArgsSchema = z.object({
  plan_status: z.string().optional().describe('Current plan execution status summary'),
  recent_files: z.array(z.string()).optional().describe('Recently modified file paths to focus on'),
  findings: z.array(z.string()).optional().describe('Key findings or observations to record'),
})

type CaptureFileStateArgs = z.infer<typeof CaptureFileStateArgsSchema>

export type CaptureFileState = (args: {
  planStatus?: string
  recentFiles?: string[]
  findings?: string[]
}) => Promise<{
  success: boolean
  summary: string
  timestamp: number
}>

export function createCaptureFileState(
  captureFileState?: CaptureFileState,
): AgentTool<CaptureFileStateArgs> {
  return {
    name: 'capture_file_state',
    description: 'Capture a snapshot of the current workspace file state.',
    parameters: CaptureFileStateArgsSchema,
    visibility: 'always',
    readonly: true,

    async execute({ params }): Promise<ToolResult> {
      if (!captureFileState) {
        return {
          content: [{ type: 'text', text: 'capture_file_state not available' }],
          isError: true,
        }
      }

      const result = await captureFileState({
        planStatus: params.plan_status,
        recentFiles: params.recent_files,
        findings: params.findings,
      })

      if (result.success) {
        return {
          content: [{ type: 'text', text: result.summary }],
          details: { timestamp: result.timestamp },
        }
      }

      return {
        content: [{ type: 'text', text: 'Failed to capture file state' }],
        isError: true,
      }
    },
  }
}
