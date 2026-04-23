import * as React from 'react'
import data from './Collapse.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const Collapse = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

Collapse.displayName = 'Collapse'

export default Collapse
