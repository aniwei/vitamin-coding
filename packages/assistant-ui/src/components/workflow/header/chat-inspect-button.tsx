import Button from '@/components/button'
import useTheme from '@/hooks/use-theme'
import { memo } from 'react'
import { BubbleX } from '@/components/icons/line/others'
import { clsx } from 'clsx'

type ChatInspectButtonProps = {
  disabled: boolean
}

export const ChatInspectButton: React.FC<ChatInspectButtonProps> = memo(({ disabled }) => {
  const { theme } = useTheme()
  const showChatInspectPanel = useStore(s => s.showChatInspectPanel)
  const setShowChatInspectPanel = useStore(s => s.setShowChatInspectPanel)
  const setShowEnvPanel = useStore(s => s.setShowEnvPanel)
  const setShowGlobalVariablePanel = useStore(s => s.setShowGlobalVariablePanel)
  const setShowDebugAndPreviewPanel = useStore(s => s.setShowDebugAndPreviewPanel)

  const handleClick = () => {
    setShowChatInspectPanel(true)
    setShowEnvPanel(false)
    setShowGlobalVariablePanel(false)
    setShowDebugAndPreviewPanel(false)
  }

  return (
    <Button
      className={clsx(
        'rounded-lg border border-transparent p-2',
        theme === 'dark' && showChatInspectPanel && 'border-black/5 bg-white/10 backdrop-blur-xs',
      )}
      disabled={disabled}
      onClick={handleClick}
      variant="ghost"
    >
      <BubbleX className="h-4 w-4 text-components-button-secondary-text" />
    </Button>
  )
})

ChatInspectButton.displayName = 'ChatInspectButton'
export default ChatInspectButton
