import type { ZodType } from 'zod'

export interface ValidationResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

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

function formatValidationError(error: unknown): string {
  if (error === null || error === undefined) {
    return 'Unknown validation error'
  }

  if (typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: Array<{ path: (string | number)[]; message: string }> })
      .issues

    return issues
      .map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
        return `${path}${issue.message}`
      })
      .join('; ')
  }

  return String(error)
}
