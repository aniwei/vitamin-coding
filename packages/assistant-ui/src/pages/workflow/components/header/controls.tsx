// import type { ViewHistoryProps } from './view-history'
import {
  RiArrowDownBoxFill,
  RiArrowDownFill,
  RiArrowDownLongFill,
  RiArrowDownWideFill,
  RiArrowUpLongFill,
  RiPauseLargeFill,
  RiPlayLargeFill,
  RiStopLargeFill,
} from '@remixicon/react'
import React, { memo } from 'react'
import { clsx } from 'clsx'

import Checklist from './checklist'
import RunMode from './run-mode'
import ViewHistory from './view-history'

interface ControlProps {
  icon: React.ReactNode
}

const Control: React.FC<ControlProps> = ({ icon }) => {
  return (
    <div
      className="flex h-7 items-center rounded-md px-2.5 text-[13px] font-medium text-components-button-secondary-accent-text cursor-pointer hover:bg-state-accent-hover"
      onClick={() => {}}
    >
      {icon}
    </div>
  )
}

const Divider = () => <div className="mx-0.5 h-4 w-[1px] bg-components-button-secondary-border" />

export interface ControlsProps {
  showRunButton?: boolean
  runButtonText?: string
  isRunning?: boolean
  showPreviewButton?: boolean
  viewHistoryProps?: ViewHistoryProps
}
const Controls: React.FC<ControlsProps> = memo(({
  showRunButton,
  runButtonText,
  showPreviewButton,
  viewHistoryProps,
}) => {
  return (
    <div className="flex h-8 items-center rounded-lg border-[0.5px] border-components-button-secondary-border bg-components-button-secondary-bg px-0.5 shadow-xs">
      {/* {
        showRunButton && (
          CustomRunMode ? <CustomRunMode text={runButtonText} /> : <RunMode text={runButtonText} />
        )
      } */}
      <Control icon={<RiPauseLargeFill className="h-4 w-4" />} />
      <Control icon={<RiPlayLargeFill className="h-4 w-4" />} />
      <Control icon={<RiStopLargeFill className="h-4 w-4" />} />

      
      
      {/* <ViewHistory {...viewHistoryProps} /> */}
      {/* <Checklist disabled /> */}
    </div>
  )
})

export default Controls
