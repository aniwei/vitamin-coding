import type { SystemContext } from './types'

export class AgentSession implements Session {
  async prompt() {

  }
}

export function createAgentSession(context: SystemContext) {
  return new AgentSession()
}