
import React, { lazy, Suspense } from 'react'

const KeyboardShortcutsPopup = lazy(
  () =>
    import('@/components/keyboard-shortcuts-popup').then(
      (mod) => ({ default: mod.KeyboardShortcutsPopup })
    )
)

const ChatPreferencesPopup = lazy(
  () =>
    import('@/components/chat-preferences-popup').then(
      (mod) => ({ default: mod.ChatPreferencesPopup })
    )
)

const ChatBotVoice = lazy(
  () => import('@/components/chat-bot-voice').then((mod) => ({ default: mod.ChatBotVoice }))
)

const ChatBotTemporary = lazy(
  () =>
    import('@/components/chat-bot-temporary').then(
      (mod) => ({ default: mod.ChatBotTemporary })
    )
)

const McpCustomizationPopup = lazy(
  () =>
    import('@/components/mcp-customization-popup').then(
      (mod) => ({ default: mod.McpCustomizationPopup })
    )
)

const UserSettingsPopup = lazy(
  () =>
    import('@/components/user/user-detail/user-settings-popup').then(
      (mod) => ({ default: mod.UserSettingsPopup })
    )
)

const UserSettingsPopupLazy = UserSettingsPopup as React.ComponentType<{
  userSettingsComponent: React.ReactNode
}>

export function AppPopupProvider({
  userSettingsComponent,
}: {
  userSettingsComponent: React.ReactNode
}) {
  return (
    <Suspense fallback={null}>
      <KeyboardShortcutsPopup />
      <ChatPreferencesPopup />
      <UserSettingsPopupLazy userSettingsComponent={userSettingsComponent} />
      <ChatBotVoice />
      <ChatBotTemporary />
      <McpCustomizationPopup />
    </Suspense>
  )
}
