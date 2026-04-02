// Phase Context Injection — system-prompt.transform hook
// 根据 session metadata 注入阶段上下文到 system prompt

export interface PhaseAnnotation {
  currentPhase: string
  phaseHistory: string[]
  tasksSummary?: string
}

export function injectPhaseContext(systemPrompt: string, annotation: PhaseAnnotation): string {
  const parts = [
    `Current: ${annotation.currentPhase}`,
    `History: ${annotation.phaseHistory.join(' → ')}`,
  ]
  if (annotation.tasksSummary) {
    parts.push(`Tasks: ${annotation.tasksSummary}`)
  }
  return `${systemPrompt}\n\n[Phase Context]\n${parts.join('\n')}`
}

export function extractPhaseFromMessage(text: string): string | null {
  const match = text.match(/\[Phase:\s*(\w+)\]/)
  return match?.[1] ?? null
}
