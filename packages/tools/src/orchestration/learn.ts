// learn 工具 — LLM 主动提取和记录运行经验
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const LearnArgsSchema = z.object({
  tags: z.array(z.string()).describe('Free-form tags categorizing this lesson'),
  trigger: z.string().describe('What situation or pattern triggered this insight'),
  insight: z.string().describe('The lesson learned — what to do or avoid'),
})

type LearnArgs = z.infer<typeof LearnArgsSchema>

export type LearnCallback = (args: {
  tags: string[]
  trigger: string
  insight: string
  sessionId: string
}) => Promise<{
  success: boolean
  lessonId?: string
  error?: string
}>

export function createLearn(
  sessionId: string,
  learn?: LearnCallback,
): AgentTool<LearnArgs> {
  return {
    name: 'learn',
    description: 'Record an operational lesson learned during this session for future reference.',
    parameters: LearnArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!learn) {
        return {
          content: [{ type: 'text', text: 'learn tool not available' }],
          isError: true,
        }
      }

      const result = await learn({
        tags: params.tags,
        trigger: params.trigger,
        insight: params.insight,
        sessionId,
      })

      if (result.success) {
        return {
          content: [{
            type: 'text',
            text: `Lesson recorded (${result.lessonId}): [${params.tags.join(', ')}] ${params.trigger} → ${params.insight}`,
          }],
          details: { lessonId: result.lessonId },
        }
      }

      return {
        content: [{ type: 'text', text: `Failed to record lesson: ${result.error ?? 'Unknown error'}` }],
        isError: true,
      }
    },
  }
}
