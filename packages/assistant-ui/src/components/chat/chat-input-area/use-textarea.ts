import { useCallback, useRef, useState } from 'react'

export const useTextArea = () => {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement | undefined>(undefined)
  const textValueRef = useRef<HTMLDivElement>(null)
  const holdSpaceRef = useRef<HTMLDivElement>(null)
  const [isMultipleLine, setIsMultipleLine] = useState(false)

  const onComputeHeight = useCallback(() => {
    const textareaElement = textareaRef.current

    if (wrapperRef.current && textareaElement && textValueRef.current && holdSpaceRef.current) {
      const { width: wrapperWidth } = wrapperRef.current.getBoundingClientRect()
      const { height: textareaHeight } = textareaElement.getBoundingClientRect()
      const { width: textValueWidth } = textValueRef.current.getBoundingClientRect()
      const { width: holdSpaceWidth } = holdSpaceRef.current.getBoundingClientRect()
      
      if (textareaHeight > 32) {
        setIsMultipleLine(true)
      } else {
        if (textValueWidth + holdSpaceWidth >= wrapperWidth) {
          setIsMultipleLine(true)
        } else {
          setIsMultipleLine(false)
        }
      }
    }
  }, [])

  const onTextareaResize = useCallback(() => {
    onComputeHeight()
  }, [onComputeHeight])

  return {
    wrapperRef,
    textareaRef,
    textValueRef,
    holdSpaceRef,
    onTextareaResize,
    isMultipleLine,
  }
}