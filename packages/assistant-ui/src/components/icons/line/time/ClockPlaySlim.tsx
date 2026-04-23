import * as React from 'react'
import data from './ClockPlaySlim.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const ClockPlaySlim = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

ClockPlaySlim.displayName = 'ClockPlaySlim'

export default ClockPlaySlim
