'use client'

import { useSidebar } from 'ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from 'ui/tooltip'
import {
  ChevronDown,
  Command,
  FolderOpenIcon,
  FolderSearchIcon,
  Languages,
  MoonStar,
  PanelLeft,
  Palette,
  PlusIcon,
  Settings2,
  Shield,
  Sun,
  Waypoints,
} from 'lucide-react'
import { Button } from 'ui/button'
import { Separator } from 'ui/separator'
import { WriteIcon } from 'ui/write-icon'
import { MCPIcon } from 'ui/mcp-icon'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from 'ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from 'ui/avatar'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ThreadDropdown } from '../thread-dropdown'
import { appStore } from '@/app/store'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useShallow } from 'zustand/shallow'
import {
  getShortcutKeyList,
  isShortcutEvent,
  Shortcuts,
} from 'lib/keyboard-shortcuts'
import { useTranslations } from 'next-intl'
import { TextShimmer } from 'ui/text-shimmer'
import { buildReturnUrl } from 'lib/admin/navigation-utils'
import { BackButton } from '@/components/layouts/back-button'
import { BasicUser } from 'app-types/user'
import { getIsUserAdmin, getUserAvatar } from 'lib/user/utils'
import { useArchives } from '@/hooks/queries/use-archives'
import { ArchiveDialog } from '../archive-dialog'
import { COOKIE_KEY_LOCALE, SUPPORTED_LOCALES } from 'lib/const'
import { fetcher, cn } from 'lib/utils'
import useSWR from 'swr'
import { getLocaleAction } from '@/i18n/get-locale'
import { GithubIcon } from 'ui/github-icon'
import { DiscordIcon } from 'ui/discord-icon'
import { useTheme } from 'next-themes'

export function AppHeader({ user }: { user?: BasicUser }) {
  const t = useTranslations()
  const { toggleSidebar, open } = useSidebar()
  const currentPaths = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutEvent(e, Shortcuts.toggleSidebar)) {
        e.preventDefault()
        toggleSidebar()
      }
      if (isShortcutEvent(e, Shortcuts.openNewChat)) {
        e.preventDefault()
        router.push('/')
        router.refresh()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSidebar, router])

  const componentByPage = useMemo(() => {
    if (currentPaths.startsWith('/chat/')) {
      return <ThreadDropdownComponent />
    }
    if (
      currentPaths.startsWith('/admin/users/') &&
      currentPaths.split('/').length > 3
    ) {
      const searchPageParams = searchParams.get('searchPageParams')
      const returnUrl = buildReturnUrl('/admin/users', searchPageParams || '')
      return (
        <BackButton
          data-testid="admin-users-back-button"
          returnUrl={returnUrl}
          title={t('Admin.Users.backToUsers')}
        />
      )
    }
    return null
  }, [currentPaths, searchParams, t])

  return (
    <header className="sticky top-0 z-50 flex items-center h-12 px-3 gap-1 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Sidebar toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle Sidebar"
            className="size-8 shrink-0"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              toggleSidebar()
            }}
            data-testid="sidebar-toggle"
            data-state={open ? 'open' : 'closed'}
          >
            <PanelLeft className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent align="start" side="bottom">
          <div className="flex items-center gap-2">
            {t('KeyboardShortcuts.toggleSidebar')}
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              {getShortcutKeyList(Shortcuts.toggleSidebar).map((key) => (
                <span
                  key={key}
                  className="w-5 h-5 flex items-center justify-center bg-muted rounded"
                >
                  {key}
                </span>
              ))}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Logo */}
      <Link
        href="/"
        className="hidden md:flex items-center px-2 text-sm font-semibold tracking-tight shrink-0 hover:opacity-80 transition-opacity mr-1"
      >
        better-chatbot
      </Link>

      <div className="w-px h-4 bg-border/60 shrink-0 hidden md:block" />

      {/* Nav items */}
      <nav className="hidden md:flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          onClick={() => {
            router.push('/')
            router.refresh()
          }}
        >
          <WriteIcon className="size-3.5" />
          {t('Layout.newChat')}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link href="/mcp">
            <MCPIcon className="size-3.5 fill-current" />
            {t('Layout.mcpConfiguration')}
          </Link>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link href="/workflow">
            <Waypoints className="size-3.5" />
            {t('Layout.workflow')}
          </Link>
        </Button>

        {getIsUserAdmin(user) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href="/admin">
              <Shield className="size-3.5" />
              {t('Admin.title')}
            </Link>
          </Button>
        )}

        <ArchiveHeaderDropdown />
      </nav>

      {/* Page-specific content */}
      {componentByPage && (
        <>
          <div className="w-px h-4 bg-border/60 mx-1 hidden md:block" />
          {componentByPage}
        </>
      )}

      <div className="flex-1" />

      {/* User menu */}
      <AppHeaderUser user={user} />
    </header>
  )
}

function ArchiveHeaderDropdown() {
  const t = useTranslations()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const { data: archives } = useArchives()
  const router = useRouter()

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {dropdownOpen ? (
              <FolderOpenIcon className="size-3.5" />
            ) : (
              <FolderSearchIcon className="size-3.5" />
            )}
            {t('Archive.title')}
            <ChevronDown className="size-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel className="flex items-center justify-between text-xs font-medium">
            <span className="text-muted-foreground">{t('Archive.title')}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-5"
              onClick={(e) => {
                e.stopPropagation()
                setDropdownOpen(false)
                setAddDialogOpen(true)
              }}
            >
              <PlusIcon className="size-3" />
            </Button>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {!archives || archives.length === 0 ? (
            <DropdownMenuItem
              disabled
              className="text-xs text-muted-foreground justify-center"
            >
              {t('Archive.noArchives')}
            </DropdownMenuItem>
          ) : (
            archives.map((archive) => (
              <DropdownMenuItem
                key={archive.id}
                onClick={() => router.push(`/archive/${archive.id}`)}
              >
                {archive.name}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ArchiveDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
    </>
  )
}

function AppHeaderUser({ user: propUser }: { user?: BasicUser }) {
  const t = useTranslations('Layout')
  const appStoreMutate = appStore((state) => state.mutate)
  const { data: user } = useSWR<BasicUser>('/api/user/details', fetcher, {
    fallbackData: propUser,
    revalidateOnMount: false,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    refreshInterval: 1000 * 60 * 10,
  })

  if (!user) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-full"
          data-testid="header-user-button"
        >
          <Avatar className="size-7 rounded-full border">
            <AvatarImage
              className="object-cover"
              src={getUserAvatar(user)}
              alt={user?.name || 'User'}
            />
            <AvatarFallback className="text-xs">
              {user?.name?.slice(0, 1) || ''}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="end"
        className="w-60 rounded-lg bg-background"
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="h-8 w-8 rounded-full">
              <AvatarImage
                src={getUserAvatar(user)}
                alt={user?.name || 'User'}
              />
              <AvatarFallback className="rounded-lg">
                {user?.name?.slice(0, 1) || ''}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span
                className="truncate font-medium"
                data-testid="header-user-name"
              >
                {user?.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {user?.email}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => appStoreMutate({ openChatPreferences: true })}
        >
          <Settings2 className="size-4 text-foreground" />
          <span>{t('chatPreferences')}</span>
        </DropdownMenuItem>
        <SelectTheme />
        <SelectLanguage />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => appStoreMutate({ openShortcutsPopup: true })}
        >
          <Command className="size-4 text-foreground" />
          <span>{t('keyboardShortcuts')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            window.open(
              'https://github.com/cgoinglove/better-chatbot/issues/new',
              '_blank'
            )
          }
        >
          <GithubIcon className="size-4 fill-foreground" />
          <span>{t('reportAnIssue')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            window.open('https://discord.gg/gCRu69Upnp', '_blank')
          }
        >
          <DiscordIcon className="size-4 fill-foreground" />
          <span>{t('joinCommunity')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SelectTheme() {
  const t = useTranslations('Layout')
  const { theme = 'light', setTheme } = useTheme()
  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onSelect={(e) => e.preventDefault()}
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
    >
      <Palette className="mr-2 size-4" />
      <span className="mr-auto">{t('theme')}</span>
      <div className="border rounded-full flex items-center">
        <div
          className={cn(
            theme === 'dark' &&
              'bg-accent ring ring-muted-foreground/40 text-foreground',
            'p-1 rounded-full'
          )}
        >
          <MoonStar className="size-3" />
        </div>
        <div
          className={cn(
            (theme === 'light' || theme === 'system') &&
              'bg-accent ring ring-muted-foreground/40 text-foreground',
            'p-1 rounded-full'
          )}
        >
          <Sun className="size-3" />
        </div>
      </div>
    </DropdownMenuItem>
  )
}

function SelectLanguage() {
  const t = useTranslations('Layout')
  const { data: currentLocale } = useSWR(COOKIE_KEY_LOCALE, getLocaleAction, {
    fallbackData: SUPPORTED_LOCALES[0].code,
    revalidateOnFocus: false,
  })
  const handleOnChange = useCallback((locale: string) => {
    document.cookie = `${COOKIE_KEY_LOCALE}=${locale}; path=/;`
    window.location.reload()
  }, [])

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Languages className="mr-2 size-4" />
        <span>{t('language')}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-48 max-h-96 overflow-y-auto">
          <DropdownMenuLabel className="text-muted-foreground">
            {t('language')}
          </DropdownMenuLabel>
          {SUPPORTED_LOCALES.map((locale) => (
            <DropdownMenuCheckboxItem
              key={locale.code}
              checked={locale.code === currentLocale}
              onCheckedChange={() =>
                locale.code !== currentLocale && handleOnChange(locale.code)
              }
            >
              {locale.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}

function ThreadDropdownComponent() {
  const [threadList, currentThreadId, generatingTitleThreadIds] = appStore(
    useShallow((state) => [
      state.threadList,
      state.currentThreadId,
      state.generatingTitleThreadIds,
    ])
  )
  const currentThread = useMemo(() => {
    return threadList.find((thread) => thread.id === currentThreadId)
  }, [threadList, currentThreadId])

  useEffect(() => {
    if (currentThread?.id) {
      document.title = currentThread.title || 'New Chat'
    }
  }, [currentThread?.id])

  if (!currentThread) return null

  return (
    <div className="items-center gap-1 hidden md:flex">
      <div className="w-1 h-4">
        <Separator orientation="vertical" />
      </div>

      <ThreadDropdown
        threadId={currentThread.id}
        beforeTitle={currentThread.title}
      >
        <div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="data-[state=open]:bg-input! hover:text-foreground cursor-pointer flex gap-1 items-center px-2 py-1 rounded-md hover:bg-accent"
              >
                {generatingTitleThreadIds.includes(currentThread.id) ? (
                  <TextShimmer className="truncate max-w-60 min-w-0 mr-1">
                    {currentThread.title || 'New Chat'}
                  </TextShimmer>
                ) : (
                  <p className="truncate max-w-60 min-w-0 mr-1">
                    {currentThread.title || 'New Chat'}
                  </p>
                )}

                <ChevronDown size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[200px] p-4 break-all overflow-y-auto max-h-[200px]">
              {currentThread.title || 'New Chat'}
            </TooltipContent>
          </Tooltip>
        </div>
      </ThreadDropdown>
    </div>
  )
}
