import * as React from 'react'
import data from './End.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const End = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

End.displayName = 'End'

export default End
