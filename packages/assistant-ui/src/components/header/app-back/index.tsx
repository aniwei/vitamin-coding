import clsx from 'clsx'
import { ArrowLeftIcon, Squares2X2Icon } from '@heroicons/react/24/solid'
import { useState } from 'react'
import * as React from 'react'
import type { AppDetailResponse } from '@/models/app'

type IAppBackProps = {
  curApp: AppDetailResponse
}
export default function AppBack({ curApp }: IAppBackProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={clsx(`
        flex h-7 cursor-pointer items-center radius-lg
        pl-2.5 pr-2 font-semibold
        text-[#1C64F2]
        ${curApp && 'hover:bg-[#EBF5FF]'}
      `)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {
        (hovered && curApp)
          ? <ArrowLeftIcon className="mr-1 h-[18px] w-[18px]" />
          : <Squares2X2Icon className="mr-1 h-[18px] w-[18px]" />
      }
      Menus
      {t('menus.apps', { ns: 'common' })}
    </div>
  )
}
