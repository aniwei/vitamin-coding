import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className='flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center'>
      <h1 className='text-3xl font-semibold'>404</h1>
      <p className='text-muted-foreground'>Page not found.</p>
      <Link to='/' className='text-primary underline'>
        Go home
      </Link>
    </div>
  )
}
