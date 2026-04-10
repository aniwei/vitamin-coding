import type { ReactNode } from 'react'
import { parseAsBoolean, useQueryState } from 'nuqs'
import { useCallback, useEffect, useState } from 'react'

interface AppSetupProps {
  children: ReactNode
}

export const AppSetup = ({
  children,
}: AppSetupProps) => {
  const [init, setInit] = useState(true)

  return init ? children : null
}
