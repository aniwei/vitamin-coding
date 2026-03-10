// 文件守卫 Hook — 阻止写入受保护路径
import { ToolError } from '@vitamin/shared'

import type { HookRegistration, ToolExecuteBeforeInput, ToolExecuteBeforeOutput } from '../../types'

// 受保护路径模式
const PROTECTED_PATTERNS = [
  /^\/etc\//,
  /^\/usr\//,
  /^\/sys\//,
  /^\/proc\//,
  /node_modules\//,
  /\.git\//,
  /\.env$/,
  /\.env\.local$/,
]

// 写入类工具
const WRITE_TOOLS = new Set(['write', 'edit', 'edit-diff', 'bash'])

export function createFileGuardHook(): HookRegistration<'tool.execute.before'> {
  return {
    name: 'file-guard',
    timing: 'tool.execute.before',
    priority: 10,
    enabled: true,
    handler(input: ToolExecuteBeforeInput, output: ToolExecuteBeforeOutput): void {
      // 仅检查写入类工具
      if (!WRITE_TOOLS.has(input.toolName)) return

      const filePath = extractPath(input.args)
      if (!filePath) return

      for (const pattern of PROTECTED_PATTERNS) {
        if (pattern.test(filePath)) {
          output.cancelled = true
          output.cancelReason = `File guard: write to protected path "${filePath}" is not allowed`
          throw new ToolError(output.cancelReason, { code: 'HOOK_FILE_GUARD' })
        }
      }
    },
  }
}

// 从工具参数中提取文件路径
function extractPath(args: Record<string, unknown>): string | null {
  if (typeof args.path === 'string') return args.path
  if (typeof args.file_path === 'string') return args.file_path
  if (typeof args.filePath === 'string') return args.filePath
  return null
}
