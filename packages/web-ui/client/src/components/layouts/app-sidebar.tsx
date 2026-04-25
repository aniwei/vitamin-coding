
import { Sidebar, SidebarContent } from '@/components/ui/sidebar'
import { AppSidebarThreads } from './app-sidebar-threads'

export function AppSidebar() {
  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r border-sidebar-border/80 !top-12 !h-[calc(100svh-3rem)]"
    >
      <SidebarContent className="overflow-hidden relative">
        <div className="flex flex-col overflow-y-auto h-full">
          <AppSidebarThreads />
        </div>
      </SidebarContent>
    </Sidebar>
  )
}
