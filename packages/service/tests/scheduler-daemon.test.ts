import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCodingService } from '../src/coding-service'
import type { CodingService } from '../src/coding-service'

function createServiceWithScheduler(
  tick: () => Promise<unknown>,
  options: {
    enabled?: boolean
    tickIntervalMs?: number
    tickOnStart?: boolean
  } = {},
): CodingService {
  return createCodingService(
    {
      devtools: null,
      scheduler: { tick },
      hookRegistry: {
        registerAll: vi.fn(),
        unregister: vi.fn(),
      },
      getSession: vi.fn(),
      getActiveSession: vi.fn(),
    } as never,
    {
      port: 0,
      scheduler: options,
    },
  )
}

describe('CodingService scheduler daemon', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ticks scheduler immediately when the daemon starts', async () => {
    const tick = vi.fn(async () => undefined)
    const service = createServiceWithScheduler(tick)

    try {
      ;(service as unknown as { startSchedulerDaemon: () => void }).startSchedulerDaemon()

      expect(tick).toHaveBeenCalledTimes(1)
    } finally {
      ;(service as unknown as { stopSchedulerDaemon: () => void }).stopSchedulerDaemon()
      service.ws.close()
    }
  })

  it('runs interval ticks and stops them on daemon stop', async () => {
    vi.useFakeTimers()
    const tick = vi.fn(async () => undefined)
    const service = createServiceWithScheduler(tick, {
      tickOnStart: false,
      tickIntervalMs: 1000,
    })

    try {
      ;(service as unknown as { startSchedulerDaemon: () => void }).startSchedulerDaemon()

      await vi.advanceTimersByTimeAsync(2500)
      expect(tick).toHaveBeenCalledTimes(2)

      ;(service as unknown as { stopSchedulerDaemon: () => void }).stopSchedulerDaemon()
      await vi.advanceTimersByTimeAsync(2500)
      expect(tick).toHaveBeenCalledTimes(2)
    } finally {
      service.ws.close()
    }
  })

  it('does not start the daemon when scheduler is disabled', async () => {
    const tick = vi.fn(async () => undefined)
    const service = createServiceWithScheduler(tick, { enabled: false })

    try {
      ;(service as unknown as { startSchedulerDaemon: () => void }).startSchedulerDaemon()

      expect(tick).not.toHaveBeenCalled()
    } finally {
      ;(service as unknown as { stopSchedulerDaemon: () => void }).stopSchedulerDaemon()
      service.ws.close()
    }
  })
})
