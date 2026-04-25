import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  SidebarMenu,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { Tooltip } from '@/components/ui/tooltip'
import { SidebarMenuItem } from '@/components/ui/sidebar'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { Shield, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const AppSidebarAdmin = () => {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { t } = useTranslation('Admin')
  const shouldExpandAdmin = useMemo(() => {
    return pathname.startsWith('/admin')
  }, [pathname])
  const adminNavItems = useMemo(
    () => [
      {
        id: 'users',
        title: t('Users.title'),
        url: '/admin',
        icon: Users,
        isActive: pathname.startsWith('/admin/users'),
      },
    ],
    [t, pathname]
  )

  return (
    <SidebarMenu className="group/admin">
      <Tooltip>
        <SidebarMenuItem>
          <Link to="/admin" data-testid="admin-sidebar-link">
            <SidebarMenuButton className="font-semibold">
              <Shield className="size-4 text-foreground" />
              {t('title')}
            </SidebarMenuButton>
          </Link>
        </SidebarMenuItem>
      </Tooltip>
      {shouldExpandAdmin && (
        <SidebarMenuSub className="mb-2">
          {adminNavItems.map((item) => (
            <SidebarMenuSubItem key={item.id}>
              <SidebarMenuSubButton
                className="text-muted-foreground"
                data-testid={`admin-sidebar-link-${item.id}`}
                onClick={() => {
                  navigate(item.url)
                }}
                isActive={item.isActive}
              >
                {item.title}
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenu>
  )
}

export { AppSidebarAdmin }
