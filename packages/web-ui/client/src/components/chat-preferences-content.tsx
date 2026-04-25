import { useTranslation } from 'react-i18next'

export function UserInstructionsContent() {
  const { t } = useTranslation()
  return <div className="text-sm text-muted-foreground">{t('Chat.ChatPreferences.userInstructions')}</div>
}

export function MCPInstructionsContent() {
  const { t } = useTranslation()
  return <div className="text-sm text-muted-foreground">{t('Chat.ChatPreferences.mcpInstructions')}</div>
}

export function ExportsManagementContent() {
  const { t } = useTranslation()
  return <div className="text-sm text-muted-foreground">{t('Chat.ChatPreferences.myExports')}</div>
}
