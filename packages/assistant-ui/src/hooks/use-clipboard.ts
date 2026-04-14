import { useCallback, useRef, useState } from 'react'
import { writeTextToClipboard } from '@/shared/clipboard'
import { noop } from 'es-toolkit/compat'
import { useStableHandle } from './use-stable-handle'

interface UseClipboard {
  timeout?: number
  usePromptAsFallback?: boolean
  promptFallbackText?: string
  onError?: (error: Error) => void
}

/** @see https://foxact.skk.moe/use-clipboard */
export function useClipboard({
  timeout = 1000,
  usePromptAsFallback = false,
  promptFallbackText = 'Failed to copy to clipboard automatically, please manually copy the text below.',
  onError,
}: UseClipboard = {}) {
  const [error, setError] = useState<Error | null>(null)
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<number | null>(null)

  const stablizedOnCopyError = useStableHandle<[e: Error], void>(onError || noop)

  const handleCopyResult = useCallback((copied: boolean) => {
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current)
    }

    if (copied) {
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), timeout)
    }

    setCopied(copied)
  }, [timeout])

  const handleCopyError = useCallback((e: Error) => {
    setError(e)
    stablizedOnCopyError(e)
  }, [stablizedOnCopyError])

  const copy = useCallback(async (valueToCopy: string) => {
    try {
      await writeTextToClipboard(valueToCopy)
    } catch (e) {
      if (usePromptAsFallback) {
        try {
          window.prompt(promptFallbackText, valueToCopy)
        }
        catch (e2) {
          handleCopyError(e2 as Error)
        }
      }
      else {
        handleCopyError(e as Error)
      }
    }
  }, [handleCopyResult, promptFallbackText, handleCopyError, usePromptAsFallback])

  const reset = useCallback(() => {
    setCopied(false)
    setError(null)
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  return { copy, reset, error, copied }
}
