

import { getStorageManager } from "@/lib/browser-stroage"
import { isFunction } from "@/lib/utils"
import { Dispatch, SetStateAction, useCallback, useMemo, useState } from 'react'

export const useStateWithBrowserStorage = <T>(
  key: string,
  fallbackValue?: T
) => {
  const storage = useMemo(() => getStorageManager<T>(key), [key])
  const [state, _setState] = useState<T>(storage.get(fallbackValue!))

  const setState = useCallback<Dispatch<SetStateAction<T>>>(
    (value) => {
      const nextValue = isFunction(value) ? (value as (prev: T) => T)(state) : (value as T)
      storage.set(nextValue)
      _setState(nextValue)
    },
    [state]
  )

  return [state, setState] as const
}
