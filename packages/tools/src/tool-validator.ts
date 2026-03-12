// 工具参数验证器 — 基于 ZodType 接口
import type { ZodType } from 'zod'

// 验证结果
export interface ValidationResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// 验证工具参数
export function validateToolArgs<T>(schema: ZodType<T>, args: unknown): ValidationResult<T> {
  const result = schema.safeParse(args)
  if (result.success) {
    return { success: true, data: result.data as T }
  }

  return {
    success: false,
    error: formatValidationError(result.error),
  }
}

// 格式化验证错误为可读字符串
function formatValidationError(error: unknown): string {
  if (error === null || error === undefined) {
    return 'Unknown validation error'
  }

  // Zod v4 error 格式
  if (typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: Array<{ path: (string | number)[]; message: string }> }).issues
    
    return issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
      return `${path}${issue.message}`
    }).join('; ')
  }

  return String(error)
}
