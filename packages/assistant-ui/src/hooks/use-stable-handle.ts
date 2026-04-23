import { useCallback, useLayoutEffect, useRef } from 'react'

function shouldNotBeInvokedBeforeMount() {
  throw new Error('foxact: the stablized handler cannot be invoked before the component has mounted.',)
}

export function useStableHandle<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): typeof callback {
  
  const latestRef = useRef<typeof callback>(shouldNotBeInvokedBeforeMount as typeof callback)
  
  useLayoutEffect(() => {
    latestRef.current = callback
  }, [callback])

  return useCallback<typeof callback>((...args) => {
    const callback = latestRef.current
    return callback(...args)
  }, [])
}

