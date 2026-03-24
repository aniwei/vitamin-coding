import { describe, expect, it } from 'vitest'

import { resolveDebugClientPath } from '../src/debugger/path'
import { DebuggerController } from '../src/debugger/controller'

describe('DebuggerController', () => {
  it('resolves debugger client path to client.js', () => {
    const clientPath = resolveDebugClientPath()
    expect(clientPath.endsWith('/client.js')).toBe(true)
  })

  it('paused throws when debugger client is missing', () => {
    const controller = new DebuggerController('http://localhost:3000/abc/debugger')

    expect(() => {
      controller.paused({ turn: 1, point: 'model_before' })
    }).toThrow()
  })
})
