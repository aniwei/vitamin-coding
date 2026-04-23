import Loading from '@/components/loading'

import * as React from 'react'
import type { FC, PropsWithChildren } from 'react'

const Splash: FC<PropsWithChildren> = () => {
  const [loading, setLoading] = React.useState(false)

  if (loading) {
    return (
      <div className="fixed inset-0 z-9999999 flex h-full items-center justify-center bg-background-body">
        <Loading />
      </div>
    )
  }

  return null
}

Splash.displayName = 'Splash'
export default React.memo(Splash)
