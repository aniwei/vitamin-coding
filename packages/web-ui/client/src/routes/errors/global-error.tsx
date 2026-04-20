import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

export function GlobalError() {
  const error = useRouteError()
  const status = isRouteErrorResponse(error) ? error.status : 500
  const statusText = isRouteErrorResponse(error) ? error.statusText : 'Internal Error'
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unexpected error'

  return (
    <div className='flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center'>
      <h1 className='text-3xl font-semibold'>{status}</h1>
      <p className='text-lg'>{statusText}</p>
      <p className='text-muted-foreground text-sm'>{message}</p>
    </div>
  )
}
