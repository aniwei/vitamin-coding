import { ProviderError } from '@x-mars/shared'

export class PromptTooLongError extends ProviderError {
  readonly tokenCount?: number

  constructor(message: string, opts?: { tokenCount?: number; cause?: Error }) {
    super(message, { code: 'PROMPT_TOO_LONG', cause: opts?.cause })
    this.tokenCount = opts?.tokenCount
  }
}

export function isPromptTooLong(error: unknown): error is PromptTooLongError {
  return error instanceof PromptTooLongError
}
