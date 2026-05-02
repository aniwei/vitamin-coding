import { DEFAULT_SNIP_CONFIG } from './defaults'

import type { Message, ToolResultMessage } from '@vitamin/ai'
import type { SnipConfig, SnipResult } from './types'

export function snip(messages: readonly Message[], config: Partial<SnipConfig> = {}): SnipResult {
  const cfg: SnipConfig = { ...DEFAULT_SNIP_CONFIG, ...config }
  let snippedCount = 0

  const result = messages.map((msg) => {
    if (msg.role !== 'tool_result') {
      return msg
    }

    const snipped = snipToolResult(msg as ToolResultMessage, cfg)
    if (snipped !== msg) {
      snippedCount++
    }
    return snipped
  })

  return { messages: result, snippedCount, changed: snippedCount > 0 }
}

function snipToolResult(msg: ToolResultMessage, cfg: SnipConfig): ToolResultMessage {
  const text = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('')

  if (text.length <= cfg.maxOutputChars) {
    return msg
  }

  const lines = text.split('\n')
  const minLines = cfg.keepHeadLines + cfg.keepTailLines
  if (lines.length <= minLines) {
    return msg
  }

  const head = lines.slice(0, cfg.keepHeadLines).join('\n')
  const tail = lines.slice(-cfg.keepTailLines).join('\n')
  const skipped = lines.length - cfg.keepHeadLines - cfg.keepTailLines

  return {
    ...msg,
    content: [
      {
        type: 'text' as const,
        text: `${head}\n\n[...snipped ${skipped} lines...]\n\n${tail}`,
      },
    ],
  }
}
