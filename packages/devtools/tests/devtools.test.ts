import { describe, expect, it } from 'vitest'

import { createDevtools } from '../src/devtools'

describe('Devtools', () => {
  it('creates debugger lazily and reuses singleton instance', () => {
    const devtools = createDevtools(3901)

    const first = devtools.debugger
    const second = devtools.debugger

    expect(first).toBe(second)
  })

  it('builds debugger service url from service id and port', () => {
    const devtools = createDevtools(3902)
    const debuggerController = devtools.debugger as unknown as { serviceUrl: string }

    expect(debuggerController.serviceUrl).toContain('http://localhost:3902/')
    expect(debuggerController.serviceUrl.endsWith('/debugger')).toBe(true)
  })
})
