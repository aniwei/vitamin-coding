import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createVitamin } from '../src/app/vitamin-app'

const toolModule = `
import { z } from 'zod'

export default {
  name: 'plugin_hello',
  description: 'Say hello from plugin',
  parameters: z.object({}),
  readonly: true,
  async execute() {
    return { content: [{ type: 'text', text: 'hello' }] }
  },
}
`

describe('VitaminApp plugin manager integration', () => {
  it('#then loads plugin tools on start and unloads them on stop', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitamin-app-plugins-'))
    const pluginDir = join(root, 'hello-plugin')
    await mkdir(join(pluginDir, 'tools'), { recursive: true })
    await writeFile(
      join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'hello-plugin',
        name: 'Hello Plugin',
        version: '1.0.0',
        tools: [{ name: 'plugin_hello', module: './tools/hello.js', category: 'plugin' }],
      }),
      'utf-8',
    )
    await writeFile(join(pluginDir, 'tools', 'hello.js'), toolModule, 'utf-8')

    const app = createVitamin({
      port: 0,
      inspect: false,
      logger: {
        name: 'vitamin-test',
        level: 'error',
        destination: 'stdout',
      },
      workspaceDir: root,
      pluginRoots: [root],
    })

    await app.start()

    expect(app.toolRegistry.get('plugin_hello')?.metadata.pluginId).toBe('hello-plugin')
    expect(app.tools.some((tool) => tool.name === 'plugin_hello')).toBe(true)

    await app.stop()

    expect(app.toolRegistry.has('plugin_hello')).toBe(false)
  })
})
