import { defineHook } from '../../hook-spec'
import type { HookSpec } from '../../hook-spec'

export interface PatchReviewGateConfig {
  blockOnHighRisk?: boolean
}

export interface PatchReviewSummary {
  required: boolean
  blocked: boolean
  risk: 'low' | 'medium' | 'high'
  toolName: string
  targets: string[]
  reasons: string[]
}

const MUTATING_TOOLS = new Set(['write', 'edit', 'edit-diff', 'apply_patch', 'bash', 'shell'])
const HIGH_RISK_PATTERNS = [
  /(^|\/)\.env(\.|$)?/,
  /(^|\/)package\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)vite\.config\./,
  /(^|\/)rollup\.config\./,
  /(^|\/)webpack\.config\./,
  /(^|\/)\.github\/workflows\//,
]
const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-[^\n]*r/,
  /\bgit\s+reset\b/,
  /\bgit\s+checkout\s+--\b/,
  /\bchmod\s+777\b/,
  /\bcurl\b.*\|\s*(sh|bash)\b/,
  /\bwget\b.*\|\s*(sh|bash)\b/,
]

export function createPatchReviewGateHook(config: PatchReviewGateConfig = {}): HookSpec {
  const blockOnHighRisk = config.blockOnHighRisk ?? true

  return defineHook({
    name: 'patch-review-gate',
    timing: 'tool.execute.after',
    priority: 25,
    handle(input, output) {
      if (output.result.isError || !MUTATING_TOOLS.has(input.toolName)) {
        return
      }

      const summary = buildReviewSummary(input.toolName, input.args, blockOnHighRisk)
      if (!summary.required) {
        return
      }

      output.metadata.patchReview = summary
      output.result = {
        ...output.result,
        isError: summary.blocked ? true : output.result.isError,
        content: [
          ...output.result.content,
          {
            type: 'text',
            text: formatReviewMessage(summary),
          },
        ],
        details: {
          ...output.result.details,
          patchReview: summary,
        },
      }
    },
  })
}

function buildReviewSummary(
  toolName: string,
  args: Record<string, unknown>,
  blockOnHighRisk: boolean,
): PatchReviewSummary {
  const targets = extractTargets(args)
  const reasons: string[] = []

  for (const target of targets) {
    if (HIGH_RISK_PATTERNS.some((pattern) => pattern.test(target))) {
      reasons.push(`high-risk target: ${target}`)
    }
  }

  const command = typeof args.command === 'string' ? args.command : undefined
  if (command) {
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        reasons.push(`dangerous command pattern: ${pattern.source}`)
      }
    }
  }

  const risk = reasons.length > 0 ? 'high' : targets.length > 0 ? 'medium' : 'low'
  return {
    required: true,
    blocked: blockOnHighRisk && risk === 'high',
    risk,
    toolName,
    targets,
    reasons,
  }
}

function extractTargets(args: Record<string, unknown>): string[] {
  const keys = ['path', 'filePath', 'filename', 'targetPath', 'outputPath', 'oldPath', 'newPath']
  const targets: string[] = []

  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      targets.push(value)
    }
  }

  for (const key of ['files', 'paths']) {
    const value = args[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.trim()) {
          targets.push(item)
        }
      }
    }
  }

  return [...new Set(targets)]
}

function formatReviewMessage(summary: PatchReviewSummary): string {
  const targets = summary.targets.length > 0 ? summary.targets.join(', ') : '(no explicit target)'
  const reasons = summary.reasons.length > 0 ? ` Reasons: ${summary.reasons.join('; ')}.` : ''
  if (summary.blocked) {
    return `Patch review gate blocked a high-risk ${summary.toolName} change. Targets: ${targets}.${reasons} Run or record a focused review before marking the task complete.`
  }
  return `Patch review gate: review required for ${summary.toolName} change. Risk: ${summary.risk}. Targets: ${targets}.${reasons}`
}
