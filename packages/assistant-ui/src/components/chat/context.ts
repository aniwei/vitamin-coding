import { createContext, useContext } from 'use-context-selector'
import type { ChatProps } from './index'

export type ChatContextValue = Pick<ChatProps, 
  'setting'
  | 'responding'
  | 'chatList'
  | 'showPromptLog'
  | 'questionIcon'
  | 'answerIcon'
  | 'onSend'
  | 'onRegenerate'
  | 'onAnnotationEdited'
  | 'onAnnotationAdded'
  | 'onAnnotationRemoved'
  | 'disableFeedback'
  | 'onFeedback'
  | 'getHumanInputNodeData'> & {
    readonly?: boolean
  }

export const ChatContext = createContext<ChatContextValue>({
  chatList: [],
  readonly: false,
})

export const useChatContext = () => useContext(ChatContext)
