import { cva } from 'class-variance-authority'
import { clsx } from 'clsx'
import type { SwitchSize } from './index'
const sv = cva('bg-text-quaternary opacity-20', {
  variants: {
    size: {
      xs: 'h-2.5 w-3.5 radius-2xs',
      sm: 'h-3 w-5 rounded-[3.5px]',
      md: 'h-4 w-7 rounded-[5px]',
      lg: 'h-5 w-9 radius-sm',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

interface SwitchSkeletonProps {
  size?: SwitchSize
  className?: string
}

export function SwitchSkeleton({
  size = 'md',
  className,
}: SwitchSkeletonProps) {
  return (
    <div
      className={clsx(sv({ size }), className)}
    />
  )
}

SwitchSkeleton.displayName = 'SwitchSkeleton'
export default SwitchSkeleton
