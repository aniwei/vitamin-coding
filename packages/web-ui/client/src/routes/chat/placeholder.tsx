import { useParams } from 'react-router-dom'

export default function ChatThreadPlaceholder() {
  const params = useParams<{ thread: string }>()
  return (
    <div className='p-8'>
      <h2 className='text-xl font-semibold'>Chat Thread (placeholder)</h2>
      <p className='text-muted-foreground mt-2'>thread = {params.thread}</p>
      <p className='text-muted-foreground mt-1 text-sm'>
        页面组件将在 Phase 2 从 src/app/(chat)/chat/[thread]/page.tsx 迁入。
      </p>
    </div>
  )
}
