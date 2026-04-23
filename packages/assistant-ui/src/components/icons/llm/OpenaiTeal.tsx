import * as React from 'react'
import data from './OpenaiTeal.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const OpenaiTeal = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

OpenaiTeal.displayName = 'OpenaiTeal'

export default OpenaiTeal
