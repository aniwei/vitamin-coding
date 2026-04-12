
import Button from '@/components/button'
import Divider from '@/components/divider'
import { memo } from 'react'
import type { FC } from 'react'
import type { OnSend } from './types'

interface TryToAskProps {
  suggestedQuestions: string[]
  onSend: OnSend

}

export const TryToAsk: FC<TryToAskProps> = memo(({
  suggestedQuestions,
  onSend,
}) => {
  return (
    <div className="mb-2 py-2">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <Divider backgroundStyle="gradient" className="h-px w-auto! grow rotate-180" />
        <div className="system-xs-medium-uppercase shrink-0 text-text-tertiary">Try to Ask</div>
        <Divider backgroundStyle="gradient" className="h-px w-auto! grow" />
      </div>
      <div className="flex flex-wrap justify-center">
        {
          suggestedQuestions.map((suggestQuestion, index) => (
            <Button
              size="small"
              key={index}
              variant="secondary-accent"
              className="mb-1 mr-1 last:mr-0"
              onClick={() => onSend(suggestQuestion)}
            >
              {suggestQuestion}
            </Button>
          ))
        }
      </div>
    </div>
  )
})

export default TryToAsk
