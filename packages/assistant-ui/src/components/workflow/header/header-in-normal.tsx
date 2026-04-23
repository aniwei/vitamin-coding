import type { ControlsProps } from './controls'
import {
  useCallback,
} from 'react'
import Env from './env'
// import GlobalVariableButton from './global-variable-button'
import Controls from './controls'
import Point from './point'
// import VersionHistoryButton from './version-history-button'

export type HeaderInNormalProps = {
  controlsProps?: ControlsProps
}
const HeaderInNormal: React.FC<HeaderInNormalProps> = ({
  controlsProps,
}) => {
  const onStartRestoring = useCallback(() => {
    
  }, [])

  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center gap-2">
        <Controls {...controlsProps} />
        <div className="shrink-0 cursor-pointer rounded-lg border-[0.5px] border-components-button-secondary-border bg-components-button-secondary-bg shadow-xs backdrop-blur-[10px]">
          <Env disabled />
          <Point disabled />
        </div>
        {/* <VersionHistoryButton onClick={onStartRestoring} /> */}
      </div>
    </div>
  )
}

export default HeaderInNormal
