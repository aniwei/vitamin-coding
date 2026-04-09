'use client'

import { useWorkspaces } from '@/service/use-workspace'
import { WorkspacesContext } from './workspace-context'
import type { ReactNode } from 'react'

type WorkspaceProviderProps = {
  children: ReactNode
}

export const WorkspaceProvider = ({
  children,
}: WorkspaceProviderProps) => {
  const { data } = useWorkspaces()

  return (
    <WorkspacesContext.Provider value={{
      workspaces: data?.workspaces || [],
    }}
    >
      {children}
    </WorkspacesContext.Provider>
  )
}
