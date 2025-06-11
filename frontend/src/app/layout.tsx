import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Ligand-X - Molecular Structure Analysis",
  description: "Advanced molecular structure processing and analysis platform",
}

import { NotificationSystem } from "@/components/ui/NotificationSystem"
import { StoreProvider } from "@/components/providers/StoreProvider"
import { ThemeProvider } from "@/components/providers/ThemeProvider"
import { JobWebSocketProvider } from "@/components/providers/JobWebSocketProvider"
import { ConsoleErrorSuppressor } from "@/components/providers/ConsoleErrorSuppressor"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className}`} suppressHydrationWarning>
        <ConsoleErrorSuppressor />
        <ThemeProvider>
          <StoreProvider>
            <JobWebSocketProvider>
              <NotificationSystem />
              {children}
            </JobWebSocketProvider>
          </StoreProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
