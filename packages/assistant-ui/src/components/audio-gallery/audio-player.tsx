import useTheme from '@/hooks/use-theme'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { Theme } from '@/types'
import { clsx } from 'clsx'
import * as React from 'react'

const useAudio = (
  src?: string,
  onLoadedMetadata?: () => void,
  onTimeUpdate?: () => void,
  onProgress?: () => void,
  onEnded?: () => void,
  onError?: () => void,
  generateWaveformData?: (src: string) => void
) => {
  const audioRef = useRef<HTMLAudioElement>(null)
  
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    if (onLoadedMetadata) audio.addEventListener('loadedmetadata', onLoadedMetadata)
    if (onTimeUpdate) audio.addEventListener('timeupdate', onTimeUpdate)
    if (onProgress) audio.addEventListener('progress', onProgress)
    if (onEnded) audio.addEventListener('ended', onEnded)
    if (onError) audio.addEventListener('error', onError)

    audio.load()
    
    if (src) {
      const timer = generateWaveformData ? setTimeout(generateWaveformData, 1000, src) : undefined

      return () => {
        if (onLoadedMetadata) audio.removeEventListener('loadedmetadata', onLoadedMetadata)
        if (onTimeUpdate) audio.removeEventListener('timeupdate', onTimeUpdate)
        if (onProgress) audio.removeEventListener('progress', onProgress)
        if (onEnded) audio.removeEventListener('ended', onEnded)
        if (onError) audio.removeEventListener('error', onError)

        if (timer !== undefined) clearTimeout(timer)
      }
    }
  }, [src])

  return audioRef
}

interface AudioPlayerProps {
  src?: string 
  srcs?: string[]
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, srcs }) => {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [bufferedTime, setBufferedTime] = useState(0)
  const [hasStartedPlaying, setHasStartedPlaying] = useState(false)
  const [hoverTime, setHoverTime] = useState(0)
  const [isAudioAvailable, setIsAudioAvailable] = useState(true)
  const { theme } = useTheme()

  const audioRef = useAudio(
    src,
    () => { },
    () => { },
    () => { },
  )
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const onTogglePlay = useCallback(() => {
    const audio = audioRef.current

    if (audio && isAudioAvailable) {
      if (playing) {
        setHasStartedPlaying(false)
        audio.pause()
      } else {
        setHasStartedPlaying(true)
        audio.play().catch(error => console.error('Error playing audio:', error))
      }
      
      setPlaying(!playing)
    } else {
      toast.error('Audio element not found')
      setIsAudioAvailable(false)
    }
  }, [isAudioAvailable, playing])

  const handleCanvasInteraction = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()

    const getClientX = (event: React.MouseEvent | React.TouchEvent): number => {
      if ('touches' in event) {
        return event.touches[0].clientX
      }
      
      return event.clientX
    }

    const updateProgress = (clientX: number) => {
      const canvas = canvasRef.current
      const audio = audioRef.current
      if (!canvas || !audio) {
        return
      }

      const rect = canvas.getBoundingClientRect()
      const percent = Math.min(Math.max(0, clientX - rect.left), rect.width) / rect.width
      const newTime = percent * duration
      
      audio.currentTime = newTime
      setCurrentTime(newTime)

      if (!playing) {
        setPlaying(true)

        audio.play().catch((error) => {
          toast.error(`Error playing audio: ${error}`)
          setPlaying(false)
        })
      }
    }

    updateProgress(getClientX(e))
  }, [duration, playing])

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    const width = canvas.width
    const height = canvas.height
    const data = waveformData

    ctx.clearRect(0, 0, width, height)
    const barWidth = width / data.length
    const playedWidth = (currentTime / duration) * width
    const cornerRadius = 2
    
    data.forEach((value, index) => {
      const isLight = theme === Theme.light
      let color

      if (index * barWidth <= playedWidth) {
        color = isLight ? '#296DFF' : '#84ABFF'
      } else if ((index * barWidth / width) * duration <= hoverTime) {
        color = isLight ? 'rgba(21,90,239,.40)' : 'rgba(200, 206, 218, 0.28)'
      } else {
        color = isLight ? 'rgba(21,90,239,.20)' : 'rgba(200, 206, 218, 0.14)'
      }

      const barHeight = value * height
      const rectX = index * barWidth
      const rectY = (height - barHeight) / 2
      const rectWidth = barWidth * 0.5
      const rectHeight = barHeight
      
      ctx.lineWidth = 1
      ctx.fillStyle = color
      
      if (ctx.roundRect) {
        ctx.beginPath()
        ctx.roundRect(rectX, rectY, rectWidth, rectHeight, cornerRadius)
        ctx.fill()
      } else {
        ctx.fillRect(rectX, rectY, rectWidth, rectHeight)
      }
    })
  }, [currentTime, duration, hoverTime, theme, waveformData])
  
  useEffect(() => {
    drawWaveform()
  }, [drawWaveform, bufferedTime, hasStartedPlaying])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const audio = audioRef.current
    if (!canvas || !audio) {
      return
    }

    const clientX = 'touches' in e
      ? e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX
      : e.clientX

    if (clientX === undefined) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const percent = Math.min(Math.max(0, clientX - rect.left), rect.width) / rect.width
    const time = percent * duration
    
    for (let i = 0; i < audio.buffered.length; i++) {
      if (time >= audio.buffered.start(i) && time <= audio.buffered.end(i)) {
        setHoverTime(time)
        break
      }
    }
  }, [duration])

  return (
    <div className="flex h-9 min-w-[240px] max-w-[420px] items-center gap-2 radius-lg border border-components-panel-border-subtle bg-components-chat-input-audio-bg-alt p-2 shadow-xs backdrop-blur-xs">
      <audio 
        ref={audioRef} 
        src={src} 
        preload="auto" 
      >
        {srcs && srcs.map((srcUrl, index) => (<source key={index} src={srcUrl} />))}
      </audio>

      <button type="button" className="inline-flex shrink-0 cursor-pointer items-center justify-center border-none text-text-accent transition-all hover:text-text-accent-secondary disabled:text-components-button-primary-bg-disabled" onClick={onTogglePlay} disabled={!isAudioAvailable}>
        {
          playing
            ? (<div className="i-ri-pause-circle-fill h-5 w-5" />)
            : (<div className="i-ri-play-large-fill h-5 w-5" />)
        }
      </button>

      <div className={clsx(isAudioAvailable && 'grow')} hidden={!isAudioAvailable}>
        <div className="flex h-8 items-center justify-center">
          <canvas 
            ref={canvasRef}
            className="relative flex h-6 w-full grow cursor-pointer items-center justify-center" 
            onClick={handleCanvasInteraction} 
            onMouseMove={handleMouseMove} 
            onMouseDown={handleCanvasInteraction} 
            onTouchMove={handleMouseMove} 
            onTouchStart={handleCanvasInteraction} 
          />
          <div className="inline-flex min-w-[50px] items-center justify-center text-text-accent-secondary system-xs-medium">
            <span className="radius-lg px-0.5 py-1">{formatTime(duration)}</span>
          </div>
        </div>
      </div>
      <div 
        className="absolute left-0 top-0 flex h-full w-full items-center justify-center text-text-quaternary" 
        hidden={isAudioAvailable}
      >Audio source unavailable</div>
    </div>
  )
}

AudioPlayer.displayName = 'AudioPlayer'
export default AudioPlayer
