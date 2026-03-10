// Comment Checker Hook — 检测 AI 风格注释并要求修正
import type { HookRegistration, ToolExecuteAfterInput, ToolExecuteAfterOutput } from '../../types'

// AI 风格注释模式
const AI_COMMENT_PATTERNS = [
  /\/\/\s*TODO:\s*implement/i,
  /\/\/\s*add\s+(your|the)\s+/i,
  /\/\/\s*placeholder/i,
  /\/\/\s*\.\.\.\s*(rest|more|other|remaining)/i,
  /\/\/\s*handle\s+error\s+here/i,
  /\/\*\s*\*\//,
]

export function createCommentCheckerHook(): HookRegistration<'tool.execute.after'> {
  return {
    name: 'comment-checker',
    timing: 'tool.execute.after',
    priority: 20,
    enabled: true,
    handler(input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput): void {
      // 仅检查写入类工具
      if (!WRITE_TOOLS.has(input.toolName)) return

      // 检查参数中的代码内容
      const code = extractCodeContent(input.args)
      if (!code) return

      const violations = detectAiComments(code)
      if (violations.length > 0) {
        // 追加警告到工具输出
        const warning = `\n\n⚠️ AI-style comments detected:\n${violations.map((v) => `  - Line ${v.line}: "${v.text}"`).join('\n')}\nPlease replace with meaningful implementation comments.`

        output.result = {
          ...output.result,
          content: [
            ...output.result.content,
            { type: 'text', text: warning },
          ],
        }
        output.metadata.aiCommentsDetected = violations.length
      }
    },
  }
}

const WRITE_TOOLS = new Set(['write', 'edit', 'edit-diff'])

interface CommentViolation {
  line: number
  text: string
}

function detectAiComments(code: string): CommentViolation[] {
  const violations: CommentViolation[] = []
  const lines = code.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    for (const pattern of AI_COMMENT_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({ line: i + 1, text: line.trim() })
        break
      }
    }
  }
  return violations
}

function extractCodeContent(args: Record<string, unknown>): string | null {
  if (typeof args.content === 'string') return args.content
  if (typeof args.newString === 'string') return args.newString
  if (typeof args.new_string === 'string') return args.new_string
  return null
}
