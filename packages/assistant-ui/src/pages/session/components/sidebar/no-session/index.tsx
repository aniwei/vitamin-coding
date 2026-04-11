import useTheme from '@/hooks/use-theme'
import { Theme } from '@/types'
import { clsx } from 'clsx'
import * as React from 'react'
import type { FC } from 'react'
import s from './index.module.css'


const NoSession: FC = () => {
  const { theme } = useTheme()
  return (
    <div className="rounded-xl bg-background-default-subtle p-4">
      <div className={clsx('h-[35px] w-[86px] bg-contain bg-center bg-no-repeat', theme === Theme.dark ? s.dark : s.light)}></div>
      <div className="system-sm-semibold mt-2 text-text-secondary">
        No active sessions
      </div>
      <div className="system-xs-regular my-1 text-text-tertiary">There are currently no active sessions available.</div>
      <a className="system-xs-regular text-text-accent" target="_blank" rel="noopener noreferrer" href="">Learn more</a>
    </div>
  )
}
export default React.memo(NoSession)
