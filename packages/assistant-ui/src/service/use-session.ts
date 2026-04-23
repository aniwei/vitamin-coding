import { 
  useMutation, 
  useQuery, 
  useQueryClient 
} from '@tanstack/react-query'

import type { Session } from '../types'
import { session } from './session'

interface SessionList extends Array<Session> {}

export const useSessionList = () => {
  return useQuery<SessionList>({
    queryKey: ['sessionList'],
    queryFn: async () => {
      return await session.list()
    },
  })
}

