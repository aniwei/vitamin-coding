import * as React from 'react'
import data from './VideoSupportIcon.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const VideoSupportIcon = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

VideoSupportIcon.displayName = 'VideoSupportIcon'

export default VideoSupportIcon
