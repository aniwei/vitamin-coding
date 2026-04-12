// GENERATE BY script
// DON NOT EDIT IT MANUALLY

import * as React from 'react'
import clsx from 'clsx'
import s from './TongyiText.module.css'

const Icon = (
  {
    ref,
    className,
    ...restProps
  }: React.DetailedHTMLProps<React.HTMLAttributes<HTMLSpanElement>, HTMLSpanElement> & {
    ref?: React.RefObject<HTMLSpanElement>
  },
) => <span className={clsx(s.wrapper, className)} {...restProps} ref={ref} />

Icon.displayName = 'TongyiText'

export default Icon
