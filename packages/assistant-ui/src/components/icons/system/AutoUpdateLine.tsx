import * as React from 'react'
import data from './AutoUpdateLine.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const AutoUpdateLine = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

AutoUpdateLine.displayName = 'AutoUpdateLine'

export default AutoUpdateLine
