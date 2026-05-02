import { describe, expect, it } from 'vitest'

import { createDevtools } from '../src/devtools'

describe('Devtools', () => {
  it('creates debugger lazily and reuses singleton instance', () => {
    const devtools = createDevtools({ port: 3901 })

    const first = devtools.debugger
    const second = devtools.debugger

    expect(first).toBe(second)
  })

  it('builds debugger service url from service id and port', () => {
    const devtools = createDevtools({ port: 3902 })
    const debuggerController = devtools.debugger as unknown as { serviceUrl: string }

    expect(debuggerController.serviceUrl).toContain('ws://127.0.0.1:3902/')
    expect(debuggerController.serviceUrl.endsWith('/inspect')).toBe(true)
  })

  it('records debugger snapshots into the audit trace', async () => {
    const devtools = createDevtools({
      port: 3904,
      auditTrace: { id: 'devtools-trace', clock: () => 10 },
    })

    devtools.debugger.disableAllBreakpoints()
    await devtools.debugger.pause({
      turn: 1,
      point: 'loop_start',
      frameDepth: 0,
      messagesCount: 1,
    })

    const trace = devtools.exportAuditTrace()
    expect(trace.id).toBe('devtools-trace')
    expect(trace.events).toHaveLength(1)
    expect(trace.events[0]!.type).toBe('debug.snapshot')
    expect(trace.events[0]!.payload.point).toBe('loop_start')
  })

  it('registers and unregisters plugin devtools contributions without owning the host', () => {
    const devtools = createDevtools({ port: 3905 })

    devtools.registerPluginContribution(
      {
        panels: [{ name: 'trace-panel', title: 'Trace Panel' }],
        providers: [{ name: 'trace-provider', kind: 'timeline' }],
        actions: [{ name: 'clear-trace', title: 'Clear Trace' }],
      },
      'trace-plugin',
    )

    expect(devtools.listPluginContributions()).toEqual([
      {
        pluginId: 'trace-plugin',
        contribution: {
          panels: [{ name: 'trace-panel', title: 'Trace Panel' }],
          providers: [{ name: 'trace-provider', kind: 'timeline' }],
          actions: [{ name: 'clear-trace', title: 'Clear Trace' }],
        },
      },
    ])

    devtools.unregisterPluginContribution('trace-plugin')

    expect(devtools.listPluginContributions()).toEqual([])
  })
})
