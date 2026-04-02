import type { PhaseAnnotation } from './types'

export function injectPhaseContext(systemPrompt: string, annotation: PhaseAnnotation): string {
  const parts = [
    `Current phase: ${annotation.currentPhase}`,
    `Phase history: ${annotation.phaseHistory.join(' → ')}`,
  ]
  if (annotation.tasksSummary) {
    parts.push(`Task summary: ${annotation.tasksSummary}`)
  }
  return `${systemPrompt}\n\n[Phase Context]\n${parts.join('\n')}`
}

export function extractPhaseFromMessage(text: string): string | null {
  const match = text.match(/\[Phase:\s*(\w+)\]/)
  return match?.[1] ?? null
}
