import AgentLogModal from '@/components/agent-log-modal'
import PromptLogModal from '@/components/prompt-log-modal'
import type { FC } from 'react'
import type { ChatItem } from './types'

type ChatLogModalsProps = {
  width: number
  currentLogItem?: ChatItem
  showPromptLogModal: boolean
  showAgentLogModal: boolean
  hideLogModal?: boolean
  setCurrentLogItem: (item?: ChatItem) => void
  setShowPromptLogModal: (showPromptLogModal: boolean) => void
  setShowAgentLogModal: (showAgentLogModal: boolean) => void
}

const ChatLogModals: FC<ChatLogModalsProps> = ({
  width,
  currentLogItem,
  showPromptLogModal,
  showAgentLogModal,
  hideLogModal,
  setCurrentLogItem,
  setShowPromptLogModal,
  setShowAgentLogModal,
}) => {
  if (hideLogModal) {
    return null
  }

  return (
    <>
      {
        showPromptLogModal && <PromptLogModal
          width={width}
          currentLogItem={currentLogItem}
          onCancel={() => {
            setCurrentLogItem()
            setShowPromptLogModal(false)
          }}
        />
      }
      {
        showAgentLogModal && <AgentLogModal
          width={width}
          currentLogItem={currentLogItem}
          onCancel={() => {
            setCurrentLogItem()
            setShowAgentLogModal(false)
          }}
        />
      }
    </>
  )
}

ChatLogModals.displayName = 'ChatLogModals'
export default ChatLogModals
