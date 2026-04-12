import { clsx } from 'clsx'
import * as React from 'react'
import type { FC } from 'react'
import s from './index.module.css'

interface LoadingAnimProps {
  type: 'text' | 'avatar'
}

const LoadingAnimation: FC<LoadingAnimProps> = React.memo(({
  type,
}) => {
  return <div className={clsx(s['dot-flashing'], s[type])} />
})
export default LoadingAnimation
