import * as React from 'react'

export const isValidUrl = (url: string): boolean => {
  const validPrefixes = ['http:', 'https:', '//', 'mailto:', 'data:']
  return validPrefixes.some(prefix => url.startsWith(prefix))
}


interface LinkProps {
  node: {
    properties?: { href?: string | string[]
      [key: string]: any
    }
    children?: { value?: string }[]
    [key: string]: any
  }
  children: React.ReactNode
  onSend: (text: string) => void
  [key: string]: any
}

export const Link: React.FC<LinkProps> = ({ 
  node, 
  children, 
  onSend, 
  ...props 
}) => {
  if (
    node.properties?.href && 
    node.properties.href?.toString().startsWith('abbr')
  ) {
    const hiddenText = decodeURIComponent(node.properties.href.toString().split('abbr:')[1])

    return <abbr 
      className="cursor-pointer underline decoration-primary-700! decoration-dashed" 
      onClick={() => onSend?.(hiddenText)} 
      title={node.children?.[0]?.value || ''}
    >{node.children?.[0]?.value || ''}</abbr>
  } else {
    const href = props.href || node.properties?.href

    if (href && /^#[\w-]+$/.test(href.toString())) {
      const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault()
        
        const answer = e.currentTarget.closest('.chat-answer-container')

        if (answer) {
          const targetId = CSS.escape(href.toString().substring(1))
          const target = answer.querySelector(`[id="${targetId}"]`)

          if (target) {
            target.scrollIntoView({ behavior: 'smooth' })
          }
        }
      }
      return <a 
        href={href} 
        onClick={handleClick} 
        className="cursor-pointer underline decoration-primary-700! decoration-dashed"
        >{children || 'ScrollView'}</a>
    }

    if (!href || !isValidUrl(href)) {
      return <span>{children}</span>
    }

    return <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="cursor-pointer underline decoration-primary-700! decoration-dashed"
    >{children || 'Download'}</a>
  }
}

export default Link
