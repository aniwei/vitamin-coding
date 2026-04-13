import ActionButton from '@/components/action-button'
import { clsx } from 'clsx'
import * as React from 'react'

import s from './index.module.css'

interface SVGButtonProps {
  isSVG: boolean
  setIsSVG: React.Dispatch<React.SetStateAction<boolean>>
}

const SVGButton: React.FC<SVGButtonProps> = ({
  isSVG,
  setIsSVG,
}) => {
  return (
    <ActionButton onClick={() => { setIsSVG(prevIsSVG => !prevIsSVG) }}>
      <div className={clsx('h-4 w-4', isSVG ? s.svgIconed : s.svgIcon)}></div>
    </ActionButton>
  )
}

export default SVGButton
