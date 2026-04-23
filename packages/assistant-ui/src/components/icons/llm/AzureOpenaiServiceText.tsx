import * as React from 'react'
import data from './AzureOpenaiServiceText.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const AzureOpenaiServiceText = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

AzureOpenaiServiceText.displayName = 'AzureOpenaiServiceText'

export default AzureOpenaiServiceText
