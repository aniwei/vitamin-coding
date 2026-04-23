import * as React from 'react'
import data from './ArtificialBrain.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const ArtificialBrain = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

ArtificialBrain.displayName = 'ArtificialBrain'

export default ArtificialBrain
