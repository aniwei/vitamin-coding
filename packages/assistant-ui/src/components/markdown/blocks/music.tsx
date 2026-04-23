import abcjs from 'abcjs'
import { memo, useEffect, useRef } from 'react'

import 'abcjs/abcjs-audio.css'

interface MusicProps {
  children: string
}

export const Music: React.FC<MusicProps> = memo(({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current && controlsRef.current) {
      if (typeof children === 'string') {
        const visualObjs = abcjs.renderAbc(containerRef.current, children, {
          add_classes: true, 
          responsive: 'resize',
        })

        const control = new abcjs.synth.SynthController()
        control.load(controlsRef.current, {}, { displayPlay: true })

        const synth = new abcjs.synth.CreateSynth()
        const visualObj = visualObjs[0]

        synth.init({ visualObj }).then(() => {
          control.setTune(visualObj, false)
        })

        containerRef.current.style.overflow = 'auto'
      }
    }
  }, [children])

  return (
    <div style={{ minWidth: '100%', overflow: 'auto' }}>
      <div ref={containerRef} />
      <div ref={controlsRef} />
    </div>
  )
})

Music.displayName = 'Music'

export default Music
