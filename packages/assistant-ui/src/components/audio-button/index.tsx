import { useState } from 'react'
import { AudioPlayerManager } from '@/components/audio-btn/audio.player.manager'
import Loading from '@/components/loading'
import Tooltip from '@/components/ui/tooltip'
import s from './index.module.css'
import { useLocation, useParams } from 'react-router-dom'

interface AudioBtnProps {
  id?: string
  voice?: string
  value?: string
  className?: string
  isAudition?: boolean
  noCache?: boolean
}

type AudioState = 'initial' | 'loading' | 'playing' | 'paused' | 'ended'

const AudioButton: React.FC<AudioBtnProps> = ({
  id,
  voice,
  value,
  className,
  isAudition,
}) => {
  const [state, setAudioState] = useState<AudioState>('initial')

  const params = useParams()
  const pathname = useLocation().pathname

  const onFinished = (event: string): void => {
    switch (event) {
      case 'ended':
        setAudioState('ended')
        break
      case 'paused':
        setAudioState('ended')
        break
      case 'loaded':
        setAudioState('loading')
        break
      case 'play':
        setAudioState('playing')
        break
      case 'error':
        setAudioState('ended')
        break
    }
  }
  let url = ''
  let isPublic = false

  if (params.token) {
    url = '/text-to-audio'
    isPublic = true
  }
  else if (params.appId) {
    if (pathname.search('explore/installed') > -1)
      url = `/installed-apps/${params.appId}/text-to-audio`
    else
      url = `/apps/${params.appId}/text-to-audio`
  }
  const handleToggle = async () => {
    if (state === 'playing' || state === 'loading') {
      setTimeout(() => setAudioState('paused'), 1)
      AudioPlayerManager.getInstance().getAudioPlayer(url, isPublic, id, value, voice, onFinished).pauseAudio()
    } else {
      setTimeout(() => setAudioState('loading'), 1)
      AudioPlayerManager.getInstance().getAudioPlayer(url, isPublic, id, value, voice, onFinished).playAudio()
    }
  }

  return (
    <div className={`inline-flex items-center justify-center ${(state === 'loading' || state === 'playing') ? 'mr-1' : className}`}>
      <Tooltip
        popupContent={{
          loading: 'loading',
          playing: 'playing',
          paused: 'pause',
          ended: 'play',
          initial: 'play',
        }[state]}
      >
        <button
          type="button"
          disabled={state === 'loading'}
          className={`box-border flex h-6 w-6 cursor-pointer items-center justify-center ${isAudition ? 'p-0.5' : 'rounded-md bg-white p-0'}`}
          onClick={handleToggle}
        >
          {
            state === 'loading'
              ? <div className="flex h-full w-full items-center justify-center rounded-md">
                  <Loading />
                </div>
              : <div className="flex h-full w-full items-center justify-center rounded-md hover:bg-gray-50">
                  <div className={`h-4 w-4 ${(state === 'playing') ? s.pauseIcon : s.playIcon}`}></div>
                </div>
          }
        </button>
      </Tooltip>
    </div>
  )
}

export default AudioButton
