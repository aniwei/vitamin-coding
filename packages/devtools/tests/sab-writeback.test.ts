import { describe, expect, it } from 'vitest'
import {
  WAKE_PENDING,
  WAKE_RESUMED,
  WAKE_WITH_PAYLOAD,
  COMMAND_CONTINUE,
  COMMAND_NEXT,
  COMMAND_STEP,
  COMMAND_STOP,
  SAB_HEADER_SIZE,
  SAB_DEFAULT_PAYLOAD_SIZE,
} from '../src/protocol'
import type { PauseResumePayload } from '../src/protocol'

/**
 * Simulates the Worker-side resolvePause: writes command type + optional payload
 * into a SharedArrayBuffer and notifies the waiting thread.
 */
function simulateWorkerResolvePause(
  sab: SharedArrayBuffer,
  commandType: number,
  payload?: PauseResumePayload,
): void {
  const header = new Int32Array(sab, 0, 3)
  const payloadRegion = new Uint8Array(sab, SAB_HEADER_SIZE)

  Atomics.store(header, 1, commandType)

  if (payload && Object.keys(payload).length > 0) {
    const jsonBytes = new TextEncoder().encode(JSON.stringify(payload))
    if (jsonBytes.length <= payloadRegion.length) {
      payloadRegion.set(jsonBytes)
      Atomics.store(header, 2, jsonBytes.length)
      Atomics.store(header, 0, WAKE_WITH_PAYLOAD)
      return
    }
  }

  Atomics.store(header, 0, WAKE_RESUMED)
}

/**
 * Simulates the main-thread pause return: reads command + payload from SAB.
 */
function simulateMainThreadRead(sab: SharedArrayBuffer): {
  state: number
  commandType: number
  payload: PauseResumePayload | null
} {
  const header = new Int32Array(sab, 0, 3)
  const payloadRegion = new Uint8Array(sab, SAB_HEADER_SIZE)

  const state = Atomics.load(header, 0)
  const commandType = Atomics.load(header, 1)

  let payload: PauseResumePayload | null = null
  if (state === WAKE_WITH_PAYLOAD) {
    const payloadLength = Atomics.load(header, 2)
    if (payloadLength > 0) {
      const jsonBytes = payloadRegion.slice(0, payloadLength)
      payload = JSON.parse(new TextDecoder().decode(jsonBytes))
    }
  }

  return { state, commandType, payload }
}

function createSAB(): SharedArrayBuffer {
  return new SharedArrayBuffer(SAB_HEADER_SIZE + SAB_DEFAULT_PAYLOAD_SIZE)
}

describe('SAB writeback protocol', () => {
  it('initializes with WAKE_PENDING state', () => {
    const sab = createSAB()
    const header = new Int32Array(sab, 0, 3)

    expect(Atomics.load(header, 0)).toBe(WAKE_PENDING)
    expect(Atomics.load(header, 1)).toBe(0)
    expect(Atomics.load(header, 2)).toBe(0)
  })

  it('resumes with WAKE_RESUMED when no payload', () => {
    const sab = createSAB()

    simulateWorkerResolvePause(sab, COMMAND_CONTINUE)

    const result = simulateMainThreadRead(sab)
    expect(result.state).toBe(WAKE_RESUMED)
    expect(result.commandType).toBe(COMMAND_CONTINUE)
    expect(result.payload).toBeNull()
  })

  it('encodes COMMAND_NEXT correctly', () => {
    const sab = createSAB()

    simulateWorkerResolvePause(sab, COMMAND_NEXT)

    const result = simulateMainThreadRead(sab)
    expect(result.state).toBe(WAKE_RESUMED)
    expect(result.commandType).toBe(COMMAND_NEXT)
  })

  it('encodes COMMAND_STEP correctly', () => {
    const sab = createSAB()

    simulateWorkerResolvePause(sab, COMMAND_STEP)

    const result = simulateMainThreadRead(sab)
    expect(result.commandType).toBe(COMMAND_STEP)
  })

  it('encodes COMMAND_STOP correctly', () => {
    const sab = createSAB()

    simulateWorkerResolvePause(sab, COMMAND_STOP)

    const result = simulateMainThreadRead(sab)
    expect(result.commandType).toBe(COMMAND_STOP)
  })

  it('writes and reads back payload with systemPrompt', () => {
    const sab = createSAB()
    const payload: PauseResumePayload = {
      systemPrompt: 'You are a helpful assistant.',
    }

    simulateWorkerResolvePause(sab, COMMAND_CONTINUE, payload)

    const result = simulateMainThreadRead(sab)
    expect(result.state).toBe(WAKE_WITH_PAYLOAD)
    expect(result.commandType).toBe(COMMAND_CONTINUE)
    expect(result.payload).toEqual(payload)
  })

  it('writes and reads back payload with injected messages', () => {
    const sab = createSAB()
    const payload: PauseResumePayload = {
      injectMessages: [
        { role: 'user', content: 'Please focus on performance.' },
        { role: 'system', content: 'Reminder: use TypeScript.' },
      ],
    }

    simulateWorkerResolvePause(sab, COMMAND_NEXT, payload)

    const result = simulateMainThreadRead(sab)
    expect(result.state).toBe(WAKE_WITH_PAYLOAD)
    expect(result.commandType).toBe(COMMAND_NEXT)
    expect(result.payload?.injectMessages).toHaveLength(2)
    expect(result.payload?.injectMessages?.[0].role).toBe('user')
    expect(result.payload?.injectMessages?.[1].content).toBe('Reminder: use TypeScript.')
  })

  it('writes and reads back payload with removeMessageIndices', () => {
    const sab = createSAB()
    const payload: PauseResumePayload = {
      removeMessageIndices: [2, 5, 8],
    }

    simulateWorkerResolvePause(sab, COMMAND_CONTINUE, payload)

    const result = simulateMainThreadRead(sab)
    expect(result.payload?.removeMessageIndices).toEqual([2, 5, 8])
  })

  it('writes and reads back payload with llmParams', () => {
    const sab = createSAB()
    const payload: PauseResumePayload = {
      llmParams: {
        temperature: 0.3,
        maxTokens: 2048,
        thinkingLevel: 'high',
      },
    }

    simulateWorkerResolvePause(sab, COMMAND_STEP, payload)

    const result = simulateMainThreadRead(sab)
    expect(result.payload?.llmParams).toEqual({
      temperature: 0.3,
      maxTokens: 2048,
      thinkingLevel: 'high',
    })
  })

  it('writes and reads back full payload', () => {
    const sab = createSAB()
    const payload: PauseResumePayload = {
      systemPrompt: 'New system prompt',
      injectMessages: [{ role: 'user', content: 'hint' }],
      removeMessageIndices: [0, 3],
      llmParams: { temperature: 0.5 },
      metadata: { debug: true, iteration: 42 },
    }

    simulateWorkerResolvePause(sab, COMMAND_CONTINUE, payload)

    const result = simulateMainThreadRead(sab)
    expect(result.state).toBe(WAKE_WITH_PAYLOAD)
    expect(result.payload).toEqual(payload)
  })

  it('falls back to WAKE_RESUMED when payload is empty object', () => {
    const sab = createSAB()

    simulateWorkerResolvePause(sab, COMMAND_CONTINUE, {})

    const result = simulateMainThreadRead(sab)
    expect(result.state).toBe(WAKE_RESUMED)
    expect(result.payload).toBeNull()
  })

  it('handles payload with unicode content', () => {
    const sab = createSAB()
    const payload: PauseResumePayload = {
      systemPrompt: '你是一个有用的助手。请用中文回答。🚀',
      injectMessages: [{ role: 'user', content: 'こんにちは世界' }],
    }

    simulateWorkerResolvePause(sab, COMMAND_CONTINUE, payload)

    const result = simulateMainThreadRead(sab)
    expect(result.payload?.systemPrompt).toBe('你是一个有用的助手。请用中文回答。🚀')
    expect(result.payload?.injectMessages?.[0].content).toBe('こんにちは世界')
  })

  it('header has correct byte layout (12 bytes)', () => {
    expect(SAB_HEADER_SIZE).toBe(12)
    expect(SAB_HEADER_SIZE).toBe(3 * Int32Array.BYTES_PER_ELEMENT)
  })

  it('default payload size is 64KB', () => {
    expect(SAB_DEFAULT_PAYLOAD_SIZE).toBe(65536)
  })
})
