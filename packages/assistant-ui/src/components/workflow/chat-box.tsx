import React from 'react'
import Chat, { type ChatProps } from '@/components/chat'
import Empty from './empty'

type ChatBoxProps = ChatProps

export const ChatBox: React.FC<ChatBoxProps> = ({ chatList }) => {
  return (

    <div 
      className="relative flex h-full grow flex-col shink-0 w-[720px]" 
      style={{ borderColor: 'rgba(0, 0, 0, 0.02)' }}
    >
      <div 
        className="flex grow flex-col border-r-[0.5px] border-components-panel-border bg-chatbot-bg"
      >
        <Chat 
          chatList={chatList} 
          chatNode={chatList.length === 0 ? <Empty /> : null}
          containerClassName="px-3 pt-6"
          footerClassName="px-3 pt-10 pb-20"
        />
      </div>
      <div
        // ref={triggerRef}
        className="absolute -right-1 top-0 flex h-full w-1 cursor-col-resize resize-x items-center justify-center"
      >
        <div className="h-10 w-0.5 rounded-xs bg-state-base-handle hover:h-full hover:bg-state-accent-solid active:h-full active:bg-state-accent-solid"></div>
      </div>
    </div>
  )
}

ChatBox.displayName = 'ChatBox'
export default ChatBox