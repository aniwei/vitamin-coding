import ReactEcharts from 'echarts-for-react'
import ActionButton from '@/components/action-button'
import CopyIcon from '@/components/copy-icon'
import ErrorBoundary from '@/components/error-boundary'
import SVGButton from '@/components/svg-button'
import useTheme from '@/hooks/use-theme'
import SVGGallery from '@/components/svg-gallery'
import Music from './music'
import { 
  lazy, 
  memo, 
  useCallback, 
  useEffect, 
  useLayoutEffect, 
  useMemo, 
  useRef, 
  useState 
} from 'react'
import { highlight } from './shiki-highlight'
import { Theme } from '@/types'
import { debounce } from 'es-toolkit/compat'
import type { JSX } from 'react'
import type { BundledLanguage, BundledTheme } from 'shiki/bundle/web'

const Mermaid = lazy(() => import('@/components/mermaid'))

const DEBOUNCE_MS = 200
const MAX_FINISHED_EVENTS = 3

const ECHARTS_STYLE: React.CSSProperties = { height: '350px', width: '100%' }
const ECHARTS_OPTS = { renderer: 'canvas', width: 'auto' } as const
const ECHARTS_ERROR_OPTION = { title: { text: 'ECharts error - Wrong option.' } }

const capitalizationLanguageNames: Record<string, string> = {
  sql: 'SQL',
  javascript: 'JavaScript',
  java: 'Java',
  typescript: 'TypeScript',
  vbscript: 'VBScript',
  css: 'CSS',
  html: 'HTML',
  xml: 'XML',
  php: 'PHP',
  python: 'Python',
  yaml: 'Yaml',
  mermaid: 'Mermaid',
  markdown: 'MarkDown',
  makefile: 'MakeFile',
  echarts: 'ECharts',
  shell: 'Shell',
  powershell: 'PowerShell',
  json: 'JSON',
  latex: 'Latex',
  svg: 'SVG',
  abc: 'ABC',
}

const getCorrectCapitalizationLanguageName = (language: string) => {
  if (!language) {
    return 'Plain'
  }

  return capitalizationLanguageNames[language]
    ?? language.charAt(0).toUpperCase() + language.substring(1)
}

// ─── Utilities ───────────────────────────────────────────────────────

function isJsonStructureBalanced(str: string, open: string, close: string): boolean {
  return str.startsWith(open) && str.endsWith(close)
    && str.split(open).length === str.split(close).length
}

function isJsonComplete(str: string): boolean {
  return isJsonStructureBalanced(str, '{', '}') || isJsonStructureBalanced(str, '[', ']')
}

function isJsonIncomplete(str: string): boolean {
  if (str.length < 5) {
    return true
  }

  if (str.startsWith('{') && (!str.endsWith('}') || str.split('{').length !== str.split('}').length)) {
    return true
  }

  if (str.startsWith('[') && (!str.endsWith(']') || str.split('[').length !== str.split(']').length)) {
    return true
  }

  if (str.split('"').length % 2 !== 1) {
    return true
  }

  if (str.includes('{"') && !str.includes('"}')) {
    return true
  }

  return false
}

function tryParseJsonObject(str: string): object | null {
  try {
    const parsed = JSON.parse(str)
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  }
  catch {
    return null
  }
}

// ─── Hooks ───────────────────────────────────────────────────────────

type ChartState = 'loading' | 'success' | 'error'

function useTimerCleanup() {
  const clearTimer = useCallback((ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
    if (ref.current) {
      clearTimeout(ref.current)
      ref.current = null
    }
  }, [])
  return clearTimer
}

function useCharts(language: string | undefined, children: React.ReactNode) {
  const [chartState, setChartState] = useState<ChartState>('loading')
  const [chartOption, setChartOption] = useState<any>(null)

  const contentRef = useRef('')
  const processedRef = useRef(false)
  const chartInstanceRef = useRef<any>(null)
  const chartReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finishedCountRef = useRef(0)
  const isInitialRenderRef = useRef(true)
  const echartsRef = useRef<any>(null)

  const clearTimer = useTimerCleanup()

  const debouncedResize = useRef(debounce(() => { 
    chartInstanceRef.current?.resize() 
  }, DEBOUNCE_MS)).current

  const handleChartReady = useCallback((instance: any) => {
    chartInstanceRef.current = instance
    clearTimer(chartReadyTimerRef)
    chartReadyTimerRef.current = setTimeout(() => {
      chartInstanceRef.current?.resize()
      chartReadyTimerRef.current = null
    }, DEBOUNCE_MS)
  }, [clearTimer])

  const echartsEvents = useMemo(() => ({
    finished: () => {
      finishedCountRef.current++
      if (finishedCountRef.current <= MAX_FINISHED_EVENTS && chartInstanceRef.current) {
        debouncedResize()
      }
    },  // debouncedResize is stable (useRef), dep is for readability
  }), [debouncedResize])

  const handleRef = useCallback((e: any) => {
    if (e && isInitialRenderRef.current) {
      echartsRef.current = e
      isInitialRenderRef.current = false
    }
  }, [])

  const resetFinishedCount = useCallback(() => {
    finishedCountRef.current = 0
  }, [])

  // Window resize listener
  useEffect(() => {
    if (language !== 'echarts' || !chartInstanceRef.current) {
      return
    }

    const handleResize = () => {
      if (chartInstanceRef.current) {
        debouncedResize()
      }
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      debouncedResize.cancel()
      clearTimer(chartReadyTimerRef)
      chartInstanceRef.current = null
    }
  }, [language, debouncedResize, clearTimer])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedResize.cancel()
      clearTimer(chartReadyTimerRef)
      chartInstanceRef.current = null
      echartsRef.current = null
    }
  }, [clearTimer, debouncedResize])

  // Parse chart content (streaming or complete)
  useEffect(() => {
    if (language !== 'echarts') {
      return
    }

    if (!contentRef.current) {
      setChartState('loading')
      processedRef.current = false
    }

    const newContent = String(children).replace(/\n$/, '')
    if (contentRef.current === newContent) {
      return
    }

    contentRef.current = newContent

    const trimmed = newContent.trim()
    if (!trimmed) {
      return
    }

    if (processedRef.current) {
      return
    }

    const shouldTryParse = isJsonComplete(trimmed) || !isJsonIncomplete(trimmed)
    if (!shouldTryParse) {
      return
    }

    const parsed = tryParseJsonObject(trimmed)
    if (parsed) {
      setChartOption(parsed)
      setChartState('success')
    } else {
      setChartState('error')
    }
    processedRef.current = true
  }, [language, children])

  return {
    chartState,
    chartOption,
    echartsRef,
    echartsEvents,
    handleChartReady,
    handleRef,
    resetFinishedCount,
  }
}

interface ShikiCodeProps {
  code: string
  language: string
  theme: BundledTheme
  initial?: JSX.Element
}

const ShikiCode: React.FC<ShikiCodeProps> = memo(({ code, language, theme, initial }) => {
  const [nodes, setNodes] = useState(initial)

  useLayoutEffect(() => {
    let cancelled = false

    highlight({
      code,
      language: language as BundledLanguage,
      theme,
    }).then((result) => {
      if (!cancelled) {
        setNodes(result)
      }
    }).catch((error) => {
      console.error('Shiki highlighting failed:', error)
      if (!cancelled) {
        setNodes(undefined)
      }
    })

    return () => { cancelled = true }
  }, [code, language, theme])

  if (!nodes) {
    return (
      <pre style={{
        paddingLeft: 12,
        borderBottomLeftRadius: '10px',
        borderBottomRightRadius: '10px',
        backgroundColor: 'var(--color-components-input-bg-normal)',
        margin: 0,
        overflow: 'auto',
      }}
      ><code>{code}</code></pre>
    )
  }

  return (
    <div
      style={{ borderBottomLeftRadius: '10px', borderBottomRightRadius: '10px', overflow: 'auto' }}
      className="shiki-line-numbers [&_pre]:m-0! [&_pre]:rounded-t-none! [&_pre]:rounded-b-[10px]! [&_pre]:bg-components-input-bg-normal! [&_pre]:py-2!"
    >{nodes}</div>
  )
})

ShikiCode.displayName = 'ShikiCode'

const Loading: React.FC<{ isDark: boolean }> = memo(({ isDark }) => (
  <div style={{
    minHeight: '350px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomLeftRadius: '10px',
    borderBottomRightRadius: '10px',
    backgroundColor: isDark ? 'var(--color-components-input-bg-normal)' : 'transparent',
    color: 'var(--color-text-secondary)',
  }}
  >
    <div style={{ marginBottom: '12px', width: '24px', height: '24px' }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ animation: 'spin 1.5s linear infinite' }}>
        <style>
          {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
        </style>
        <circle opacity="0.2" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M12 2C6.47715 2 2 6.47715 2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
    <div style={{ fontFamily: 'var(--font-family)', fontSize: '14px' }}>
      Chart loading...
    </div>
  </div>
))

Loading.displayName = 'Loading'

interface ChartProps {
  option: any
  isDark: boolean
  echartsEvents: Record<string, any>
  handleChartReady: (instance: any) => void
  handleRef: (e: any) => void
  resetFinishedCount: () => void
}

const Chart: React.FC<ChartProps> = memo(({
  option,
  isDark,
  echartsEvents,
  handleChartReady,
  handleRef,
  resetFinishedCount,
}) => {
  useEffect(() => { 
    resetFinishedCount() 
  }, [option, resetFinishedCount])

  return (
    <div style={{
      minWidth: '300px',
      minHeight: '350px',
      width: '100%',
      overflowX: 'auto',
      borderBottomLeftRadius: '10px',
      borderBottomRightRadius: '10px',
      transition: 'background-color 0.3s ease',
    }}>
      <ErrorBoundary>
        <ReactEcharts
          ref={handleRef}
          option={option}
          style={ECHARTS_STYLE}
          theme={isDark ? 'dark' : undefined}
          opts={ECHARTS_OPTS}
          notMerge={false}
          lazyUpdate={false}
          onEvents={echartsEvents}
          onChartReady={handleChartReady}
        />
      </ErrorBoundary>
    </div>
  )
})

Chart.displayName = 'Chart'

const ChartsError: React.FC<{ isDark: boolean; echartsRef: React.RefObject<any> }> = memo(({ isDark, echartsRef }) => (
  <div style={{
    minWidth: '300px',
    minHeight: '350px',
    width: '100%',
    overflowX: 'auto',
    borderBottomLeftRadius: '10px',
    borderBottomRightRadius: '10px',
    transition: 'background-color 0.3s ease',
  }}>
    <ErrorBoundary>
      <ReactEcharts
        ref={echartsRef}
        option={ECHARTS_ERROR_OPTION}
        style={ECHARTS_STYLE}
        theme={isDark ? 'dark' : undefined}
        opts={ECHARTS_OPTS}
        notMerge={true}
      />
    </ErrorBoundary>
  </div>
))

ChartsError.displayName = 'ChartsError'

interface CodeHeaderProps {
  languageShowName: string
  language?: string
  isSVG: boolean
  setIsSVG: React.Dispatch<React.SetStateAction<boolean>>
  copyContent: string
}

const CodeHeader: React.FC<CodeHeaderProps> = memo(({
  languageShowName,
  language,
  isSVG,
  setIsSVG,
  copyContent,
}) => (
  <div className="flex h-8 items-center justify-between rounded-t-[10px] border-b border-divider-subtle bg-components-input-bg-normal p-1 pl-3">
    <div className="system-xs-semibold-uppercase text-text-secondary">{languageShowName}</div>
    <div className="flex items-center gap-1">
      {language === 'svg' && <SVGButton isSVG={isSVG} setIsSVG={setIsSVG} />}
      <ActionButton>
        <CopyIcon content={copyContent} />
      </ActionButton>
    </div>
  </div>
))

CodeHeader.displayName = 'CodeHeader'

interface CodeProps extends React.ComponentPropsWithoutRef<'code'> {
  inline?: boolean
}

const Code: React.FC<CodeProps> = memo(({ inline, className, children = '', ...props }) => {
  const { theme } = useTheme()
  const [isSVG, setIsSVG] = useState(true)

  const match = /language-(\w+)/.exec(className || '')
  const language = match?.[1]
  const languageShowName = getCorrectCapitalizationLanguageName(language || '')
  const isDark = theme === Theme.dark
  const content = String(children).replace(/\n$/, '')

  const {
    chartState,
    chartOption,
    echartsRef,
    echartsEvents,
    handleChartReady,
    handleRef,
    resetFinishedCount,
  } = useCharts(language, children)

  const code = useMemo(() => {
    switch (language) {
      case 'mermaid':
        return <Mermaid 
          code={content} 
          theme={theme as 'light' | 'dark'} 
        />
      case 'echarts': {
        if (chartState === 'loading') {
          return <Loading isDark={isDark} />
        }

        if (chartState === 'success' && chartOption) {
          return (
            <Chart
              option={chartOption}
              isDark={isDark}
              echartsEvents={echartsEvents}
              handleChartReady={handleChartReady}
              handleRef={handleRef}
              resetFinishedCount={resetFinishedCount}
            />
          )
        }

        return <ChartsError isDark={isDark} echartsRef={echartsRef} />
      }
      case 'svg':
        if (isSVG) {
          return (
            <ErrorBoundary>
              <SVGGallery content={content} />
            </ErrorBoundary>
          )
        }

        return (
          <ShikiCode
            code={content}
            language="svg"
            theme={isDark ? 'github-dark' : 'github-light'}
          />
        )
      case 'abc':
        return (
          <ErrorBoundary>
            <Music children={content} />
          </ErrorBoundary>
        )
      default:
        return (
          <ShikiCode
            code={content}
            language={language || 'text'}
            theme={isDark ? 'github-dark' : 'github-light'}
          />
        )
    }
  }, [content, language, isSVG, chartOption, theme, chartState, isDark, echartsEvents, handleChartReady, handleRef, resetFinishedCount, echartsRef])

  if (inline || !match) {
    return <code {...props} className={className}>{children}</code>
  }

  return (
    <div className="relative">
      <CodeHeader
        languageShowName={languageShowName}
        language={language}
        isSVG={isSVG}
        setIsSVG={setIsSVG}
        copyContent={content}
      />
      {code}
    </div>
  )
})

Code.displayName = 'Code'

export default Code
