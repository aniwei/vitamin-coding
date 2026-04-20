import type { ReactNode } from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

// Phase 0 最小实现：仅包一层 next-themes。
// Phase 2 会从 src/components/layouts/theme-provider.tsx 迁入完整的 ThemeStyleProvider（含动态 CSS 变量注入）。
export function ThemeProvider(props: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props} />
}

export function ThemeStyleProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
