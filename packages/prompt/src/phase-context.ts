import type { PhaseAnnotation } from './types'

export function injectPhaseContext(systemPrompt: string, annotation: PhaseAnnotation): string {
  const parts = [
    `当前阶段：${annotation.currentPhase}`,
    `阶段历史：${annotation.phaseHistory.join(' → ')}`,
  ]
  if (annotation.tasksSummary) {
    parts.push(`任务摘要：${annotation.tasksSummary}`)
  }
  return `${systemPrompt}\n\n[阶段上下文]\n${parts.join('\n')}`
}

export function extractPhaseFromMessage(text: string): string | null {
  const match = text.match(/\[Phase:\s*(\w+)\]/)
  return match?.[1] ?? null
}
