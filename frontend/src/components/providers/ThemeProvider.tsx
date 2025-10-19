'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

/**
 * ThemeProvider - Wraps next-themes for hydration-safe theme management
 * 
 * Benefits over manual <html> class management:
 * - Handles SSR/hydration mismatch automatically
 * - Provides system theme detection
 * - Persists theme preference in localStorage
 * - Prevents flash of incorrect theme on page load
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
