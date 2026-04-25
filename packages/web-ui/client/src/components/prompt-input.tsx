import { UseChatHelpers } from '@ai-sdk/react'
import { UIMessage } from 'ai'
import { KeyboardEvent, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ChatModel } from '@/types/chat'

type Props = {
  input: string
  setInput: (value: string) => void
  sendMessage: UseChatHelpers<UIMessage>['sendMessage']
  isLoading?: boolean
  onStop?: () => void
  placeholder?: string
  disabledMention?: boolean
  toolDisabled?: boolean
  voiceDisabled?: boolean
  model?: ChatModel
  setModel?: (model: ChatModel) => void
}

export default function PromptInput({
  input,
  setInput,
  sendMessage,
  isLoading,
  onStop,
  placeholder,
}: Props) {
  const onSubmit = useCallback(async () => {
    const text = input.trim()
    if (!text) return
    await sendMessage({ text })
    setInput('')
  }, [input, sendMessage, setInput])

  const onKeyDown = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      await onSubmit()
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
      />
      <div className="flex gap-2">
        <Button onClick={onSubmit} disabled={isLoading}>Send</Button>
        <Button variant="secondary" onClick={onStop} disabled={!isLoading}>Stop</Button>
      </div>
    </div>
  )
}
