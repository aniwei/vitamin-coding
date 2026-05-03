import { describe, expect, it } from 'vitest'
import {
  createPluginAgentRegistry,
  createPluginCommandRegistry,
} from '../src/plugin-command-registry'

describe('plugin command and agent registries', () => {
  it('#then registers, lists, and unregisters plugin commands by owner', () => {
    const registry = createPluginCommandRegistry()

    registry.register(
      { name: 'review', description: 'Review code', permissions: ['filesystem'] },
      'review-plugin',
    )
    registry.unregister('review', 'other-plugin')

    expect(registry.get('review')).toEqual({
      pluginId: 'review-plugin',
      command: { name: 'review', description: 'Review code', permissions: ['filesystem'] },
    })
    expect(registry.list()).toEqual([
      {
        pluginId: 'review-plugin',
        command: { name: 'review', description: 'Review code', permissions: ['filesystem'] },
      },
    ])

    registry.unregister('review', 'review-plugin')

    expect(registry.get('review')).toBeUndefined()
  })

  it('#then rejects command ownership conflicts', () => {
    const registry = createPluginCommandRegistry()

    registry.register({ name: 'review' }, 'review-plugin')

    expect(() => registry.register({ name: 'review' }, 'other-plugin')).toThrow(
      'Plugin command "review" is already registered by plugin "review-plugin"',
    )
  })

  it('#then stores optional command handlers without exposing them in manifest clones', async () => {
    const registry = createPluginCommandRegistry()
    const handler = async () => ({ type: 'response' as const, text: 'handled' })

    registry.register({ name: 'review', description: 'Review code' }, 'review-plugin', handler)

    expect(registry.get('review')?.handler).toBe(handler)
    expect(registry.list()[0]?.handler).toBe(handler)
  })

  it('#then registers agents with cloned tool lists', () => {
    const registry = createPluginAgentRegistry()
    const tools = ['read', 'grep']

    registry.register({ name: 'reviewer', description: 'Review agent', tools }, 'review-plugin')
    tools.push('write')

    expect(registry.get('reviewer')).toEqual({
      pluginId: 'review-plugin',
      agent: { name: 'reviewer', description: 'Review agent', tools: ['read', 'grep'] },
    })

    registry.clearPlugin('review-plugin')

    expect(registry.list()).toEqual([])
  })
})
