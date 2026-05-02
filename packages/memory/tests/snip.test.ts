import { describe, expect, it } from 'vitest'
import { snip } from '../src/snip'

import type { Message, ToolResultMessage } from '@vitamin/ai'

function userMsg(text: string): Message {
  return { role: 'user', content: [{ type: 'text', text }], timestamp: Date.now() }
}

function toolResult(text: string): ToolResultMessage {
  return {
    role: 'tool_result',
    toolCallId: `tc_${Math.random()}`,
    toolName: 'read',
    content: [{ type: 'text', text }],
    details: null,
    isError: false,
    timestamp: Date.now(),
  }
}

function makeLongOutput(lines: number): string {
  return Array.from({ length: lines }, (_, i) => `line ${i + 1}: ${'x'.repeat(80)}`).join('\n')
}

describe('snip', () => {
  it('#given output below maxOutputChars #then returns unchanged', () => {
    const messages = [userMsg('hello'), toolResult('short output')]
    const result = snip(messages, { maxOutputChars: 8000 })

    expect(result.changed).toBe(false)
    expect(result.snippedCount).toBe(0)
    expect(result.messages[1]).toBe(messages[1])
  })

  it('#given oversized output #then truncates with head+tail', () => {
    const longText = makeLongOutput(200)
    const messages = [userMsg('hello'), toolResult(longText)]
    const result = snip(messages, {
      maxOutputChars: 100,
      keepHeadLines: 10,
      keepTailLines: 5,
    })

    expect(result.changed).toBe(true)
    expect(result.snippedCount).toBe(1)

    const content = (result.messages[1] as ToolResultMessage).content[0]!
    const text = (content as { text: string }).text

    expect(text).toContain('line 1:')
    expect(text).toContain('line 10:')
    expect(text).toContain('[...snipped 185 lines...]')
    expect(text).toContain('line 196:')
    expect(text).toContain('line 200:')
    expect(text).not.toContain('line 11:')
  })

  it('#given output with few lines but many chars #then does not snip', () => {
    const text = 'x'.repeat(10000)
    const messages = [toolResult(text)]
    const result = snip(messages, {
      maxOutputChars: 100,
      keepHeadLines: 50,
      keepTailLines: 30,
    })

    expect(result.changed).toBe(false)
  })

  it('#given non-tool messages #then leaves them unchanged', () => {
    const messages = [userMsg('x'.repeat(10000))]
    const result = snip(messages, { maxOutputChars: 100 })

    expect(result.changed).toBe(false)
    expect(result.messages[0]).toBe(messages[0])
  })

  it('#given multiple tool results #then snips only oversized ones', () => {
    const messages = [
      toolResult('short'),
      toolResult(makeLongOutput(200)),
      toolResult('also short'),
      toolResult(makeLongOutput(300)),
    ]
    const result = snip(messages, {
      maxOutputChars: 100,
      keepHeadLines: 5,
      keepTailLines: 5,
    })

    expect(result.snippedCount).toBe(2)
    expect(result.messages[0]).toBe(messages[0])
    expect(result.messages[2]).toBe(messages[2])

    const snipped1 = (result.messages[1] as ToolResultMessage).content[0] as { text: string }
    expect(snipped1.text).toContain('[...snipped 190 lines...]')

    const snipped2 = (result.messages[3] as ToolResultMessage).content[0] as { text: string }
    expect(snipped2.text).toContain('[...snipped 290 lines...]')
  })

  it('#given default config #then uses 8000 char threshold', () => {
    const shortish = makeLongOutput(50) // ~4500 chars
    const messages = [toolResult(shortish)]
    const result = snip(messages)

    expect(result.changed).toBe(false)
  })
})
