import { ChatContext } from './context'
import type { ReactNode } from 'react'
import type { ChatContextValue } from './context'

interface ChatContextProviderProps extends ChatContextValue {
  children: ReactNode
}

export const ChatContextProvider: React.FC<ChatContextProviderProps> = ({
  children,
  readonly = false,
  setting,
  responding,
  chatList,
  showPromptLog,
  questionIcon,
  answerIcon,
  disableFeedback,
  onSend,
  onRegenerate,
  onAnnotationEdited,
  onAnnotationAdded,
  onAnnotationRemoved,
  onFeedback,
  getHumanInputNodeData,
}) => {
  return (
    <ChatContext.Provider value={{
      setting,
      readonly,
      responding,
      chatList: chatList || [],
      showPromptLog,
      questionIcon,
      answerIcon,
      onSend,
      onRegenerate,
      onAnnotationEdited,
      onAnnotationAdded,
      onAnnotationRemoved,
      disableFeedback,
      onFeedback,
      getHumanInputNodeData,
    }}
    >
      {children}
    </ChatContext.Provider>
  )
}
