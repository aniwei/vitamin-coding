import * as React from 'react'
import data from './OpenaiTransparent.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const OpenaiTransparent = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

OpenaiTransparent.displayName = 'OpenaiTransparent'

export default OpenaiTransparent
