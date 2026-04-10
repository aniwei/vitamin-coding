import Loading from '@/components/loading'
import { type FC, type PropsWithChildren } from 'react'
import type { SystemFeatures } from '@/types'


const GlobalContextProvider: FC<PropsWithChildren> = ({
  children,
}) => {
  // TODO
  const isPending = false

  if (isPending) {
    return <div className="flex h-screen w-screen items-center justify-center">
      <Loading />
    </div>
  }

  return <>{children}</>
}
export default GlobalContextProvider
