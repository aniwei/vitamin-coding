import * as React from 'react'
import data from './Refresh.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const Refresh = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

Refresh.displayName = 'Refresh'

export default Refresh
