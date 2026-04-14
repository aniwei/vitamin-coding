import * as React from 'react'
import data from './RefreshCcw01.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const RefreshCcw01 = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

RefreshCcw01.displayName = 'RefreshCcw01'

export default RefreshCcw01
