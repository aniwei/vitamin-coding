
import WorkplaceSelector from '@/components/header/dropdown/workplace-selector'
import Menus from './dropdown'
import AppNav from './app-nav'
import DatasetNav from './dataset-nav'
import EnvNav from './env-nav'
import ExploreNav from './explore-nav'
import ToolsNav from './tools-nav'
import { Link } from 'react-router-dom'
import { WorkspaceProvider } from '@/context/workspace-context-provider'


const Logo = () => (
  <h1>
    <Link to="/apps" className="flex h-8 shrink-0 items-center justify-center overflow-hidden whitespace-nowrap px-0.5 indent-[-9999px]">
      VITAMIN
    </Link>
  </h1>
)

const Header = () => {
  return (
    <div className="flex h-[56px] items-center">
      <div className="flex min-w-0 flex-1 items-center pl-3 pr-2 min-[1280px]:pr-3">
        <Logo />
        <div className="mx-1.5 shrink-0 font-light text-divider-deep">/</div>
        <WorkspaceProvider>
          <WorkplaceSelector />
        </WorkspaceProvider>
      </div>
      <div className="flex items-center space-x-2">
        <ExploreNav className="flex items-center relative px-3 h-8 rounded-xl font-medium text-sm cursor-pointer" />
        <AppNav />
        <DatasetNav />
        <ToolsNav className="flex items-center relative px-3 h-8 rounded-xl font-medium text-sm cursor-pointer" />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end pl-2 pr-3 min-[1280px]:pl-3">
        <EnvNav />
        {/* TODO */}
        {/* <div className="mr-2">
          <PluginsNav />
        </div> */}
        <Menus />
      </div>
    </div>
  )
}
export default Header
