'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, CircleDot } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from 'ui/dialog'
import { Button } from 'ui/button'
import { Checkbox } from 'ui/checkbox'
import { ScrollArea } from 'ui/scroll-area'
import { Badge } from 'ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  useBreakpointStore,
  BREAKPOINT_CATEGORY_LABELS,
  CATEGORY_ORDER,
  type Breakpoint,
  type BreakpointCategory,
} from '@/app/store/breakpoint.store'

function CategoryGroup({
  category,
  items,
}: {
  category: BreakpointCategory
  items: Breakpoint[]
}) {
  const [expanded, setExpanded] = useState(true)
  const toggle = useBreakpointStore((s) => s.toggle)
  const enableCategory = useBreakpointStore((s) => s.enableCategory)
  const disableCategory = useBreakpointStore((s) => s.disableCategory)

  const enabledCount = items.filter((b) => b.enabled).length
  const allEnabled = enabledCount === items.length
  const someEnabled = enabledCount > 0 && !allEnabled

  const handleGroupCheck = () => {
    if (allEnabled) {
      disableCategory(category)
    } else {
      enableCategory(category)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 px-4 py-2 hover:bg-muted/50 transition-colors">
        <Checkbox
          checked={allEnabled ? true : someEnabled ? 'indeterminate' : false}
          onCheckedChange={handleGroupCheck}
          className="size-3.5"
        />
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 flex-1 text-left"
        >
          {expanded ? (
            <ChevronDown className="size-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground shrink-0" />
          )}
          <span className="text-xs font-medium text-foreground flex-1">
            {BREAKPOINT_CATEGORY_LABELS[category]}
          </span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 tabular-nums">
            {enabledCount}/{items.length}
          </Badge>
        </button>
      </div>

      {expanded && (
        <div className="ml-8 pb-1">
          {items.map((bp) => (
            <label
              key={bp.point}
              className="flex items-center gap-2.5 px-4 py-1 cursor-pointer hover:bg-muted/40 transition-colors rounded-sm"
            >
              <Checkbox
                checked={bp.enabled}
                onCheckedChange={() => toggle(bp.point)}
                className="size-3.5"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-foreground">{bp.name}</div>
                <div className="text-[10px] font-mono text-muted-foreground truncate">
                  {bp.point}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export interface BreakpointDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BreakpointDialog({ open, onOpenChange }: BreakpointDialogProps) {
  const breakpoints = useBreakpointStore((s) => s.breakpoints)
  const enableAll = useBreakpointStore((s) => s.enableAll)
  const disableAll = useBreakpointStore((s) => s.disableAll)

  const totalEnabled = breakpoints.filter((b) => b.enabled).length

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: breakpoints.filter((b) => b.category === category),
  })).filter((g) => g.items.length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 w-[400px] max-w-[90vw] overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-2">
            <CircleDot className="size-4 text-amber-500" />
            <DialogTitle className="text-base">断点管理</DialogTitle>
            {totalEnabled > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs tabular-nums">
                {totalEnabled} 个已启用
              </Badge>
            )}
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            选择在调试运行时暂停的断点位置
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="flex items-center gap-2 px-4 py-2 bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={enableAll}
          >
            全部启用
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={disableAll}
          >
            全部禁用
          </Button>
        </div>

        <Separator />

        <ScrollArea className="h-[360px]">
          <div className="py-2">
            {groups.map((g, i) => (
              <div key={g.category}>
                <CategoryGroup category={g.category} items={g.items} />
                {i < groups.length - 1 && <Separator className="my-1 mx-4 w-auto" />}
              </div>
            ))}
          </div>
        </ScrollArea>

        <Separator />

        <div className="px-4 py-3 flex justify-end">
          <Button size="sm" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
