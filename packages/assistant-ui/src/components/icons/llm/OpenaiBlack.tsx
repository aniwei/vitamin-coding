import * as React from 'react'
import data from './OpenaiBlack.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const OpenaiBlack = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

OpenaiBlack.displayName = 'OpenaiBlack'

export default OpenaiBlack
