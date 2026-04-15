import { useLocation } from 'react-router-dom'
import type { HeaderInNormalProps } from './header-in-normal'
import HeaderInNormal from './header-in-normal'

interface HeaderProps {
  normal?: HeaderInNormalProps
}

export const Header: React.FC<HeaderProps> = ({
  normal: normalProps
}) => {
  const pathname = useLocation().pathname
  return (
    <div
      className="absolute left-0 top-7 z-10 flex h-0 w-full items-center justify-between bg-mask-top2bottom-gray-50-to-transparent px-3"
    >
      <HeaderInNormal
        {...normalProps}
      />
    </div>
  )
}

export default Header
