import * as React from 'react'
import data from './AudioSupportIcon.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const AudioSupportIcon = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

AudioSupportIcon.displayName = 'AudioSupportIcon'

export default AudioSupportIcon
