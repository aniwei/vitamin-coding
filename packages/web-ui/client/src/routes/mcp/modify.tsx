import { useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import useSWR from 'swr'
import MCPEditor from '@/components/mcp-editor'
import { Alert } from 'ui/alert'
import { ArrowLeft } from 'lucide-react'
import { useTranslations } from '@/hooks/use-translations'
import { fetcher } from 'lib/utils'

export default function McpModifyPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const t = useTranslations()
  const { data: mcpClient, error } = useSWR(id ? `/api/mcp/${id}` : null, fetcher)

  useEffect(() => {
    if (error) navigate('/mcp', { replace: true })
  }, [error, navigate])

  if (!id || (!mcpClient && !error)) return null

  return (
    <div className='container max-w-3xl mx-4 md:mx-auto py-8'>
      <div className='flex flex-col gap-2'>
        <Link
          to='/mcp'
          className='flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground transition-colors mb-8'
        >
          <ArrowLeft className='size-3' />
          {t('Common.back')}
        </Link>
        <header>
          <h2 className='text-3xl font-semibold my-2'>{t('MCP.mcpConfiguration')}</h2>
          <p className='text text-muted-foreground'>
            {t('MCP.configureYourMcpServerConnectionSettings')}
          </p>
        </header>
        <main className='my-8'>
          {mcpClient ? (
            <MCPEditor
              initialConfig={mcpClient.config}
              name={mcpClient.name}
              id={mcpClient.id}
            />
          ) : (
            <Alert variant='destructive'>MCP client not found</Alert>
          )}
        </main>
      </div>
    </div>
  )
}
