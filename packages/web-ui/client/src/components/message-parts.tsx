import { UIMessage } from 'ai'
import { UseChatHelpers } from '@ai-sdk/react'

export function UserMessagePart({
  part,
}: {
  part: { text?: string }
  [key: string]: unknown
}) {
  return <div className="whitespace-pre-wrap">{part.text ?? ''}</div>
}

export function AssistMessagePart({
  part,
}: {
  part: { text?: string }
  [key: string]: unknown
}) {
  return <div className="whitespace-pre-wrap">{part.text ?? ''}</div>
}

export function ToolMessagePart(_: { [key: string]: unknown }) {
  return null
}

export function ReasoningPart({
  reasoningText,
}: {
  reasoningText?: string
  [key: string]: unknown
}) {
  return <div className="text-muted-foreground text-sm">{reasoningText ?? ''}</div>
}

export function FileMessagePart({
  part,
}: {
  part: { filename?: string }
  [key: string]: unknown
}) {
  return <div className="text-xs text-muted-foreground">{part.filename ?? 'file'}</div>
}

export function SourceUrlMessagePart({
  part,
}: {
  part: { url?: string }
  [key: string]: unknown
}) {
  return <a className="text-xs underline" href={part.url}>{part.url}</a>
}

export type MessagePartProps = {
  message?: UIMessage
  setMessages?: UseChatHelpers<UIMessage>['setMessages']
}
