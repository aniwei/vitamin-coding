// import ProgressTooltip from './progress-tooltip'
import Tooltip from './tooltip'
import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import type { FC, MouseEvent } from 'react'
import type { Resources } from './index'


type PopupProps = {
  data: Resources
  showHitInfo?: boolean
}

const Popup: FC<PopupProps> = ({
  data,
  showHitInfo = false,
}) => {
  const [open, setOpen] = useState(false)
  const fileType = data.dataSourceType !== 'notion'
    ? (/\.([^.]*)$/.exec(data.documentName)?.[1] || '')
    : 'notion'

  const handleDownloadUploadFile = async (e: MouseEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()    
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger
        render={(
          <div data-testid="popup-trigger" className="flex h-7 max-w-[240px] items-center rounded-lg bg-components-button-secondary-bg px-2">
            <div className="truncate text-xs text-text-tertiary">{data.documentName}</div>
          </div>
        )}
      />
      <PopoverContent
        placement="top-start"
        sideOffset={8}
        alignOffset={-2}
        className="z-1000"
        popupClassName="border-none bg-transparent p-0 shadow-none"
      >
        <div data-testid="popup-content" className="max-w-[360px] rounded-xl bg-background-section-burn shadow-lg backdrop-blur-[5px]">
          <div className="px-4 pb-2 pt-3">
            <div className="flex h-[18px] items-center">
              <div className="truncate text-text-tertiary system-xs-medium">
                {(data.dataSourceType === 'upload_file' || data.dataSourceType === 'file') && !!data.sources?.[0]?.dataset_id
                  ? (
                      <button
                        data-testid="popup-download-btn"
                        type="button"
                        className="cursor-pointer truncate text-text-tertiary hover:underline"
                        onClick={handleDownloadUploadFile}
                        disabled
                      >
                        {data.documentName}
                      </button>
                    )
                  : data.documentName}
              </div>
            </div>
          </div>
          <div className="max-h-[450px] overflow-y-auto rounded-lg bg-components-panel-bg px-4 py-0.5">
            <div className="w-full">
              {
                data.sources.map((source, index) => {
                  const itemKey = source.document_id
                    ? `${source.document_id}-${source.segment_position ?? index}`
                    : source.index_node_hash ?? `${data.documentId ?? 'doc'}-${index}`

                  return (
                    <Fragment key={itemKey}>
                      <div data-testid="popup-source-item" className="group py-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex h-5 items-center rounded-md border border-divider-subtle px-1.5">
                            {/* replaced svg component with tailwind icon class per lint rule */}
                            <i className="i-custom-vender-line-general-hash-02 mr-0.5 h-3 w-3 text-text-quaternary" aria-hidden />
                            <div data-testid="popup-segment-position" className="text-[11px] font-medium text-text-tertiary">
                              {source.segment_position || index + 1}
                            </div>
                          </div>
                          {
                            showHitInfo && (
                              <Link
                                to={`/datasets/${source.dataset_id}/documents/${source.document_id}`}
                                className="hidden h-[18px] items-center text-xs text-text-accent group-hover:flex"
                              >
                                Link to Dataset
                                <i className="i-custom-vender-line-arrows-arrow-up-right ml-1 h-3 w-3" aria-hidden />
                              </Link>
                            )
                          }
                        </div>
                        <div data-testid="popup-source-content" className="wrap-break-word text-[13px] text-text-secondary">{source.content}</div>
                        {
                          showHitInfo && (
                            <div data-testid="popup-hit-info" className="mt-2 flex flex-wrap items-center text-text-quaternary system-xs-medium">
                              <Tooltip
                                text="Characters"
                                data={source.word_count}
                                icon={<i className="i-custom-vender-line-editor-type-square mr-1 h-3 w-3" aria-hidden />}
                              />
                              <Tooltip
                                text="Tokens"
                                data={source.hit_count}
                                icon={<i className="i-custom-vender-line-general-target-04 mr-1 h-3 w-3" aria-hidden />}
                              />
                              <Tooltip
                                text="Vector Hash"
                                data={source.index_node_hash?.substring(0, 7)}
                                icon={<i className="i-custom-vender-line-editor-bezier-curve-03 mr-1 h-3 w-3" aria-hidden />}
                              />
                              {/* {
                                !!source.score && <ProgressTooltip data={Number(source.score.toFixed(2))} />
                              } */}
                            </div>
                          )
                        }
                      </div>
                      {
                        index !== data.sources.length - 1 && (
                          <div data-testid="popup-source-divider" className="my-1 h-px bg-divider-regular" />
                        )
                      }
                    </Fragment>
                  )
                })
              }
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default Popup
