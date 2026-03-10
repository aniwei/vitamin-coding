// 输出截断 Hook — 截断超长工具输出
import type { HookRegistration, ToolExecuteAfterInput, ToolExecuteAfterOutput } from '../../types'

// 默认输出上限 60KB
const DEFAULT_MAX_OUTPUT_SIZE = 60 * 1024

export function createOutputTruncationHook(
  maxOutputSize: number = DEFAULT_MAX_OUTPUT_SIZE,
): HookRegistration<'tool.execute.after'> {
  return {
    name: 'output-truncation',
    timing: 'tool.execute.after',
    priority: 10,
    enabled: true,
    handler(_input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput): void {
      const { content } = output.result
      let totalSize = 0

      for (const part of content) {
        if (part.type === 'text') {
          totalSize += part.text.length
        }
      }

      if (totalSize <= maxOutputSize) return

      // 截断文本内容
      let remaining = maxOutputSize
      const truncatedContent = content.map((part) => {
        if (part.type !== 'text') return part
        if (remaining <= 0) {
          return { type: 'text' as const, text: '' }
        }
        if (part.text.length <= remaining) {
          remaining -= part.text.length
          return part
        }
        const truncated = part.text.slice(0, remaining)
        remaining = 0
        return {
          type: 'text' as const,
          text: `${truncated}\n\n... [output truncated: ${totalSize} bytes → ${maxOutputSize} bytes]`,
        }
      }).filter((part) => part.type !== 'text' || part.text.length > 0)

      output.result = { ...output.result, content: truncatedContent }
      output.metadata.truncated = true
      output.metadata.originalSize = totalSize
    },
  }
}
