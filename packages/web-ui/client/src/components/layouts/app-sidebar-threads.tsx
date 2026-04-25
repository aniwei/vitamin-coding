

import { SidebarGroupLabel, SidebarMenuSub } from '@/components/ui/sidebar'
import { Link } from 'react-router-dom'
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuSkeleton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { SidebarGroupContent, SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar'
import { SidebarGroup } from '@/components/ui/sidebar'
import { ThreadDropdown } from '../thread-dropdown'
import { ChevronDown, ChevronUp, MoreHorizontal, Trash } from 'lucide-react'
import { useMounted } from '@/hooks/use-mounted'
import { appStore } from '@/store'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  deleteThreadsAction,
  deleteUnarchivedThreadsAction,
} from '@/app/api/chat/actions'
import { fetcher } from '@/lib/utils'
import { toast } from 'sonner'
import { useShallow } from 'zustand/shallow'
import { useNavigate } from 'react-router-dom'
import useSWR, { mutate } from 'swr'
import { handleErrorWithToast } from '@/components/ui/shared-toast'
import { useMemo, useState } from 'react'
import { useServiceSessions } from '@/hooks/use-service-sessions'

import { useTranslation } from 'react-i18next'
import { TextShimmer } from '@/components/ui/text-shimmer'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { deduplicateByKey, groupBy } from '@/lib/utils'
import { ChatThread } from '@/types/chat'

type ThreadGroup = {
  label: string
  threads: any[]
}

const MAX_THREADS_COUNT = 40

export function AppSidebarThreads() {
  const mounted = useMounted()
  const navigate = useNavigate()
  const { t } = useTranslation('Layout')
  const [storeMutate, currentThreadId, generatingTitleThreadIds] = appStore(
    useShallow((state) => [
      state.mutate,
      state.currentThreadId,
      state.generatingTitleThreadIds,
    ])
  )
  const [isExpanded, setIsExpanded] = useState(false)

  const IS_SERVICE_MODE = process.env['NEXT_PUBLIC_CHAT_BACKEND'] === 'service'

  // Service mode: fetch session list directly from @vitamin/service
  const { data: serviceSessions, isLoading: serviceLoading } = useServiceSessions()

  const { data: pgThreadList, isLoading: pgLoading } = useSWR(
    IS_SERVICE_MODE ? null : '/api/thread',
    IS_SERVICE_MODE ? null : fetcher,
    {
      onError: handleErrorWithToast,
      fallbackData: [],
      onSuccess: (data) => {
        storeMutate((prev) => {
          const groupById = groupBy(prev.threadList, 'id')

          const generatingTitleThreads = prev.generatingTitleThreadIds
            .map((id) => {
              return groupById[id]?.[0]
            })
            .filter(Boolean) as ChatThread[]
          const list = deduplicateByKey(generatingTitleThreads.concat(data), 'id')
          return {
            threadList: list.map((v) => {
              const target = groupById[v.id]?.[0]
              if (!target) return v
              if (target.title && !v.title)
                return {
                  ...v,
                  title: target.title,
                }
              return v
            }),
          }
        })
      },
    }
  )

  const threadList = IS_SERVICE_MODE ? serviceSessions : pgThreadList
  const isLoading = IS_SERVICE_MODE ? serviceLoading : pgLoading

  // Check if we have 40 or more threads to display "View All" button
  const hasExcessThreads = threadList && threadList.length >= MAX_THREADS_COUNT

  // Use either limited or full thread list based on expanded state
  const displayThreadList = useMemo(() => {
    if (!threadList) return []
    return !isExpanded && hasExcessThreads
      ? threadList.slice(0, MAX_THREADS_COUNT)
      : threadList
  }, [threadList, hasExcessThreads, isExpanded])

  const threadGroupByDate = useMemo(() => {
    if (!displayThreadList || displayThreadList.length === 0) {
      return []
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const lastWeek = new Date(today)
    lastWeek.setDate(lastWeek.getDate() - 7)

    const groups: ThreadGroup[] = [
      { label: t('today'), threads: [] },
      { label: t('yesterday'), threads: [] },
      { label: t('lastWeek'), threads: [] },
      { label: t('older'), threads: [] },
    ]

    displayThreadList.forEach((thread: ChatThread & { lastMessageAt?: number }) => {
      const threadDate =
        (thread.lastMessageAt
          ? new Date(thread.lastMessageAt)
          : new Date(thread.createdAt)) || new Date()
      threadDate.setHours(0, 0, 0, 0)

      if (threadDate.getTime() === today.getTime()) {
        groups[0].threads.push(thread)
      } else if (threadDate.getTime() === yesterday.getTime()) {
        groups[1].threads.push(thread)
      } else if (threadDate.getTime() >= lastWeek.getTime()) {
        groups[2].threads.push(thread)
      } else {
        groups[3].threads.push(thread)
      }
    })

    // Filter out empty groups
    return groups.filter((group) => group.threads.length > 0)
  }, [displayThreadList])

  const handleDeleteAllThreads = async () => {
    await toast.promise(deleteThreadsAction(), {
      loading: t('deletingAllChats'),
      success: () => {
        mutate('/api/thread')
        navigate('/')
        return t('allChatsDeleted')
      },
      error: t('failedToDeleteAllChats'),
    })
  }

  const handleDeleteUnarchivedThreads = async () => {
    await toast.promise(deleteUnarchivedThreadsAction(), {
      loading: t('deletingUnarchivedChats'),
      success: () => {
        mutate('/api/thread')
        navigate('/')
        return t('unarchivedChatsDeleted')
      },
      error: t('failedToDeleteUnarchivedChats'),
    })
  }

  if (isLoading || threadList?.length === 0)
    return (
      <SidebarGroup>
        <SidebarGroupContent className="group-data-[collapsible=icon]:hidden group/threads">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarGroupLabel className="">
                <h4 className="text-xs text-muted-foreground">
                  {t('recentChats')}
                </h4>
              </SidebarGroupLabel>

              {isLoading ? (
                Array.from({ length: 12 }).map(
                  (_, index) => mounted && <SidebarMenuSkeleton key={index} />
                )
              ) : (
                <div className="px-2 py-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t('noConversationsYet')}
                  </p>
                </div>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    )

  return (
    <>
      {threadGroupByDate.map((group, index) => {
        const isFirst = index === 0
        return (
          <SidebarGroup key={group.label}>
            <SidebarGroupContent className="group-data-[collapsible=icon]:hidden group/threads">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarGroupLabel className="">
                    <h4 className="text-xs text-muted-foreground group-hover/threads:text-foreground transition-colors">
                      {group.label}
                    </h4>
                    <div className="flex-1" />
                    {isFirst && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="data-[state=open]:bg-input! opacity-0 data-[state=open]:opacity-100! group-hover/threads:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start">
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={handleDeleteAllThreads}
                          >
                            <Trash />
                            {t('deleteAllChats')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={handleDeleteUnarchivedThreads}
                          >
                            <Trash />
                            {t('deleteUnarchivedChats')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </SidebarGroupLabel>

                  {group.threads.map((thread) => (
                    <SidebarMenuSub
                      key={thread.id}
                      className={'group/thread mr-0'}
                    >
                      <SidebarMenuSubItem>
                        <ThreadDropdown
                          side="right"
                          threadId={thread.id}
                          beforeTitle={thread.title}
                        >
                          <div className="flex items-center data-[state=open]:bg-input! group-hover/thread:bg-input! rounded-lg">
                            <Tooltip delayDuration={1000}>
                              <TooltipTrigger asChild>
                                <SidebarMenuButton
                                  asChild
                                  className="group-hover/thread:bg-transparent!"
                                  isActive={currentThreadId === thread.id}
                                >
                                  <Link
                                    to={`/chat/${thread.id}`}
                                    className="flex items-center"
                                  >
                                    {generatingTitleThreadIds.includes(
                                      thread.id
                                    ) ? (
                                      <TextShimmer className="truncate min-w-0">
                                        {thread.title || 'New Chat'}
                                      </TextShimmer>
                                    ) : (
                                      <p className="truncate min-w-0">
                                        {thread.title || 'New Chat'}
                                      </p>
                                    )}
                                  </Link>
                                </SidebarMenuButton>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[200px] p-4 break-all overflow-y-auto max-h-[200px]">
                                {thread.title || 'New Chat'}
                              </TooltipContent>
                            </Tooltip>

                            <SidebarMenuAction className="data-[state=open]:bg-input data-[state=open]:opacity-100 opacity-0 group-hover/thread:opacity-100">
                              <MoreHorizontal />
                            </SidebarMenuAction>
                          </div>
                        </ThreadDropdown>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  ))}
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )
      })}

      {hasExcessThreads && (
        <SidebarMenu>
          <SidebarMenuItem>
            {/* TODO: Later implement a dedicated search/all chats page instead of this expand functionality */}
            <div className="w-full flex px-4">
              <Button
                variant="secondary"
                size="sm"
                className="w-full hover:bg-input! justify-start"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                <MoreHorizontal className="mr-2" />
                {isExpanded ? t('showLessChats') : t('showAllChats')}
                {isExpanded ? <ChevronUp /> : <ChevronDown />}
              </Button>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      )}
    </>
  )
}
