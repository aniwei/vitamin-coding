import Main from './layout-main'

interface LayoutProps {
  children: React.ReactNode
  sessionId: string
}

export const Layout: React.FC<LayoutProps> = (props) => {
  const { children, sessionId } = props

  return <Main sessionId={sessionId}>{children}</Main>
}

export default Layout
