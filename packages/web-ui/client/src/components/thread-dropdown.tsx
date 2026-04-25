import { deleteThreadAction, updateThreadAction } from '@/app/api/chat/actions'
import { addItemToArchiveAction } from '@/app/api/archive/actions'
import { appStore } from '@/store'
import { type PropsWithChildren, useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/shallow'
import { mutate } from 'swr'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ChatExportPopup } from './export/chat-export-popup'

type Props = PropsWithChildren<{
  threadId: string
  beforeTitle?: string
  onDeleted?: () => void
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'end' | 'center'
}>

export function ThreadDropdown({
  threadId,
  children,
  beforeTitle,
  onDeleted,
  side,
  align,
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [archiveList] = appStore(useShallow((state) => [state.archiveList]))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="p-2 w-[220px]" side={side} align={align}>
        <div className="flex flex-col gap-1">
          <ChatExportPopup threadId={threadId}>
            <Button variant="ghost" className="justify-start">{t('Chat.Thread.exportChat')}</Button>
          </ChatExportPopup>
          <Button
            variant="ghost"
            className="justify-start"
            onClick={async () => {
              await updateThreadAction(threadId, { title: beforeTitle || '' })
              await mutate('/api/thread')
              toast.success(t('Chat.Thread.threadUpdated'))
            }}
          >
            {t('Chat.Thread.renameChat')}
          </Button>
          {archiveList.slice(0, 5).map((archive) => (
            <Button
              key={archive.id}
              variant="ghost"
              className="justify-start"
              onClick={async () => {
                await addItemToArchiveAction(archive.id, threadId)
                toast.success(t('Archive.itemAddedToArchive'))
              }}
            >
              {archive.name}
            </Button>
          ))}
          <Button
            variant="destructive"
            onClick={async () => {
              await deleteThreadAction(threadId)
              onDeleted?.()
              navigate('/')
              await mutate('/api/thread')
              toast.success(t('Chat.Thread.threadDeleted'))
            }}
          >
            {t('Chat.Thread.deleteChat')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
