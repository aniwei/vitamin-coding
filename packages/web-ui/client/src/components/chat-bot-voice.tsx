import { appStore } from '@/store'
import { useShallow } from 'zustand/shallow'
import { Drawer, DrawerContent, DrawerPortal, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'

export function ChatBotVoice() {
  const { t } = useTranslation('Chat')
  const [voiceChat, appStoreMutate] = appStore(
    useShallow((state) => [state.voiceChat, state.mutate])
  )

  return (
    <Drawer
      handleOnly
      direction="right"
      open={voiceChat.isOpen}
      onOpenChange={(open) =>
        appStoreMutate({
          voiceChat: { ...voiceChat, isOpen: open },
        })
      }
    >
      <DrawerPortal>
        <DrawerContent className="p-4">
          <DrawerTitle>{t('VoiceChat.startVoiceChat')}</DrawerTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Voice chat migration is in progress.
          </p>
          <Button
            className="mt-4"
            onClick={() =>
              appStoreMutate({
                voiceChat: { ...voiceChat, isOpen: false },
              })
            }
          >
            {t('Common.close')}
          </Button>
        </DrawerContent>
      </DrawerPortal>
    </Drawer>
  )
}
