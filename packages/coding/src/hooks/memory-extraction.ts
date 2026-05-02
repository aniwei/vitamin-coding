import type { HookSpec } from '@vitamin/hooks'
import { defineHook } from '@vitamin/hooks'
import { createLogger } from '@vitamin/shared'
import type { MemoryManager } from '@vitamin/memory'
import type { AgentSession } from '../session/agent-session'

const logger = createLogger('@vitamin/coding:hooks:memory-extraction')
const EXTRACTION_CONTEXT_MESSAGES = 2

export function createMemoryExtractionHooks(
  getSession: (id: string) => AgentSession | undefined,
  memoryManagerFactory: (sessionId: string) => MemoryManager | undefined,
): HookSpec[] {
  const lastExtractedMessageCount = new Map<string, number>()

  const extractionHook = defineHook({
    name: 'session-memory-extraction',
    timing: 'session.idle',
    handle: async (input) => {
      const session = getSession(input.sessionId)
      if (!session) {
        return
      }

      const messageCount = session.session.messages().length
      const memoryManager = memoryManagerFactory(input.sessionId)
      if (!memoryManager) {
        return
      }

      const triggerMessageCount = memoryManager.getMemoryExtractionTriggerMessageCount()
      const metadataMessageCount =
        session.session.metadata().memoryExtraction?.lastMessageCount ?? 0
      const previousMessageCount =
        lastExtractedMessageCount.get(input.sessionId) ?? metadataMessageCount
      if (messageCount - previousMessageCount < triggerMessageCount) {
        return
      }

      logger.info({ sessionId: input.sessionId }, 'Session idle, extracting memories')

      try {
        const messages = session.session.messages()
        const extractionStart = Math.max(0, previousMessageCount - EXTRACTION_CONTEXT_MESSAGES)
        const result = await memoryManager.extractMemories(messages.slice(extractionStart))

        if (result.entries.length > 0) {
          logger.info(
            { sessionId: input.sessionId, count: result.entries.length },
            'Memories extracted and saved',
          )
        }

        memoryManager.resetExtractionCounter()
        lastExtractedMessageCount.set(input.sessionId, messageCount)
        session.session.updateMetadata({
          memoryExtraction: { lastMessageCount: messageCount },
        })
      } catch (err) {
        logger.warn({ sessionId: input.sessionId, err: String(err) }, 'Memory extraction failed')
      }
    },
  })

  const cleanupHook = defineHook({
    name: 'session-memory-extraction-cleanup',
    timing: 'session.deleted',
    handle: (input) => {
      lastExtractedMessageCount.delete(input.sessionId)
    },
  })

  return [extractionHook, cleanupHook]
}
