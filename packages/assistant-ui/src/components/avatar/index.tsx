
import { Avatar as BaseAvatar } from '@base-ui/react/avatar'
import { clsx } from 'clsx'
import type { ImageLoadingStatus } from '@base-ui/react/avatar'
import type * as React from 'react'

const classes = {
  'xxs': { root: 'size-4', text: 'text-[7px]' },
  'xs': { root: 'size-5', text: 'text-[8px]' },
  'sm': { root: 'size-6', text: 'text-[10px]' },
  'md': { root: 'size-8', text: 'text-xs' },
  'lg': { root: 'size-9', text: 'text-sm' },
  'xl': { root: 'size-10', text: 'text-base' },
  '2xl': { root: 'size-12', text: 'text-xl' },
  '3xl': { root: 'size-16', text: 'text-2xl' },
} as const

export type AvatarSize = keyof typeof classes

type AvatarRootProps = {
  size?: AvatarSize
} & React.ComponentPropsWithRef<typeof BaseAvatar.Root>

export const AvatarRoot: React.FC<AvatarRootProps> = ({
  size = 'md',
  className,
  ...props
}) => {
  return (
    <BaseAvatar.Root
      className={clsx(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-primary-600',
        classes[size].root,
        className,
      )}
      {...props}
    />
  )
}

AvatarRoot.displayName = 'AvatarRoot'

interface AvatarImageProps extends React.ComponentPropsWithRef<typeof BaseAvatar.Image> {}

export const AvatarImage: React.FC<AvatarImageProps> = ({
  className,
  ...props
}) => {
  return (
    <BaseAvatar.Image
      className={clsx('absolute inset-0 size-full object-cover', className)}
      {...props}
    />
  )
}

AvatarImage.displayName = 'AvatarImage'

type AvatarFallbackProps = {
  className?: string
  size?: AvatarSize
  children?: React.ReactNode
}

export const AvatarFallback: React.FC<AvatarFallbackProps> = ({
  size = 'md',
  className,
  ...props
}: AvatarFallbackProps) => {
  return (
    <BaseAvatar.Fallback
      className={clsx(
        'flex size-full items-center justify-center font-medium text-white',
        classes[size].text,
        className,
      )}
      {...props}
    />
  )
}

AvatarFallback.displayName = 'AvatarFallback'

type AvatarProps = {
  name: string
  avatar: string | null
  size?: AvatarSize
  className?: string
  onLoadingStatusChange?: (status: ImageLoadingStatus) => void
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  avatar,
  size = 'md',
  className,
  onLoadingStatusChange,
}) => {
  return (
    <AvatarRoot size={size} className={className}>
      {
        avatar && <AvatarImage
          src={avatar}
          alt={name}
          onLoadingStatusChange={onLoadingStatusChange}
        />
      }
      <AvatarFallback size={size}>{name?.[0]?.toLocaleUpperCase()}</AvatarFallback>
    </AvatarRoot>
  )
}
