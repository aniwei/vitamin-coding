import { BREAKPOINT_POINTS, type BreakpointPoint } from '../protocol'

export interface Breakpoint {
  point: BreakpointPoint
  enabled: boolean
}

export class Breakpoints {
  private readonly byPoint = new Map<BreakpointPoint, Breakpoint>()

  constructor(points: readonly BreakpointPoint[] = BREAKPOINT_POINTS) {
    for (const point of points) {
      this.byPoint.set(point, { point, enabled: true })
    }
  }

  list(): Breakpoint[] {
    return Array.from(this.byPoint.values(), breakpoint => ({ ...breakpoint }))
  }

  get(point: BreakpointPoint): Breakpoint | undefined {
    const breakpoint = this.byPoint.get(point)
    if (!breakpoint) {
      return undefined
    }

    return { ...breakpoint }
  }

  shouldPause(point: BreakpointPoint): boolean {
    return this.byPoint.get(point)?.enabled ?? false
  }

  set(point: BreakpointPoint, enabled: boolean): Breakpoint {
    const breakpoint = this.byPoint.get(point)
    if (!breakpoint) {
      const next = { point, enabled }
      this.byPoint.set(point, next)
      return { ...next }
    }

    breakpoint.enabled = enabled
    return { ...breakpoint }
  }

  enable(point: BreakpointPoint): Breakpoint {
    return this.set(point, true)
  }

  disable(point: BreakpointPoint): Breakpoint {
    return this.set(point, false)
  }

  enableAll(): void {
    for (const breakpoint of this.byPoint.values()) {
      breakpoint.enabled = true
    }
  }

  disableAll(): void {
    for (const breakpoint of this.byPoint.values()) {
      breakpoint.enabled = false
    }
  }
}
