import data from '@emoji-mart/data'
import { init } from 'emoji-mart'
import { memo, type FC } from 'react'

init({ data })

interface AnswerIconProps {
  icon?: string | null
  background?: string | null
  imageUrl?: string | null
}

export const AnswerIcon: FC<AnswerIconProps> = memo(({
  icon,
  background
}) => {
  return (
    <div
      className="flex items-center justify-center w-full h-full rounded-full border-[0.5px] border-black/5 text-xl"
      style={{ background: background || '#D5F5F6' }}
    >
      {
        (icon && icon !== '') ? <em-emoji id={icon} /> : <em-emoji id="🤖" />
      }
    </div>
  )
})

export default AnswerIcon
