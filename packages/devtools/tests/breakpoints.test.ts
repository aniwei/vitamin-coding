import { describe, expect, it } from 'vitest'

import { BREAKPOINT_POINTS } from '../src/protocol'
import { Breakpoints } from '../src/tools/breakpoints'

describe('Breakpoints', () => {
  it('initializes all predefined points as enabled', () => {
    const breakpoints = new Breakpoints()

    expect(breakpoints.list().map(item => item.point)).toEqual(BREAKPOINT_POINTS.map(item => item.point))
    expect(breakpoints.get('loop_start')).toMatchObject({
      point: 'loop_start',
      name: 'Loop Start',
      category: 'agent_work_loop',
      enabled: true,
    })
    expect(breakpoints.list().every(item => item.enabled)).toBe(true)
  })

  it('disables and enables a single point', () => {
    const breakpoints = new Breakpoints()

    breakpoints.disable('loop_start')
    expect(breakpoints.shouldPause('loop_start')).toBe(false)

    breakpoints.enable('loop_start')
    expect(breakpoints.shouldPause('loop_start')).toBe(true)
  })

  it('can disableAll and enableAll', () => {
    const breakpoints = new Breakpoints()

    breakpoints.disableAll()
    expect(breakpoints.list().every(item => item.enabled === false)).toBe(true)

    breakpoints.enableAll()
    expect(breakpoints.list().every(item => item.enabled === true)).toBe(true)
  })

  it('returns snapshot objects from get/list', () => {
    const breakpoints = new Breakpoints()

    const entry = breakpoints.get('loop_start')
    expect(entry).toBeDefined()
    expect(entry?.enabled).toBe(true)

    if (entry) {
      entry.enabled = false
    }

    expect(breakpoints.shouldPause('loop_start')).toBe(true)
  })
})
