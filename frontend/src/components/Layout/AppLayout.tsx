'use client'

import dynamic from 'next/dynamic'
import { Header } from './Header'
import { cn } from '@/lib/utils'
import { useBaseColor } from '@/hooks/use-base-color'

function SidePanelDynamicLoading() {
  const bc = useBaseColor()
  return (
    <div className="h-full bg-gray-950 border-r border-gray-800 flex flex-col" style={{ width: 260 }}>
      <div className="h-14 px-4 flex items-center border-b border-gray-800/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600" />
          <div>
            <div className="h-5 w-20 bg-gray-800 rounded" />
            <div className="h-2 w-24 bg-gray-800 rounded mt-1" />
          </div>
        </div>
      </div>
      <div className="px-3 py-4">
        <div
          className={cn(
            'w-full py-2.5 px-4 rounded-lg text-white font-medium text-sm flex items-center justify-center gap-2 border shadow-sm',
            !bc.isCustom && `${bc.buttonBg} ${bc.buttonBgHover} ${bc.buttonBorder}`
          )}
          style={
            bc.isCustom ? { backgroundColor: bc.hexValue, borderColor: bc.hexValue } : undefined
          }
        >
          New Experiment
        </div>
      </div>
    </div>
  )
}

const SidePanel = dynamic(
  () => import('./SidePanel').then(m => m.SidePanel),
  {
    ssr: false,
    loading: () => <SidePanelDynamicLoading />,
  }
)

interface AppLayoutProps {
  children: React.ReactNode
  showSidebar?: boolean
}

export function AppLayout({ children, showSidebar = true }: AppLayoutProps) {
  return (
    <div className="flex h-screen bg-gray-900" suppressHydrationWarning>
      {/* Sidebar spans full height */}
      {showSidebar && <SidePanel />}

      {/* Right side: header + main content */}
      <div className="flex flex-col flex-1 overflow-hidden" suppressHydrationWarning>
        <Header />
        <main className="flex-1 bg-gray-900 transition-all duration-200 ease-out overflow-hidden relative" suppressHydrationWarning>
          {children}
        </main>
      </div>
    </div>
  )
}
