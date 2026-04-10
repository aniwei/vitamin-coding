import IconBase from '@/components/icons/IconBase'
import data from './Variable02.json'
import * as React from 'react'
import type { IconData } from '@/components/icons/IconBase'

const Icon = (
  {
    ref,
    ...props
  }: React.SVGProps<SVGSVGElement> & {
    ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>
  },
) => <IconBase {...props} ref={ref} data={data as IconData} />

Icon.displayName = 'Variable02'

export default Icon
