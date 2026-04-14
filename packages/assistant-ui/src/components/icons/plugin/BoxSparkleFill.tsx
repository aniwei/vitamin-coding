import * as React from 'react'
import data from './BoxSparkleFill.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const BoxSparkleFill = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

BoxSparkleFill.displayName = 'BoxSparkleFill'

export default BoxSparkleFill
