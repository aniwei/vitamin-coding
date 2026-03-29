import type { InteractiveResult } from './run-modes'
import type { VitaminApp } from '../app/vitamin-app'
import type { LeadResult } from '../lead/lead-session'

export async function runLeadPrintMode(
  app: VitaminApp,
  prompt: string,
  writer: (text: string) => void = (text) => process.stdout.write(`${text}\n`),
): Promise<LeadResult> {
  const result = await app.lead(prompt)
  writer(result.output)
  return result
}

export async function runLeadJsonMode(
  app: VitaminApp,
  prompt: string,
): Promise<LeadResult> {
  return app.lead(prompt)
}

export class LeadInteractiveMode {
  constructor(private readonly app: VitaminApp) {}

  async handleInput(input: string): Promise<InteractiveResult> {
    const text = input.trim()
    if (text.length === 0) {
      return { type: 'noop' }
    }

    if (!text.startsWith('/')) {
      const result = await this.app.lead(text)
      return { type: 'response', text: result.output }
    }

    const [command, ...rest] = text.slice(1).split(/\s+/)

    if (command === 'exit' || command === 'quit') {
      return { type: 'exit' }
    }

    if (command === 'help') {
      return {
        type: 'system',
        text: 'Commands: /help, /abort, /compact <count> <summary>, /exit',
      }
    }

    if (command === 'abort') {
      const leadSession = this.app.getLeadSession()
      if (!leadSession) {
        return { type: 'system', text: 'No active lead session.' }
      }
      leadSession.abort()
      return { type: 'system', text: 'Aborted current run.' }
    }

    if (command === 'compact') {
      const leadSession = this.app.getLeadSession()
      if (!leadSession) {
        return { type: 'system', text: 'No active lead session.' }
      }

      const compactedCount = Number(rest[0] ?? '1')
      const summary = rest.slice(1).join(' ') || 'Compacted by interactive mode'
      await leadSession.session.compact(summary, Number.isFinite(compactedCount) ? compactedCount : 1)
      return { type: 'system', text: 'Compaction complete.' }
    }

    return { type: 'system', text: `Unknown command: /${command}` }
  }
}