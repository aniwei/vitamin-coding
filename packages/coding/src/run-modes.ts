import type { AgentMessage } from '@vitamin/agent'
import type { AgentSession } from './agent-session'

export interface JsonModeResult {
  sessionId: string
  status: string
  messageCount: number
  response: string
}

export interface RpcPromptParams {
  text: string
}

export type RpcRequest =
  | { id?: string; method: 'prompt'; params: RpcPromptParams }
  | { id?: string; method: 'status' }
  | { id?: string; method: 'abort' }
  | { id?: string; method: 'compact'; params: { summary: string; compactedCount: number } }

export type RpcResponse =
  | { id?: string; ok: true; result: unknown }
  | { id?: string; ok: false; error: string }

export type InteractiveResult =
  | { type: 'response'; text: string }
  | { type: 'system'; text: string }
  | { type: 'exit' }
  | { type: 'noop' }

export async function runPrintMode(
  session: AgentSession,
  prompt: string,
  writer: (text: string) => void = (text) => process.stdout.write(`${text}\n`),
): Promise<string> {
  await session.prompt(prompt)
  const response = getLastAssistantText(session.session.messages())
  writer(response)
  return response
}

export async function runJsonMode(
  session: AgentSession,
  prompt: string,
): Promise<JsonModeResult> {
  await session.prompt(prompt)
  return {
    sessionId: session.id,
    status: session.status,
    messageCount: session.session.messages().length,
    response: getLastAssistantText(session.session.messages()),
  }
}

export async function runRpcMode(
  session: AgentSession,
  request: RpcRequest,
): Promise<RpcResponse> {
  try {
    if (request.method === 'prompt') {
      const result = await runJsonMode(session, request.params.text)
      return { id: request.id, ok: true, result }
    }

    if (request.method === 'status') {
      return {
        id: request.id,
        ok: true,
        result: {
          sessionId: session.id,
          status: session.status,
          messageCount: session.session.messages().length,
        },
      }
    }

    if (request.method === 'abort') {
      session.abort()
      return { id: request.id, ok: true, result: { aborted: true } }
    }

    await session.compact(request.params.summary, request.params.compactedCount)
    return {
      id: request.id,
      ok: true,
      result: { compacted: true, messageCount: session.session.messages().length },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { id: request.id, ok: false, error: message }
  }
}

export class InteractiveMode {
  constructor(private readonly session: AgentSession) {}

  async handleInput(input: string): Promise<InteractiveResult> {
    const text = input.trim()
    if (text.length === 0) {
      return { type: 'noop' }
    }

    if (!text.startsWith('/')) {
      const response = await runPrintMode(this.session, text, () => {})
      return { type: 'response', text: response }
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
      this.session.abort()
      return { type: 'system', text: 'Aborted current run.' }
    }

    if (command === 'compact') {
      const compactedCount = Number(rest[0] ?? '1')
      const summary = rest.slice(1).join(' ') || 'Compacted by interactive mode'
      await this.session.compact(summary, Number.isFinite(compactedCount) ? compactedCount : 1)
      return { type: 'system', text: 'Compaction complete.' }
    }

    return { type: 'system', text: `Unknown command: /${command}` }
  }
}

export function getLastAssistantText(messages: readonly AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { role?: string; content?: Array<{ type?: string; text?: string }> }
    if (message?.role !== 'assistant') {
      continue
    }

    const content = message.content ?? []
    const text = content
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
      .trim()

    if (text.length > 0) {
      return text
    }
  }

  return ''
}
