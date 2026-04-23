import { clsx } from 'clsx'
import { getRelativeTime, isRelativeTimeSameOrAfter } from './utils'

type ExpirationTimeProps = {
  expirationTime: number
}

export const ExpirationTime: React.FC<ExpirationTimeProps> = ({
  expirationTime,
}) => {
  const relativeTime = getRelativeTime(expirationTime)
  const isSameOrAfter = isRelativeTimeSameOrAfter(expirationTime)

  return (
    <div
      className={clsx(
        'mt-1 flex items-center gap-x-1 text-text-tertiary system-xs-regular',
        !isSameOrAfter && 'text-text-warning',
      )}
    >
      {
        isSameOrAfter
          ? <>
            <div className="i-ri-time-line size-3.5" />
            <span>Expiration time now or future</span>
          </>
          : <>
            <div className="i-ri-alert-fill size-3.5" />
            <span>Expired</span>
          </>
      }
    </div>
  )
}

ExpirationTime.displayName = 'ExpirationTime'
export default ExpirationTime
