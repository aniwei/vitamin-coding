import { describe, expect, it } from 'vitest'

import { createDefaultProviderRegistry } from '@vitamin/ai'
import type { Model } from '@vitamin/ai'
import { createVitamin } from '../src/app/vitamin-app'

function makeModel(id: string): Model {
  const [, name = id] = id.split('/')

  return {
    id,
    name,
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: 'https://example.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxOutputTokens: 4096,
  }
}

describe('VitaminApp slot routing', () => {
  it('uses explicit slot mapping when creating a session', async () => {
    const baseModel = makeModel('openai/base-model')
    const reviewModel = makeModel('openai/review-model')
    const providerRegistry = createDefaultProviderRegistry()

    providerRegistry.getModelRegistry().registerMany([baseModel, reviewModel])

    const app = createVitamin({
      port: 0,
      inspect: false,
      logger: {
        name: 'vitamin-slot-test',
        level: 'error',
        destination: 'stdout',
      },
      model: baseModel,
      providerRegistry,
    })

    try {
      await app.settings.update({
        model_slots: {
          default: baseModel.id,
          slots: {
            critique: reviewModel.id,
          },
        },
      })

      const session = await app.createSession({
        id: 'slot-explicit',
        slot: 'critique',
      })

      expect(session.model.id).toBe(reviewModel.id)
    } finally {
      await app.stop()
    }
  })

  it('uses agent default slot when caller does not provide one', async () => {
    const baseModel = makeModel('openai/default-model')
    const reviewModel = makeModel('openai/quality-review-model')
    const providerRegistry = createDefaultProviderRegistry()

    providerRegistry.getModelRegistry().registerMany([baseModel, reviewModel])

    const app = createVitamin({
      port: 0,
      inspect: false,
      logger: {
        name: 'vitamin-slot-agent-default-test',
        level: 'error',
        destination: 'stdout',
      },
      model: baseModel,
      providerRegistry,
    })

    try {
      await app.settings.update({
        agents: {
          'quality-reviewer': {
            default_workflow_slot: 'critique',
          },
        },
        model_slots: {
          default: baseModel.id,
          slots: {
            critique: reviewModel.id,
          },
        },
      })

      const session = await app.createSession({
        id: 'slot-agent-default',
        agentName: 'quality-reviewer',
      })

      expect(session.model.id).toBe(reviewModel.id)
    } finally {
      await app.stop()
    }
  })
})