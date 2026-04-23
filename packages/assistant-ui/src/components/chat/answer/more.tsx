import { memo } from 'react'
import type { FC } from 'react'
import type { ChatItem } from '../types'

type MoreProps = {
  more: ChatItem['more']
}

export const More: FC<MoreProps> = memo(({
  more,
}) => {

  return (
    <div
      className="mt-1 flex items-center text-text-quaternary opacity-0 system-xs-regular group-hover:opacity-100"
    >
      {
        more && <>
          <div
            className="mr-2 max-w-[25%] shrink-0 truncate"
            title={`Time Consuming ${more.latency} seconds`}
          >{`Time Consuming ${more.latency} seconds`}</div>
          <div
            className="mr-2 max-w-[25%] shrink-0 truncate"
          >
          </div>
          {
            !!more.tokens_per_second &&  <div
              className="mr-2 max-w-[25%] shrink-0 truncate"
              title={`${more.tokens_per_second} tokens/s`}
            >
              {`${more.tokens_per_second} tokens/s`}
            </div>
          }
          <div className="mx-2 shrink-0">·</div>
          <div
            className="max-w-[25%] shrink-0 truncate"
            title={more.time}
          >{more.time}</div>
        </>
      }
    </div>
  )
})

More.displayName = 'More'
export default More
