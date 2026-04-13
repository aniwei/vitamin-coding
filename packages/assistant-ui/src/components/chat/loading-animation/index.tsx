import { clsx } from 'clsx'
import * as React from 'react'
import type { FC } from 'react'

import s from './index.module.css'

interface LoadingAnimationProps {
  type: 'text' | 'avatar'
}

export const LoadingAnimation: FC<LoadingAnimationProps> = React.memo(({
  type,
}) => {
  return <div className={clsx(s['dot-flashing'], s[type])} />
})

export default LoadingAnimation
