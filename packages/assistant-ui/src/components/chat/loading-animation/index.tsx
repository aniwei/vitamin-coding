import { clsx } from 'clsx'
import * as React from 'react'
import type { FC } from 'react'

import s from './index.module.css'

type LoadingAnimationProps = {
  type: 'text' | 'avatar'
}

export const LoadingAnimation: FC<LoadingAnimationProps> = React.memo(({
  type,
}) => {
  return <div className={clsx(s.dotFlashing, s[type])} />
})

export default LoadingAnimation
