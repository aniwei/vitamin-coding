import { exportChatAction } from '@/app/api/chat/actions'
import { Button } from '@/components/ui/button'
import { PropsWithChildren } from 'react'
import { toast } from 'sonner'

export function ChatExportPopup({
  threadId,
  children,
}: PropsWithChildren<{ threadId: string }>) {
  return (
    <div
      onClick={async () => {
        try {
          await exportChatAction({ threadId })
          toast.success('Exported')
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Export failed'
          toast.error(message)
        }
      }}
    >
      {children ?? <Button variant="ghost">Export</Button>}
    </div>
  )
}
