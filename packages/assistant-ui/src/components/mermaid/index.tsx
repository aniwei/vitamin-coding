import mermaid from 'mermaid'
import LoadingAnimation from '@/components/chat/loading-animation'
import ImagePreview from '@/components/image-preview'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Theme } from '@/types'
import { clsx } from 'clsx'
import * as React from 'react'
import type { MermaidConfig } from 'mermaid'

// --- Module-level state ---
let isMermaidInitialized = false
const diagramCache = new Map<string, string>()
let mermaidAPI: typeof mermaid.mermaidAPI | null = null

if (typeof window !== 'undefined')
  mermaidAPI = mermaid.mermaidAPI

// --- Theme configurations ---
const THEMES = {
  light: {
    name: 'Light Theme',
    background: '#ffffff',
    primaryColor: '#ffffff',
    primaryBorderColor: '#000000',
    primaryTextColor: '#000000',
    secondaryColor: '#ffffff',
    tertiaryColor: '#ffffff',
    nodeColors: [
      { bg: '#f0f9ff', color: '#0369a1' },
      { bg: '#f0fdf4', color: '#166534' },
      { bg: '#fef2f2', color: '#b91c1c' },
      { bg: '#faf5ff', color: '#7e22ce' },
      { bg: '#fffbeb', color: '#b45309' },
    ],
    connectionColor: '#74a0e0',
  },
  dark: {
    name: 'Dark Theme',
    background: '#1e293b',
    primaryColor: '#334155',
    primaryBorderColor: '#94a3b8',
    primaryTextColor: '#e2e8f0',
    secondaryColor: '#475569',
    tertiaryColor: '#334155',
    nodeColors: [
      { bg: '#164e63', color: '#e0f2fe' },
      { bg: '#14532d', color: '#dcfce7' },
      { bg: '#7f1d1d', color: '#fee2e2' },
      { bg: '#581c87', color: '#f3e8ff' },
      { bg: '#78350f', color: '#fef3c7' },
    ],
    connectionColor: '#60a5fa',
  },
}

// Shared base config — deduplicates initMermaid and configureMermaid
const BASE_MERMAID_CONFIG: MermaidConfig = {
  startOnLoad: false,
  fontFamily: 'sans-serif',
  securityLevel: 'strict',
  maxTextSize: 50000,
  gantt: {
    titleTopMargin: 25,
    barHeight: 20,
    barGap: 4,
    topPadding: 50,
    leftPadding: 75,
    gridLineStartPadding: 35,
    fontSize: 11,
    numberSectionStyles: 4,
    axisFormat: '%Y-%m-%d',
  },
  mindmap: {
    useMaxWidth: true,
    padding: 10,
  },
}

// --- Helpers ---

function cleanUpSvgCode(svgCode: string): string {
  return svgCode.replaceAll('<br>', '<br/>')
}

function sanitizeMermaidCode(mermaidCode: string): string {
  if (!mermaidCode || typeof mermaidCode !== 'string')
    return ''

  return mermaidCode
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart()
      // Mermaid directives can override config; treat as untrusted in chat context.
      if (trimmed.startsWith('%%{'))
        return false
      // Mermaid click directives can create JS callbacks/links inside rendered SVG.
      if (trimmed.startsWith('click '))
        return false
      return true
    })
    .join('\n')
}

// sanitizeMermaidCode is applied once after all paths in renderDiagram, not inside here.
function prepareMermaidCode(mermaidCode: string, style: 'classic' | 'handDrawn'): string {
  if (!mermaidCode || typeof mermaidCode !== 'string')
    return ''

  let code = mermaidCode.trim()
  code = code.replace(/<br\s*\/?>/g, '\n')

  if (style === 'handDrawn') {
    code = code
      .replace(/style\s+[^\n]+/g, '')
      .replace(/linkStyle\s+[^\n]+/g, '')
      .replace(/^flowchart/, 'graph')
      .replace(/class="[^"]*"/g, '')
      .replace(/fill="[^"]*"/g, '')
      .replace(/stroke="[^"]*"/g, '')

    if (!code.startsWith('graph') && !code.startsWith('flowchart'))
      code = `graph TD\n${code}`
  }

  return code
}

function svgToBase64(svgGraph: string): Promise<string> {
  if (!svgGraph)
    return Promise.resolve('')

  try {
    if (!svgGraph.includes('<?xml'))
      svgGraph = `<?xml version="1.0" encoding="UTF-8"?>${svgGraph}`

    const blob = new Blob([new TextEncoder().encode(svgGraph)], { type: 'image/svg+xml;charset=utf-8' })
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }
  catch {
    return Promise.resolve('')
  }
}

// Uses module-level THEMES — themes param removed.
function processSvgForTheme(svg: string, isDark: boolean, isHandDrawn: boolean): string {
  let processedSvg = svg

  if (isDark) {
    processedSvg = processedSvg
      .replace(/style="fill: ?#000000"/g, 'style="fill: #e2e8f0"')
      .replace(/style="stroke: ?#000000"/g, 'style="stroke: #94a3b8"')
      .replace(/<rect [^>]*fill="#ffffff"/g, '<rect $& fill="#1e293b"')

    if (isHandDrawn) {
      processedSvg = processedSvg
        .replace(/fill="#[a-fA-F0-9]{6}"/g, `fill="${THEMES.dark.nodeColors[0].bg}"`)
        .replace(/stroke="#[a-fA-F0-9]{6}"/g, `stroke="${THEMES.dark.connectionColor}"`)
        .replace(/stroke-width="1"/g, 'stroke-width="1.5"')
    }
    else {
      let i = 0
      const nodeColorRegex = /fill="#[a-fA-F0-9]{6}"[^>]*class="node-[^"]*"/g
      processedSvg = processedSvg.replace(nodeColorRegex, (match: string) => {
        const colorIndex = i % THEMES.dark.nodeColors.length
        i++
        return match.replace(/fill="#[a-fA-F0-9]{6}"/, `fill="${THEMES.dark.nodeColors[colorIndex].bg}"`)
      })

      processedSvg = processedSvg
        .replace(/<path [^>]*stroke="#[a-fA-F0-9]{6}"/g, `<path stroke="${THEMES.dark.connectionColor}" stroke-width="1.5"`)
        .replace(/<(line|polyline) [^>]*stroke="#[a-fA-F0-9]{6}"/g, `<$1 stroke="${THEMES.dark.connectionColor}" stroke-width="1.5"`)
    }
  }
  else {
    if (isHandDrawn) {
      processedSvg = processedSvg
        .replace(/fill="#[a-fA-F0-9]{6}"/g, `fill="${THEMES.light.nodeColors[0].bg}"`)
        .replace(/stroke="#[a-fA-F0-9]{6}"/g, `stroke="${THEMES.light.connectionColor}"`)
        .replace(/stroke-width="1"/g, 'stroke-width="1.5"')
    }
    else {
      let i = 0
      const nodeColorRegex = /fill="#[a-fA-F0-9]{6}"[^>]*class="node-[^"]*"/g
      processedSvg = processedSvg.replace(nodeColorRegex, (match: string) => {
        const colorIndex = i % THEMES.light.nodeColors.length
        i++
        return match.replace(/fill="#[a-fA-F0-9]{6}"/, `fill="${THEMES.light.nodeColors[colorIndex].bg}"`)
      })

      processedSvg = processedSvg
        .replace(/<path [^>]*stroke="#[a-fA-F0-9]{6}"/g, `<path stroke="${THEMES.light.connectionColor}"`)
        .replace(/<(line|polyline) [^>]*stroke="#[a-fA-F0-9]{6}"/g, `<$1 stroke="${THEMES.light.connectionColor}"`)
    }
  }

  return processedSvg
}

function isMermaidCodeComplete(code: string): boolean {
  if (!code || code.trim().length === 0)
    return false

  try {
    const trimmedCode = code.trim()

    if (trimmedCode.startsWith('gantt')) {
      const lines = trimmedCode.split('\n').filter(line => line.trim().length > 0)
      return lines.length >= 3
    }

    if (trimmedCode.startsWith('mindmap')) {
      const lines = trimmedCode.split('\n').filter(line => line.trim().length > 0)
      return lines.length >= 2
    }

    const hasValidStart = /^(graph|flowchart|sequenceDiagram|classDiagram|classDef|class|stateDiagram|gantt|pie|er|journey|requirementDiagram|mindmap)/.test(trimmedCode)

    // Relying on Mermaid's own parser for structural validation is more robust
    // than a bracket-balance check (which false-negatives on shapes like `A>B]`).
    const hasNoSyntaxErrors = !trimmedCode.includes('undefined')
      && !trimmedCode.includes('[object Object]')
      && trimmedCode.split('\n').every(line =>
        !(line.includes('-->') && !/\S+\s*-->\s*\S+/.exec(line)))

    return hasValidStart && hasNoSyntaxErrors
  }
  catch (error) {
    console.error('Mermaid code validation error:', error)
    return false
  }
}

function waitForDOMElement(callback: () => Promise<any>, maxAttempts = 3, delay = 100): Promise<any> {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const tryRender = async () => {
      try {
        resolve(await callback())
      }
      catch (error) {
        attempts++
        if (attempts < maxAttempts)
          setTimeout(tryRender, delay)
        else
          reject(error)
      }
    }
    tryRender()
  })
}

// --- Mermaid initialization ---

const initMermaid = () => {
  if (typeof window !== 'undefined' && !isMermaidInitialized) {
    try {
      mermaid.initialize({
        ...BASE_MERMAID_CONFIG,
        flowchart: {
          htmlLabels: true,
          useMaxWidth: true,
          curve: 'basis',
          nodeSpacing: 50,
          rankSpacing: 70,
        },
      })
      isMermaidInitialized = true
    }
    catch (error) {
      console.error('Mermaid initialization error:', error)
      return null
    }
  }
  return isMermaidInitialized
}

// --- Component ---

interface MermaidDiagramProps {
  code: string
  theme?: 'light' | 'dark'
  ref?: React.Ref<HTMLDivElement>
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = (props) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartId = useRef(`mermaid-chart-${Math.random().toString(36).slice(2, 11)}`).current
  const renderTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const [svg, setSVG] = useState<string | null>(null)
  const [renderStyle, setRenderStyle] = useState<'classic' | 'handDrawn'>('classic')
  const [initialized, setInitialized] = useState(false)
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(props.theme || 'light')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')

  const resetDiagram = useCallback(() => {
    diagramCache.clear()
    setSVG(null)
  }, [])

  const renderMermaidChart = async (code: string, style: 'classic' | 'handDrawn') => {
    if (style === 'handDrawn') {
      if (containerRef.current)
        containerRef.current.innerHTML = `<div id="${chartId}"></div>`

      await new Promise(resolve => setTimeout(resolve, 30))

      if (typeof window !== 'undefined' && mermaidAPI)
        return await mermaidAPI.render(chartId, code)

      const { svg } = await mermaid.render(chartId, code)
      return { svg }
    }
    else {
      const renderWithRetry = async () => {
        /* v8 ignore next */
        if (containerRef.current)
          containerRef.current.innerHTML = `<div id="${chartId}"></div>`
        await new Promise(resolve => setTimeout(resolve, 30))
        const { svg } = await mermaid.render(chartId, code)
        return { svg }
      }
      return await waitForDOMElement(renderWithRetry)
    }
  }

  const handleRenderError = (err: unknown) => {
    console.error('Mermaid rendering error:', err)
    try {
      diagramCache.clear()
      isMermaidInitialized = false
      initMermaid()
    }
    catch (reinitError) {
      console.error('Failed to re-initialize Mermaid after error:', reinitError)
    }
    setError(`Rendering failed: ${(err as Error).message || 'Unknown error. Please check the console.'}`)
    setLoading(false)
  }

  useEffect(() => {
    const api = initMermaid()
    if (api)
      setInitialized(true)
  }, [])

  // Sync external theme prop, but allow internal toggles to override.
  const prevThemeRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (props.theme && props.theme !== prevThemeRef.current) {
      resetDiagram()
      setCurrentTheme(props.theme)
      setRenderStyle('classic')
    }
    prevThemeRef.current = props.theme
  }, [props.theme, resetDiagram])

  const renderDiagram = useCallback(async (primitiveCode: string) => {
    /* v8 ignore next */
    if (!initialized || !containerRef.current) {
      /* v8 ignore next */
      setLoading(false)
      /* v8 ignore next */
      setError(!initialized ? 'Mermaid initialization failed' : 'Container element not found')
      return
    }

    const cacheKey = `${primitiveCode}-${renderStyle}-${currentTheme}`

    setLoading(true)
    setError('')

    try {
      let finalCode: string

      const trimmedCode = primitiveCode.trim()

      if (trimmedCode.startsWith('gantt')) {
        finalCode = trimmedCode
          .split('\n')
          .map((line) => {
            const taskMatch = /^\s*([^:]+?)\s*:\s*(.*)/.exec(line)
            if (!taskMatch)
              return line

            const taskName = taskMatch[1].trim()
            let paramsStr = taskMatch[2].trim()
            paramsStr = paramsStr.replace(/,\s*after\s+/g, ' ')
            const finalParams = paramsStr.replace(/\s*,\s*/g, ', ').trim()
            return `${taskName} :${finalParams}`
          })
          .join('\n')
      }
      else if (trimmedCode.startsWith('mindmap') || trimmedCode.startsWith('sequenceDiagram')) {
        // These diagram types are sensitive to syntax transformations — pass through directly.
        finalCode = trimmedCode
      }
      else {
        finalCode = prepareMermaidCode(primitiveCode, renderStyle)
      }

      // Single sanitize pass covering all code paths.
      finalCode = sanitizeMermaidCode(finalCode)

      const svgGraph = await renderMermaidChart(finalCode, renderStyle)
      const processedSvg = processSvgForTheme(svgGraph.svg, currentTheme === Theme.dark, renderStyle === 'handDrawn')
      const cleanedSvg = cleanUpSvgCode(processedSvg)

      diagramCache.set(cacheKey, cleanedSvg)
      setSVG(cleanedSvg)
      setLoading(false)
    }
    catch (err) {
      handleRenderError(err)
    }
  }, [chartId, initialized, renderStyle, currentTheme])

  const configureMermaid = useCallback((primitiveCode: string) => {
    if (typeof window === 'undefined' || !initialized)
      return false

    const themeVars = THEMES[currentTheme]
    const isFlowchart = primitiveCode.trim().startsWith('graph') || primitiveCode.trim().startsWith('flowchart')
    const config: MermaidConfig = { ...BASE_MERMAID_CONFIG }

    if (renderStyle === 'classic') {
      config.theme = currentTheme === 'dark' ? 'dark' : 'neutral'

      if (isFlowchart) {
        type FlowchartConfigWithRanker = NonNullable<MermaidConfig['flowchart']> & { ranker?: string }
        const flowchartConfig: FlowchartConfigWithRanker = {
          htmlLabels: true,
          useMaxWidth: true,
          nodeSpacing: 60,
          rankSpacing: 80,
          curve: 'linear',
          ranker: 'tight-tree',
        }
        config.flowchart = flowchartConfig as unknown as MermaidConfig['flowchart']
      }

      if (currentTheme === 'dark') {
        config.themeVariables = {
          background: themeVars.background,
          primaryColor: themeVars.primaryColor,
          primaryBorderColor: themeVars.primaryBorderColor,
          primaryTextColor: themeVars.primaryTextColor,
          secondaryColor: themeVars.secondaryColor,
          tertiaryColor: themeVars.tertiaryColor,
        }
      }
    }
    else {
      config.theme = 'default'
      config.themeCSS = `
        .node rect { fill-opacity: 0.85; }
        .edgePath .path { stroke-width: 1.5px; }
        .label { font-family: 'sans-serif'; }
        .edgeLabel { font-family: 'sans-serif'; }
        .cluster rect { rx: 5px; ry: 5px; }
      `
      config.themeVariables = {
        fontSize: '14px',
        fontFamily: 'sans-serif',
        primaryBorderColor: THEMES[currentTheme].connectionColor,
      }

      if (isFlowchart) {
        config.flowchart = {
          htmlLabels: true,
          useMaxWidth: true,
          nodeSpacing: 40,
          rankSpacing: 60,
          curve: 'basis',
        }
      }
    }

    try {
      mermaid.initialize(config)
      return true
    }
    catch (error) {
      console.error('Config error:', error)
      return false
    }
  }, [currentTheme, initialized, renderStyle])

  useEffect(() => {
    if (!initialized)
      return

    if (!props.code || props.code.length < 10) {
      setLoading(false)
      setSVG(null)
      return
    }

    if (renderTimeoutRef.current)
      clearTimeout(renderTimeoutRef.current)

    setLoading(true)

    renderTimeoutRef.current = setTimeout(() => {
      if (!isMermaidCodeComplete(props.code)) {
        setLoading(false)
        setError('Diagram code is not complete or invalid.')
        return
      }

      const cacheKey = `${props.code}-${renderStyle}-${currentTheme}`
      if (diagramCache.has(cacheKey)) {
        setError('')
        setSVG(diagramCache.get(cacheKey)!)
        setLoading(false)
        return
      }

      if (configureMermaid(props.code))
        renderDiagram(props.code)
    }, 300)

    return () => {
      clearTimeout(renderTimeoutRef.current)
    }
  }, [props.code, renderStyle, currentTheme, initialized, configureMermaid, renderDiagram])

  useEffect(() => {
    return () => {
      if (renderTimeoutRef.current)
        clearTimeout(renderTimeoutRef.current)
    }
  }, [])

  const handlePreviewClick = async () => {
    if (!svg)
      return
    const base64 = await svgToBase64(svg)
    setPreviewUrl(base64)
  }

  const toggleTheme = () => {
    resetDiagram()
    setCurrentTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  const themeClasses = {
    container: clsx('relative', {
      'bg-white': currentTheme === Theme.light,
      'bg-slate-900': currentTheme === Theme.dark,
    }),
    mermaidDiv: clsx('mermaid relative h-auto w-full cursor-pointer', {
      'bg-white': currentTheme === Theme.light,
      'bg-slate-900': currentTheme === Theme.dark,
    }),
    errorMessage: clsx('px-[26px] py-4', {
      'text-red-500': currentTheme === Theme.light,
      'text-red-400': currentTheme === Theme.dark,
    }),
    errorIcon: clsx('h-6 w-6', {
      'text-red-500': currentTheme === Theme.light,
      'text-red-400': currentTheme === Theme.dark,
    }),
    segmented: clsx('msh-segmented msh-segmented-sm css-23bs09 css-var-r1', {
      'text-gray-700': currentTheme === Theme.light,
      'text-gray-300': currentTheme === Theme.dark,
    }),
    themeToggle: clsx('flex h-10 w-10 items-center justify-center rounded-full shadow-md backdrop-blur-xs transition-all duration-300', {
      'border border-gray-200 bg-white/80 text-gray-700 hover:bg-white hover:shadow-lg': currentTheme === Theme.light,
      'border border-slate-600 bg-slate-800/80 text-yellow-300 hover:bg-slate-700 hover:shadow-lg': currentTheme === Theme.dark,
    }),
  }

  const getRenderStyleButtonClass = (style: 'classic' | 'handDrawn') =>
    clsx(
      'mb-4 flex h-8 w-[calc((100%-8px)/2)] cursor-pointer items-center justify-center rounded-lg border border-components-option-card-option-border bg-components-option-card-option-bg text-text-secondary system-sm-medium',
      renderStyle === style && 'border-[1.5px] border-components-option-card-option-selected-border bg-components-option-card-option-selected-bg text-text-primary',
      currentTheme === Theme.dark && 'border-slate-600 bg-slate-800 text-slate-300',
      renderStyle === style && currentTheme === Theme.dark && 'border-blue-500 bg-slate-700 text-white',
    )

  return (
    <div ref={props.ref as React.RefObject<HTMLDivElement>} className={themeClasses.container}>
      <div className={themeClasses.segmented}>
        <div className="msh-segmented-group">
          <label className="msh-segmented-item m-2 flex w-[200px] items-center space-x-1">
            <div
              key="classic"
              className={getRenderStyleButtonClass('classic')}
              onClick={() => {
                if (renderStyle !== 'classic') {
                  resetDiagram()
                  setRenderStyle('classic')
                }
              }}
            >
              <div className="msh-segmented-item-label">Classic</div>
            </div>
            <div
              key="handDrawn"
              className={getRenderStyleButtonClass('handDrawn')}
              onClick={() => {
                if (renderStyle !== 'handDrawn') {
                  resetDiagram()
                  setRenderStyle('handDrawn')
                }
              }}
            >
              <div className="msh-segmented-item-label">Hand Drawn</div>
            </div>
          </label>
        </div>
      </div>

      <div ref={containerRef} style={{ position: 'absolute', visibility: 'hidden', height: 0, overflow: 'hidden' }} />

      {loading && !svg && (
        <div className="px-[26px] py-4">
          <LoadingAnimation type="text" />
          <div className="mt-2 text-sm text-gray-500">
            Wait for completion
          </div>
        </div>
      )}

      {svg && (
        <div className={themeClasses.mermaidDiv} style={{ objectFit: 'cover' }} onClick={handlePreviewClick}>
          <div className="absolute bottom-2 left-2 z-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleTheme()
              }}
              className={themeClasses.themeToggle}
              title={currentTheme === 'light' ? 'Switch to Dark' : 'Switch to Light'}
              style={{ transform: 'translate3d(0, 0, 0)' }}
            >
              {currentTheme === Theme.light ? <span className="i-heroicons-moon-solid h-5 w-5" /> : <span className="i-heroicons-sun-solid h-5 w-5" />}
            </button>
          </div>

          <div
            style={{ maxWidth: '100%' }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      )}

      {error && (
        <div className={themeClasses.errorMessage}>
          <div className="flex items-center">
            <span className={`i-heroicons-exclamation-triangle ${themeClasses.errorIcon}`} />
            <span className="ml-2">{error}</span>
          </div>
        </div>
      )}

      {previewUrl && (
        <ImagePreview
          title="mermaid_chart"
          url={previewUrl}
          onCancel={() => setPreviewUrl('')}
        />
      )}
    </div>
  )
}

MermaidDiagram.displayName = 'MermaidDiagram'

export default MermaidDiagram
