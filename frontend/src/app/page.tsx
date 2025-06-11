'use client'

import { Header } from '@/components/Layout/Header'
import { SidePanel } from '@/components/Layout/SidePanel'
import { MolecularViewer } from '@/components/MolecularViewer'

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-gray-900" suppressHydrationWarning>
      <Header />
      <div className="flex flex-1 overflow-hidden bg-gray-900" suppressHydrationWarning>
        <SidePanel />
        <main className="flex-1 bg-gray-900 transition-all duration-200 ease-out" suppressHydrationWarning>
          <MolecularViewer 
            showControls={true}
          />
        </main>
      </div>
    </div>
  )
}
