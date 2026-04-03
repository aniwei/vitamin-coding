import { describe, expect, it } from 'vitest'

import { BREAKPOINT_POINTS, type DebugSnapshot } from '../src/protocol'
import { Breakpoints } from '../src/tools/breakpoints'
import { DevtoolsService } from '../src/service'
import { DevtoolsDebugger } from '../src/tools/debugger'

describe('DevtoolsDebugger', () => {
  const makeSnapshot = (point: DebugSnapshot['point']): DebugSnapshot => ({
    turn: 1,
    point,
    frameDepth: 0,
    messagesCount: 0,
  })

  it('targets the service paused endpoint', () => {
    const breakpoints = new Breakpoints()
    const service = new DevtoolsService({ port: 3903 }, breakpoints)
    const debuggerController = new DevtoolsDebugger(service, breakpoints)

    expect(debuggerController.serviceUrl).toContain('http://127.0.0.1:3903/')
    expect(debuggerController.serviceUrl.endsWith('/command/debugger/paused')).toBe(true)
  })

  it('pauses when breakpoint is enabled', () => {
    let pauseCalls = 0
    let lastSnapshot: DebugSnapshot | undefined

    const fakeService = {
      debuggerPauseUrl: 'http://127.0.0.1:3903/test/command/debugger/paused',
      pause(snapshot: DebugSnapshot) {
        pauseCalls += 1
        lastSnapshot = snapshot
      },
    } as unknown as DevtoolsService

    const debuggerController = new DevtoolsDebugger(fakeService, new Breakpoints())
    const snapshot = makeSnapshot('loop_start')
    debuggerController.pause(snapshot)

    expect(pauseCalls).toBe(1)
    expect(lastSnapshot).toEqual(snapshot)
  })

  it('skips pause when breakpoint is disabled', () => {
    let pauseCalls = 0

    const fakeService = {
      debuggerPauseUrl: 'http://127.0.0.1:3903/test/command/debugger/paused',
      pause() {
        pauseCalls += 1
      },
    } as unknown as DevtoolsService

    const debuggerController = new DevtoolsDebugger(fakeService, new Breakpoints())
    debuggerController.breakpoints.disable('loop_start')
    debuggerController.pause(makeSnapshot('loop_start'))

    expect(pauseCalls).toBe(0)
  })

  it('collects all predefined breakpoints by default', () => {
    const fakeService = {
      debuggerPauseUrl: 'http://127.0.0.1:3903/test/command/debugger/paused',
      pause() {
        // noop
      },
    } as unknown as DevtoolsService

    const debuggerController = new DevtoolsDebugger(fakeService, new Breakpoints())
    const points = debuggerController.breakpoints.list().map(item => item.point)

    expect(points).toEqual(BREAKPOINT_POINTS)
  })

  it('updates single breakpoint through debugger APIs', () => {
    const fakeService = {
      debuggerPauseUrl: 'http://127.0.0.1:3903/test/command/debugger/paused',
      pause() {
        // noop
      },
    } as unknown as DevtoolsService

    const debuggerController = new DevtoolsDebugger(fakeService, new Breakpoints())

    expect(debuggerController.getBreakpoint('loop_start')?.enabled).toBe(true)
    debuggerController.disableBreakpoint('loop_start')
    expect(debuggerController.getBreakpoint('loop_start')?.enabled).toBe(false)

    debuggerController.setBreakpoint('loop_start', true)
    expect(debuggerController.getBreakpoint('loop_start')?.enabled).toBe(true)
  })

  it('updates all breakpoints through debugger APIs', () => {
    const fakeService = {
      debuggerPauseUrl: 'http://127.0.0.1:3903/test/command/debugger/paused',
      pause() {
        // noop
      },
    } as unknown as DevtoolsService

    const debuggerController = new DevtoolsDebugger(fakeService, new Breakpoints())

    debuggerController.disableAllBreakpoints()
    expect(debuggerController.listBreakpoints().every(item => item.enabled === false)).toBe(true)

    debuggerController.enableAllBreakpoints()
    expect(debuggerController.listBreakpoints().every(item => item.enabled === true)).toBe(true)
  })
})
