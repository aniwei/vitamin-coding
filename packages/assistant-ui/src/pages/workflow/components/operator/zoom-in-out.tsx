import Divider from '@/components/divider'
import ShortcutsName from '@/components/shortcuts-name'
import TipPopup from './tip-popup'
import { RiZoomInLine, RiZoomOutLine } from '@remixicon/react'
import { Fragment, memo, useCallback, useMemo, useState,} from 'react'
import { useReactFlow, useViewport,} from 'reactflow'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { clsx } from 'clsx'
import type { FC } from 'react'

enum ZoomType {
  zoomIn = 'zoomIn',
  zoomOut = 'zoomOut',
  zoomToFit = 'zoomToFit',
  zoomTo25 = 'zoomTo25',
  zoomTo50 = 'zoomTo50',
  zoomTo75 = 'zoomTo75',
  zoomTo100 = 'zoomTo100',
  zoomTo200 = 'zoomTo200',
}

const ZoomOut: FC = () => {
  const { zoomOut } = useReactFlow()
  const { zoom } = useViewport()
  const onZoomOut = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (zoom <= 0.25) {
      return 
    }
      
    e.stopPropagation()
    zoomOut()
  }, [])

  return <TipPopup title="Zoom Out" shortcuts={['ctrl', '-']}>
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-lg ${zoom <= 0.25 ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-black/5'}`}
      onClick={onZoomOut}
    >
      <RiZoomOutLine className="h-4 w-4 text-text-tertiary hover:text-text-secondary" />
    </div>
  </TipPopup>
}

const ZoomIn: FC = () => {
  const { zoomIn } = useReactFlow()
  const { zoom } = useViewport()
  const onZoomIn = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (zoom >= 2) {
      return 
    }
      
    e.stopPropagation()
    zoomIn()
  }, [])

  return <TipPopup
    title="Zoom In"
    shortcuts={['ctrl', '+']}
  >
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-lg ${zoom >= 2 ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-black/5'}`}
      onClick={onZoomIn}
    >
      <RiZoomInLine className="h-4 w-4 text-text-tertiary hover:text-text-secondary" />
    </div>
  </TipPopup>
}

const Options: FC<{ 
  onZoom: (type: ZoomType) => void
  showDivider: boolean, 
  data: { key: ZoomType, text: string }[] 
}> = ({ data, showDivider, onZoom }) => {
  return <Fragment>
    { showDivider && <Divider className="m-0" /> }
    <div className="p-1">
      {
        data.map(({ key, text }) => (
          <div
            key={key}
            className="system-md-regular flex h-8 cursor-pointer items-center justify-between space-x-1 rounded-lg py-1.5 pl-3 pr-2 text-text-secondary hover:bg-state-base-hover"
            onClick={() => onZoom(key)}
          >
            <span>{text}</span>
            <div className="flex items-center space-x-0.5">
              { key === ZoomType.zoomToFit && <ShortcutsName keys={['ctrl', '1']} /> }
              { key === ZoomType.zoomTo50 && <ShortcutsName keys={['shift', '5']} /> }
              { key === ZoomType.zoomTo100 && <ShortcutsName keys={['shift', '1']} /> }
            </div>
          </div>
        ))
      }
    </div>
  </Fragment>
}

const ZoomInOut: FC = memo(() => {
  const {
    zoomIn,
    zoomOut,
    zoomTo,
    fitView,
  } = useReactFlow()
  const { zoom } = useViewport()
  const [open, setOpen] = useState(false)

  const onZoom = (type: ZoomType) => {
    switch (type) {
      case ZoomType.zoomIn:
        zoomIn()
        break
      case ZoomType.zoomOut:
        zoomOut()
        break
      case ZoomType.zoomToFit:
        fitView()
        break
      case ZoomType.zoomTo25:
        zoomTo(0.25)
        break
      case ZoomType.zoomTo50:
        zoomTo(0.5)
        break
      case ZoomType.zoomTo75:
        zoomTo(0.75)
        break
      case ZoomType.zoomTo100:
        zoomTo(1)
        break
      case ZoomType.zoomTo200:
        zoomTo(2)
        break
    }
  }

  const options = useMemo(() => {
    return [
      [
        { key: ZoomType.zoomTo200, text: '200%' },
        { key: ZoomType.zoomTo100, text: '100%' },
        { key: ZoomType.zoomTo75, text: '75%' },
        { key: ZoomType.zoomTo50, text: '50%' },
        { key: ZoomType.zoomTo25, text: '25%' }
      ],
      [
        { key: ZoomType.zoomToFit, text: 'Zoom to Fit' }
      ],
    ]
  }, [])

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger
        render={(
          <div
            className={clsx(
              'h-9 cursor-pointer rounded-lg border-[0.5px] border-components-actionbar-border bg-components-actionbar-bg',
              'p-0.5 text-[13px] shadow-lg backdrop-blur-[5px]',
              'hover:bg-state-base-hover',
            )}
          >
            <div className={clsx('flex h-8 w-[98px] items-center justify-between rounded-lg')}
            >
              <ZoomOut />
              <div className={clsx('system-sm-medium w-[34px] text-text-tertiary hover:text-text-secondary')}>
                {Number.parseFloat(`${zoom * 100}`).toFixed(0)}%
              </div>
              <ZoomIn />
            </div>
          </div>
        )}
      />
      <PopoverContent
        placement="top-start"
        sideOffset={4}
        alignOffset={-2}
        className="z-10"
        popupClassName="border-none bg-transparent p-0 shadow-none"
      >
        <div className="w-[145px] rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-bg-blur shadow-lg backdrop-blur-[5px]">
          {
            options.map((options, i) => <Options 
              data={options} 
              showDivider={i !== 0} 
              onZoom={onZoom} 
            />)
          }
        </div>
      </PopoverContent>
    </Popover>
  )
})

export default ZoomInOut
