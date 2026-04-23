import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import * as React from 'react'

const hasEndThink = (children: React.ReactNode): boolean => {
  if (typeof children === 'string') {
    return children.includes('[ENDTHINKFLAG]')
  } else if (Array.isArray(children)) {
    return children.some(child => hasEndThink(child))
  } else if (React.isValidElement(children) && (children.props as React.PropsWithChildren).children) {
    return hasEndThink((children.props as React.PropsWithChildren).children)
  }

  return false
}

const removeEndThink = (children: React.ReactNode): React.ReactNode => {
  if (typeof children === 'string') {
    return children.replace('[ENDTHINKFLAG]', '')
  } else if (Array.isArray(children)) {
    return children.map(child => removeEndThink(child))
  } else if (React.isValidElement<React.PropsWithChildren>(children) && children.props.children) {
    const { children: childChildren, ...props } = children.props
    return React.cloneElement(
      children,
      props,
      removeEndThink(childChildren),
    )
  }

  return children
}

const useThink = (children: React.ReactNode, responding: boolean) => {
  const endThinkDetected = hasEndThink(children)

  const [startTime] = useState(() => Date.now())
  const [elapsedTime, setElapsedTime] = useState(0)
  const [completed, setCompleted] = useState(() => endThinkDetected)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (completed) {
      return
    }

    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 100) / 10)
    }, 100)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [startTime, completed])

  useEffect(() => {
    if (endThinkDetected || !responding) {
      setCompleted(true)
    }
  }, [endThinkDetected, responding])

  return { elapsedTime, completed }
}

interface ThinkProps extends React.ComponentProps<'details'> {
  dataThink?: boolean
}

export const Think: React.FC<ThinkProps> = ({ children, ...props }) => {
  const { elapsedTime, completed } = useThink(children, false)
  const displayContent = removeEndThink(children)
  const { 
    dataThink: isThink = false, 
    className, 
    open, 
    ...rest 
  } = props

  if (!isThink) {
    return <details {...props}>{children}</details>
  }

  return (
    <details
      {...rest}
      data-think={isThink}
      className={clsx('group', className)}
      open={completed ? open : true}
    >
      <summary className="flex cursor-pointer select-none list-none items-center whitespace-nowrap pl-2 font-bold text-text-secondary">
        <div className="flex shrink-0 items-center">
          <svg
            className="mr-2 h-3 w-3 transition-transform duration-500 group-open:rotate-90"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          {completed ? `Thought(${elapsedTime.toFixed(1)}s)` : `Thinking(${elapsedTime.toFixed(1)}s)`}
        </div>
      </summary>
      <div className="ml-2 border-l border-components-panel-border bg-components-panel-bg-alt p-3 text-text-secondary">
        {displayContent}
      </div>
    </details>
  )
}

export default Think
