import { useWorkspaces } from '@/service/use-workspace'
import { createContext, useContext } from 'use-context-selector'
import type { ReactNode } from 'react'

type IWorkspace = {}

type WorkspacesContextValue = {
  workspaces: IWorkspace[]
}

export const WorkspacesContext = createContext<WorkspacesContextValue>({
  workspaces: [],
})

export const useWorkspacesContext = () => useContext(WorkspacesContext)

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