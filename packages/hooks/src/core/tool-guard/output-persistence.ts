import * as fs from 'node:fs'
import * as path from 'node:path'
import { defineHook } from '../../hook-spec'
import type { HookSpec } from '../../hook-spec'

const DEFAULT_MAX_INLINE_BYTES = 60 * 1024
const DEFAULT_PREVIEW_BYTES = 12 * 1024
const DEFAULT_MAX_AGGREGATE_PREVIEW_BYTES = 48 * 1024

export interface ToolOutputPersistenceConfig {
  baseDir: string
  maxInlineBytes?: number
  previewBytes?: number
  maxAggregatePreviewBytes?: number
}

export function createToolOutputPersistenceHook(config: ToolOutputPersistenceConfig): HookSpec {
  const baseDir = path.resolve(config.baseDir)
  const maxInlineBytes = config.maxInlineBytes ?? DEFAULT_MAX_INLINE_BYTES
  const previewBytes = config.previewBytes ?? DEFAULT_PREVIEW_BYTES
  const maxAggregatePreviewBytes =
    config.maxAggregatePreviewBytes ?? DEFAULT_MAX_AGGREGATE_PREVIEW_BYTES
  const previewUsageBySession = new Map<string, number>()

  return defineHook({
    name: 'tool-output-persistence',
    timing: 'tool.execute.after',
    priority: 9,
    handle(input, output) {
      const textParts = output.result.content.filter((part) => part.type === 'text')
      const fullText = textParts.map((part) => part.text).join('\n')
      const totalBytes = Buffer.byteLength(fullText, 'utf-8')

      if (totalBytes <= maxInlineBytes) {
        return
      }

      const artifactDir = path.join(baseDir, sanitizePathSegment(input.sessionId || 'session'))
      const artifactPath = path.join(
        artifactDir,
        `${sanitizePathSegment(input.toolCallId || input.toolName)}.txt`,
      )

      const resolvedArtifactPath = path.resolve(artifactPath)
      const relative = path.relative(baseDir, resolvedArtifactPath)
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        output.metadata.persistedOutput = false
        output.metadata.outputPersistenceError = 'Artifact path escapes configured baseDir'
        return
      }

      const previewBudget = reservePreviewBudget(
        previewUsageBySession,
        input.sessionId || 'session',
        previewBytes,
        maxAggregatePreviewBytes,
      )
      const preview = truncateByBytes(fullText, previewBudget.bytes)
      try {
        fs.mkdirSync(artifactDir, { recursive: true })
        fs.writeFileSync(resolvedArtifactPath, fullText, 'utf-8')
      } catch (error) {
        output.result = {
          ...output.result,
          content: [
            {
              type: 'text',
              text: [
                preview || '[preview omitted: aggregate tool output preview budget exhausted]',
                '',
                `Full tool output could not be saved: ${error instanceof Error ? error.message : String(error)}`,
                `Original output was ${totalBytes} bytes; inline preview limited to ${previewBudget.bytes} bytes.`,
              ].join('\n'),
            },
          ],
          details: {
            ...output.result.details,
            outputArtifact: {
              path: undefined,
              sizeBytes: totalBytes,
              previewBytes: previewBudget.bytes,
              aggregatePreviewBytes: previewBudget.used,
              aggregatePreviewLimitBytes: maxAggregatePreviewBytes,
              error: error instanceof Error ? error.message : String(error),
            },
          },
        }
        output.metadata.persistedOutput = false
        output.metadata.outputPersistenceError =
          error instanceof Error ? error.message : String(error)
        output.metadata.originalSize = totalBytes
        return
      }

      output.result = {
        ...output.result,
        content: [
          {
            type: 'text',
            text: [
              preview || '[preview omitted: aggregate tool output preview budget exhausted]',
              '',
              `Full tool output saved to: ${resolvedArtifactPath}`,
              `Stored ${totalBytes} bytes; inline preview limited to ${previewBudget.bytes} bytes.`,
            ].join('\n'),
          },
        ],
        details: {
          ...output.result.details,
          outputArtifact: {
            path: resolvedArtifactPath,
            sizeBytes: totalBytes,
            previewBytes: previewBudget.bytes,
            aggregatePreviewBytes: previewBudget.used,
            aggregatePreviewLimitBytes: maxAggregatePreviewBytes,
          },
        },
      }
      output.metadata.outputArtifact = resolvedArtifactPath
      output.metadata.originalSize = totalBytes
      output.metadata.aggregatePreviewBytes = previewBudget.used
      output.metadata.persistedOutput = true
    },
  })
}

function reservePreviewBudget(
  usage: Map<string, number>,
  sessionId: string,
  requestedBytes: number,
  maxAggregateBytes: number,
): { bytes: number; used: number } {
  const used = usage.get(sessionId) ?? 0
  const remaining = Math.max(0, maxAggregateBytes - used)
  const bytes = Math.min(requestedBytes, remaining)
  const nextUsed = used + bytes
  usage.set(sessionId, nextUsed)
  return { bytes, used: nextUsed }
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^-+|-+$/g, '')
  return sanitized || 'output'
}

function truncateByBytes(value: string, maxBytes: number): string {
  const buffer = Buffer.from(value, 'utf-8')
  if (buffer.byteLength <= maxBytes) {
    return value
  }
  return buffer.subarray(0, maxBytes).toString('utf-8')
}
