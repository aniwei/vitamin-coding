import { 
  createContext, 
  useContext, 
  useContextSelector 
} from 'use-context-selector'

export type AppContextValue = {
 
}

export const AppContext = createContext<AppContextValue>({
  
})

export function useSelector<T>(selector: (value: AppContextValue) => T): T {
  return useContextSelector(AppContext, selector)
}

export const useAppContext = () => useContext(AppContext)
