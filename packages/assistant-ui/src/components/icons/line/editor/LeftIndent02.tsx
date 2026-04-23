import * as React from 'react'
import data from './LeftIndent02.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const LeftIndent02 = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

LeftIndent02.displayName = 'LeftIndent02'

export default LeftIndent02
