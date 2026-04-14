import * as React from 'react'
import data from './AnthropicShortLight.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const AnthropicShortLight = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

AnthropicShortLight.displayName = 'AnthropicShortLight'

export default AnthropicShortLight
