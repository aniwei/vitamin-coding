import { describe, it, expect } from 'vitest'
import { createClarifyChannel } from '../src/clarify-channel'
import type { ClarifyHandler, ClarifyRequest } from '../src/clarify-channel'

describe('createClarifyChannel', () => {
  const echoHandler: ClarifyHandler = async (req) => ({
    answer: `Answer to: ${req.question}`,
  })

  it('request() sends question and returns answer', async () => {
    const channel = createClarifyChannel({ handler: echoHandler })

    const result = await channel.request({
      taskId: 'task-1',
      question: 'What is the API format?',
    })

    expect(result.success).toBe(true)
    expect(result.answer).toBe('Answer to: What is the API format?')
  })

  it('request() defaults reason to missing_context', async () => {
    let capturedReq: ClarifyRequest | undefined
    const handler: ClarifyHandler = async (req) => {
      capturedReq = req
      return { answer: 'ok' }
    }

    const channel = createClarifyChannel({ handler })
    await channel.request({ taskId: 'task-1', question: 'test' })

    expect(capturedReq!.reason).toBe('missing_context')
  })

  it('request() respects custom reason', async () => {
    let capturedReason: string | undefined
    const handler: ClarifyHandler = async (req) => {
      capturedReason = req.reason
      return { answer: 'ok' }
    }

    const channel = createClarifyChannel({ handler })
    await channel.request({
      taskId: 'task-1',
      question: 'test',
      reason: 'approval_needed',
    })

    expect(capturedReason).toBe('approval_needed')
  })

  it('request() passes parentTaskId and correlationId', async () => {
    let capturedReq: ClarifyRequest | undefined
    const handler: ClarifyHandler = async (req) => {
      capturedReq = req
      return { answer: 'ok' }
    }

    const channel = createClarifyChannel({ handler })
    await channel.request({
      taskId: 'task-1',
      parentTaskId: 'parent-1',
      correlationId: 'corr-1',
      question: 'test',
    })

    expect(capturedReq!.parentTaskId).toBe('parent-1')
    expect(capturedReq!.correlationId).toBe('corr-1')
  })

  it('request() returns escalation from handler', async () => {
    const handler: ClarifyHandler = async () => ({
      answer: 'escalated',
      escalation: 'user',
    })

    const channel = createClarifyChannel({ handler })
    const result = await channel.request({
      taskId: 'task-1',
      question: 'need approval',
    })

    expect(result.escalation).toBe('user')
  })

  it('enforces maxClarifications limit (default 3)', async () => {
    const channel = createClarifyChannel({ handler: echoHandler })

    // First 3 succeed
    for (let i = 0; i < 3; i++) {
      const r = await channel.request({ taskId: 'task-1', question: `q${i}` })
      expect(r.success).toBe(true)
    }

    // 4th is blocked
    const r4 = await channel.request({ taskId: 'task-1', question: 'q3' })
    expect(r4.success).toBe(false)
    expect(r4.error).toContain('Max clarifications reached')
  })

  it('enforces custom maxClarifications', async () => {
    const channel = createClarifyChannel({
      handler: echoHandler,
      maxClarifications: 1,
    })

    const r1 = await channel.request({ taskId: 'task-1', question: 'q1' })
    expect(r1.success).toBe(true)

    const r2 = await channel.request({ taskId: 'task-1', question: 'q2' })
    expect(r2.success).toBe(false)
  })

  it('limits are per-task', async () => {
    const channel = createClarifyChannel({
      handler: echoHandler,
      maxClarifications: 1,
    })

    const r1 = await channel.request({ taskId: 'task-1', question: 'q1' })
    expect(r1.success).toBe(true)

    // Different task should also succeed
    const r2 = await channel.request({ taskId: 'task-2', question: 'q2' })
    expect(r2.success).toBe(true)

    // Same task blocked
    const r3 = await channel.request({ taskId: 'task-1', question: 'q3' })
    expect(r3.success).toBe(false)
  })

  it('count() tracks clarifications per task', async () => {
    const channel = createClarifyChannel({ handler: echoHandler })

    expect(channel.count('task-1')).toBe(0)

    await channel.request({ taskId: 'task-1', question: 'q1' })
    expect(channel.count('task-1')).toBe(1)

    await channel.request({ taskId: 'task-1', question: 'q2' })
    expect(channel.count('task-1')).toBe(2)

    expect(channel.count('task-2')).toBe(0)
  })

  it('history() returns all requests for a task', async () => {
    const channel = createClarifyChannel({ handler: echoHandler })

    await channel.request({ taskId: 'task-1', question: 'q1' })
    await channel.request({ taskId: 'task-1', question: 'q2' })
    await channel.request({ taskId: 'task-2', question: 'other' })

    const hist = channel.history('task-1')
    expect(hist).toHaveLength(2)
    expect(hist[0].question).toBe('q1')
    expect(hist[1].question).toBe('q2')
  })

  it('history() returns empty array for unknown task', () => {
    const channel = createClarifyChannel({ handler: echoHandler })
    expect(channel.history('unknown')).toEqual([])
  })

  it('request() handles handler errors gracefully', async () => {
    const failHandler: ClarifyHandler = async () => {
      throw new Error('handler crashed')
    }

    const channel = createClarifyChannel({ handler: failHandler })
    const result = await channel.request({
      taskId: 'task-1',
      question: 'test',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Clarify handler failed')
    expect(result.error).toContain('handler crashed')
  })

  it('failed request still counts toward limit', async () => {
    const failHandler: ClarifyHandler = async () => {
      throw new Error('fail')
    }

    const channel = createClarifyChannel({
      handler: failHandler,
      maxClarifications: 2,
    })

    await channel.request({ taskId: 'task-1', question: 'q1' })
    await channel.request({ taskId: 'task-1', question: 'q2' })

    // Both failed but both count
    expect(channel.count('task-1')).toBe(2)
    const r3 = await channel.request({ taskId: 'task-1', question: 'q3' })
    expect(r3.success).toBe(false)
    expect(r3.error).toContain('Max clarifications')
  })

  it('request generates unique ids', async () => {
    let ids: string[] = []
    const handler: ClarifyHandler = async (req) => {
      ids.push(req.id)
      return { answer: 'ok' }
    }

    const channel = createClarifyChannel({ handler })
    await channel.request({ taskId: 'task-1', question: 'q1' })
    await channel.request({ taskId: 'task-1', question: 'q2' })

    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })
})
