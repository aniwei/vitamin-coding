import Loading from '../loading'

import * as React from 'react'
import type { FC, PropsWithChildren } from 'react'

const Splash: FC<PropsWithChildren> = () => {
  const [isLoading, setIsLoading] = React.useState(false)

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-9999999 flex h-full items-center justify-center bg-background-body">
        <Loading />
      </div>
    )
  }

  return null
}

export default React.memo(Splash)
