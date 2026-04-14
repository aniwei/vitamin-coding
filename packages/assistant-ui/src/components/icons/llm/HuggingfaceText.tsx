import * as React from 'react'
import data from './HuggingfaceText.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const HuggingfaceText = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

HuggingfaceText.displayName = 'HuggingfaceText'

export default HuggingfaceText
