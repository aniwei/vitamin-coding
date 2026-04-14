import Button from '@/components/button'
import Modal from '@/components/modal'
import { RiCloseLine } from '@remixicon/react'
import { Link } from 'react-router-dom'
import * as React from 'react'

interface AboutProps {
  onCancel: () => void
}

export const About: React.FC<AboutProps> = ({ onCancel}) => {
  const version = '0.0.1'
  const latestVersion = '0.0.1'
  const isLatest = false
  const releaseNotes = ''

  return (
    <Modal
      isShow
      onClose={onCancel}
      className="w-[480px]! max-w-[480px]! px-6! py-4!"
    >
      <div className="relative">
        <div className="absolute right-0 top-0 flex h-8 w-8 cursor-pointer items-center justify-center" onClick={onCancel}>
          <RiCloseLine className="h-4 w-4 text-text-tertiary" />
        </div>
        <div className="flex flex-col items-center gap-4 py-8">
          
          <div className="text-center text-xs font-normal text-text-tertiary">
            Version {version}
          </div>
        </div>
        <div className="-mx-8 mb-4 h-[0.5px] bg-divider-regular" />
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-text-tertiary">
            {latestVersion}
          </div>
          <div className="flex items-center">
            <Button className="mr-2" size="small">
              <Link
                to="https://github.com/langgenius/dify/releases"
                target="_blank"
                rel="noopener noreferrer"
              >Change Log</Link>
            </Button>
            {
              !isLatest && (
                <Button variant="primary" size="small">
                  <Link
                    to={releaseNotes}
                    target="_blank"
                    rel="noopener noreferrer"
                  >Update Now</Link>
                </Button>
              )
            }
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default About