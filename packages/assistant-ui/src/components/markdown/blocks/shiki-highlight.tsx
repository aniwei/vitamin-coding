import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { Fragment } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { codeToHast } from 'shiki/bundle/web'

import type { JSX } from 'react'
import type { BundledLanguage, BundledTheme } from 'shiki/bundle/web'

interface HighlightOptions {
  code: string
  language: BundledLanguage
  theme: BundledTheme
}

export const highlight = async ({
  code,
  language,
  theme,
}: HighlightOptions): Promise<JSX.Element> => {
  const hast = await codeToHast(code, {
    lang: language,
    theme,
  })

  return toJsxRuntime(hast, {
    Fragment,
    jsx,
    jsxs,
  }) as JSX.Element
}
