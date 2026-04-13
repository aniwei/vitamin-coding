import ReactEcharts from 'echarts-for-react'
import ActionButton from '@/components/action-button'
import CopyIcon from '@/components/copy-icon'
import ErrorBoundary from '@/components/markdown/error-boundary'
import SVGButton from '@/components/svg-button'
import useTheme from '@/hooks/use-theme'
import SVGGallery from '@/components/svg-gallery' 
import Music from './music'

import { Theme } from '@/types'
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

import type { JSX } from 'react'
import type { BundledLanguage, BundledTheme } from 'shiki/bundle/web'

const MermaidDiagram = lazy(() => import('@/components/mermaid'))

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

  if (language in capitalizationLanguageNames) {
    return capitalizationLanguageNames[language]
  }

  return language.charAt(0).toUpperCase() + language.substring(1)
}

interface ShikiCodeProps {
  code: string
  language: string
  theme: BundledTheme
  initial?: JSX.Element
}

export const ShikiCode: React.FC<ShikiCodeProps> = memo(({ code, language, theme, initial }) => {
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

    return () => {
      cancelled = true
    }
  }, [code, language, theme])

  if (!nodes) {
    return <pre 
      style={{
        paddingLeft: 12,
        borderBottomLeftRadius: '10px',
        borderBottomRightRadius: '10px',
        backgroundColor: 'var(--color-components-input-bg-normal)',
        margin: 0,
        overflow: 'auto',
      }}
    ><code>{code}</code></pre>
  }

  return (
    <div
      style={{
        borderBottomLeftRadius: '10px',
        borderBottomRightRadius: '10px',
        overflow: 'auto',
      }}
      className="shiki-line-numbers [&_pre]:m-0! [&_pre]:rounded-t-none! [&_pre]:rounded-b-[10px]! [&_pre]:bg-components-input-bg-normal! [&_pre]:py-2!"
    >{nodes}</div>
  )
})

ShikiCode.displayName = 'ShikiCode'

interface EChartsEventParams {
  type: string
  seriesIndex?: number
  dataIndex?: number
  name?: string
  value?: any
  currentIndex?: number // Added for timeline events
  [key: string]: any
}

const Loading = () => {
  const { theme } = useTheme()
  const isDark = theme === Theme.dark

  return (
    <div 
      style={{
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
      <div style={{
        marginBottom: '12px',
        width: '24px',
        height: '24px',
      }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ animation: 'spin 1.5s linear infinite' }}>
          <style>
            {`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}
          </style>
          <circle opacity="0.2" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path d="M12 2C6.47715 2 2 6.47715 2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{
        fontFamily: 'var(--font-family)',
        fontSize: '14px',
      }}
      >Chart loading...</div>
    </div>
  )
}

interface UseContent {
  theme: Theme
  state: string
  children: React.ReactNode
  language: string
  isSVG: boolean
}

const useContent = ({
  theme,
  state,
  children,
  language,
  isSVG
}: UseContent) => {
  return useMemo(() => {
    const isDark = theme === Theme.dark
    const content = String(children).replace(/\n$/, '')
    
    switch (language) {
      case 'mermaid':
        return <MermaidDiagram code={content} theme={theme as 'light' | 'dark'} />
      case 'echarts': {
        if (state === 'loading') {
          return <Loading />
        }

        // Success state: show the chart
        if (state === 'success' && finalChartOption) {
          // Reset finished event counter
          finishedEventCountRef.current = 0

          return (
            <div style={{
              minWidth: '300px',
              minHeight: '350px',
              width: '100%',
              overflowX: 'auto',
              borderBottomLeftRadius: '10px',
              borderBottomRightRadius: '10px',
              transition: 'background-color 0.3s ease',
            }}
            >
              <ErrorBoundary>
                <ReactEcharts
                  ref={(e) => {
                    if (e && isInitialRenderRef.current) {
                      echartsRef.current = e
                      isInitialRenderRef.current = false
                    }
                  }}
                  option={finalChartOption}
                  style={echartsStyle}
                  theme={isDark ? 'dark' : 'light'}
                  opts={echartsOpts}
                  notMerge={false}
                  lazyUpdate={false}
                  onEvents={echartsEvents}
                  onChartReady={handleChartReady}
                />
              </ErrorBoundary>
            </div>
          )
        }

        const errorOption = {
          title: {
            text: 'ECharts error - Wrong option.',
          },
        }

        return (
          <div style={{
            minWidth: '300px',
            minHeight: '350px',
            width: '100%',
            overflowX: 'auto',
            borderBottomLeftRadius: '10px',
            borderBottomRightRadius: '10px',
            transition: 'background-color 0.3s ease',
          }}
          >
            <ErrorBoundary>
              <ReactEcharts
                ref={echartsRef}
                option={errorOption}
                style={echartsStyle}
                theme={isDarkMode ? 'dark' : undefined}
                opts={echartsOpts}
                notMerge={true}
              />
            </ErrorBoundary>
          </div>
        )
      }
      case 'svg':
        if (isSVG) {
          return <ErrorBoundary>
            <SVGGallery content={content} />
          </ErrorBoundary>
        }
        break
      case 'abc':
        return <ErrorBoundary>
          <Music children={content} />
        </ErrorBoundary>
      default:
        return <ShikiCode
          code={content}
          language={language || 'text'}
          theme={isDark ? 'github-dark' : 'github-light'}
        />
    }
  }, [
    children, 
    language, 
    isSVG, 
    finalChartOption, 
    props, 
    theme, 
    match, 
    chartState, 
    echartsStyle, 
    echartsOpts, 
    handleChartReady, 
    echartsEvents
  ])
}

interface CodeProps {
  inline?: boolean
  className?: string
  children?: React.ReactNode
}

export const Code: React.FC<CodeProps> = memo(({ 
  inline, 
  className, 
  children = '', 
  ...props 
}) => {
  const { theme } = useTheme()
  const [isSVG, setIsSVG] = useState(true)
  const [chartState, setChartState] = useState<'loading' | 'success' | 'error'>('loading')
  const [finalChartOption, setFinalChartOption] = useState<any>(null)
  const echartsRef = useRef<any>(null)
  const contentRef = useRef<string>('')
  const processedRef = useRef<boolean>(false) 
  const isInitialRenderRef = useRef<boolean>(true)
  const chartInstanceRef = useRef<any>(null)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chartReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finishedEventCountRef = useRef<number>(0) 
  const match = /language-(\w+)/.exec(className || '')
  const language = match?.[1]
  const languageShowName = getCorrectCapitalizationLanguageName(language || '')

  const clearResizeTimer = useCallback(() => {
    if (!resizeTimerRef.current) {
      return
    }

    clearTimeout(resizeTimerRef.current)
    resizeTimerRef.current = null
  }, [])

  const clearChartReadyTimer = useCallback(() => {
    if (!chartReadyTimerRef.current) {
      return
    }

    clearTimeout(chartReadyTimerRef.current)
    chartReadyTimerRef.current = null
  }, [])

  const echartsStyle = useMemo(() => ({
    height: '350px',
    width: '100%',
  }), [])

  const echartsOpts = useMemo(() => ({
    renderer: 'canvas',
    width: 'auto',
  }) as any, [])

  const debouncedResize = useCallback(() => {
    clearResizeTimer()

    resizeTimerRef.current = setTimeout(() => {
      if (chartInstanceRef.current)
        chartInstanceRef.current.resize()
      resizeTimerRef.current = null
    }, 200)
  }, [clearResizeTimer])

  const onChartReady = useCallback((instance: any) => {
    chartInstanceRef.current = instance

    clearChartReadyTimer()
    chartReadyTimerRef.current = setTimeout(() => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.resize()
      }

      chartReadyTimerRef.current = null
    }, 200)
  }, [clearChartReadyTimer])

  const echartsEvents = useMemo(() => ({
    finished: (_params: EChartsEventParams) => {
      finishedEventCountRef.current++
      if (finishedEventCountRef.current > 3) {
        return
      }

      if (chartInstanceRef.current) {
        debouncedResize()
      }
    },
  }), [debouncedResize])

  // Handle container resize for echarts
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
      clearResizeTimer()
      clearChartReadyTimer()
      chartInstanceRef.current = null
    }
  }, [language, debouncedResize, clearResizeTimer, clearChartReadyTimer])

  useEffect(() => {
    return () => {
      clearResizeTimer()
      clearChartReadyTimer()
      chartInstanceRef.current = null
      echartsRef.current = null
    }
  }, [clearResizeTimer, clearChartReadyTimer])
  
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

    const trimmedContent = newContent.trim()
    if (!trimmedContent) {
      return
    }

    const isCompleteJson = (
      trimmedContent.startsWith('{') && trimmedContent.endsWith('}') && 
      trimmedContent.split('{').length === trimmedContent.split('}').length) || 
      (
        trimmedContent.startsWith('[') && trimmedContent.endsWith(']') && 
        trimmedContent.split('[').length === trimmedContent.split(']').length
      ) 

    
    if (isCompleteJson && !processedRef.current) {
      try {
        const parsed = JSON.parse(trimmedContent)
        if (typeof parsed === 'object' && parsed !== null) {
          setFinalChartOption(parsed)
          setChartState('success')
          processedRef.current = true
          return
        }
      } catch {
        setChartState('error')
        processedRef.current = true
        return
      }
    }

    const isIncomplete = trimmedContent.length < 5 || (
      trimmedContent.startsWith('{') && (
        !trimmedContent.endsWith('}') || 
        trimmedContent.split('{').length !== trimmedContent.split('}').length)
    ) || (
      trimmedContent.startsWith('[') && (
        !trimmedContent.endsWith(']') || 
        trimmedContent.split('[').length !== trimmedContent.split('}').length)
    )
            || (trimmedContent.split('"').length % 2 !== 1)
            || (trimmedContent.includes('{"') && !trimmedContent.includes('"}'))

    if (!isIncomplete && !processedRef.current) {
      let isValidOption = false

      try {
        const parsed = JSON.parse(trimmedContent)
        if (typeof parsed === 'object' && parsed !== null) {
          setFinalChartOption(parsed)
          isValidOption = true
        }
      } catch {
        setChartState('error')
        processedRef.current = true
      }

      if (isValidOption) {
        setChartState('success')
        processedRef.current = true
      }
    }
  }, [language, children])

  const content = useContent({
    theme,
    state: chartState,
    children,
    language: language || '',
  })

  if (inline || !match) {
    return <code 
      {...props} 
      className={className}
    >{children}</code>
  }

  return (
    <div className="relative">
      <div className="flex h-8 items-center justify-between rounded-t-[10px] border-b border-divider-subtle bg-components-input-bg-normal p-1 pl-3">
        <div className="system-xs-semibold-uppercase text-text-secondary">{languageShowName}</div>
        <div className="flex items-center gap-1">
          { 
            language === 'svg' && <SVGButton 
              isSVG={isSVG} 
              setIsSVG={setIsSVG} 
            /> 
          }
          <ActionButton>
            <CopyIcon content={String(children).replace(/\n$/, '')} />
          </ActionButton>
        </div>
      </div>
      {content}
    </div>
  )
})

Code.displayName = 'Code'

export default Code
