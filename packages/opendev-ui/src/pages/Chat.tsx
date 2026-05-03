import { useCallback, useState } from 'react'
import { Approval } from '../components/Approval'
import { AskUser } from '../components/Chat/AskUser'
import { ChatInterface } from '../components/Chat/ChatInterface'
import { CommandPalette } from '../components/Chat/CommandPalette'
import { PlanApprovalDialog } from '../components/Chat/PlanApprovalDialog'
import { StatusDialog } from '../components/Chat/StatusDialog'
import { Devtools } from '../components/Devtools'
import { SessionsSidebar } from '../components/Layout/SessionsSidebar'
import { TopBar } from '../components/Layout/TopBar'
import { ToastContainer } from '../components/ui/Toast'

export function Chat() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), [])
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), [])
  const openStatusDialog = useCallback(() => setStatusDialogOpen(true), [])
  const closeStatusDialog = useCallback(() => setStatusDialogOpen(false), [])

  return (
    <div className='h-screen flex flex-col bg-bg-100'>
      <TopBar onOpenCommandPalette={openCommandPalette} />
      <div className='flex-1 flex overflow-hidden'>
        <SessionsSidebar />
        <main className='flex-1 flex flex-col overflow-hidden bg-bg-000'>
          <ChatInterface />
        </main>
        <Devtools />
      </div>

      <Approval />
      <AskUser />
      <PlanApprovalDialog />
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={closeCommandPalette}
        onOpenStatus={openStatusDialog}
      />
      <StatusDialog isOpen={statusDialogOpen} onClose={closeStatusDialog} />
      <ToastContainer />
    </div>
  )
}
