import * as React from 'react'
import type { FC } from 'react'

interface SpinnerProps {
  loading?: boolean
  className?: string
  children?: React.ReactNode | string
}

export const Spinner: FC<SpinnerProps> = ({ 
  loading = false, 
  children, 
  className 
}) => {
  return (
    <div
      className={`inline-block h-4 w-4 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] text-gray-200 ${loading ? 'motion-reduce:animate-[spin_1.5s_linear_infinite]' : 'hidden'} ${className ?? ''}`}
      role="status"
    >
      <span
        className="absolute! -m-px! h-px! w-px! overflow-hidden! whitespace-nowrap! border-0! p-0! [clip:rect(0,0,0,0)]!"
      >Loading...</span>
      {children}
    </div>
  )
}

Spinner.displayName = 'Spinner'
export default Spinner
