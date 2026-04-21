import { useParams } from 'react-router-dom'
import useSWR from 'swr'
import ChatPreview from '@/components/export/chat-preview'
import ExportError from '@/components/export/error'
import { fetcher } from 'lib/utils'

export default function ExportPage() {
  const { id } = useParams<{ id: string }>()
  const { data, error } = useSWR(id ? `/api/export/${id}` : null, fetcher)

  if (!id) return null
  if (!data && !error) return null

  if (error || !data || data.error) {
    const message = data?.error || 'This export does not exist'
    return <ExportError message={message} />
  }

  return <ChatPreview thread={data.thread} comments={data.comments ?? []} />
}
