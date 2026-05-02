import type { ZodType } from 'zod'

export interface ValidationIssue {
  path: (string | number)[]
  message: string
}

export interface ValidationResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  issues?: ValidationIssue[]
}

export function validateWithZod<T>(schema: ZodType<T>, value: unknown): ValidationResult<T> {
  const result = schema.safeParse(value)
  if (result.success) {
    return { success: true, data: result.data as T }
  }

  const issues = extractValidationIssues(result.error)
  return {
    success: false,
    error: formatValidationIssues(issues, result.error),
    issues,
  }
}

export function formatValidationError(error: unknown): string {
  const issues = extractValidationIssues(error)
  return formatValidationIssues(issues, error)
}

function extractValidationIssues(error: unknown): ValidationIssue[] | undefined {
  if (!error || typeof error !== 'object' || !('issues' in error)) {
    return undefined
  }

  const issues = (error as { issues?: unknown }).issues
  if (!Array.isArray(issues)) {
    return undefined
  }

  return issues
    .map((issue): ValidationIssue | null => {
      if (!issue || typeof issue !== 'object') {
        return null
      }
      const record = issue as { path?: unknown; message?: unknown }
      if (!Array.isArray(record.path) || typeof record.message !== 'string') {
        return null
      }
      const path = record.path.filter((part): part is string | number => {
        return typeof part === 'string' || typeof part === 'number'
      })
      return { path, message: record.message }
    })
    .filter((issue): issue is ValidationIssue => issue !== null)
}

function formatValidationIssues(issues: ValidationIssue[] | undefined, fallback: unknown): string {
  if (issues && issues.length > 0) {
    return issues
      .map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
        return `${path}${issue.message}`
      })
      .join('; ')
  }

  if (fallback === null || fallback === undefined) {
    return 'Unknown validation error'
  }

  return String(fallback)
}
