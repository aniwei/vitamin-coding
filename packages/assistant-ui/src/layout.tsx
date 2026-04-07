import { Provider as JotaiProvider } from 'jotai/react'


const LocaleLayout = async ({
  children,
}: {
  children: React.ReactNode
}) => {
  

  return (
    <div className="isolate h-full">
      <JotaiProvider>
        
      </JotaiProvider>
    </div>
  )
}

export default LocaleLayout
