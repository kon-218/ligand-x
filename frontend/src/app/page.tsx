'use client'

import { AppLayout } from '@/components/Layout/AppLayout'
import { MolecularViewer } from '@/components/MolecularViewer'
import { OverlayPages } from '@/components/Layout/OverlayPages'
import { useUIStore } from '@/store/ui-store'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

const LibraryTool = dynamic(() => import('@/components/Tools/LibraryTool').then(m => m.LibraryTool), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
    </div>
  ),
})

export default function Home() {
  const { activeOverlay } = useUIStore()

  return (
    <AppLayout>
      {/* Viewer always rendered behind */}
      <div className="absolute z-0" style={{ top: 0, left: 0, right: 0, bottom: 0 }}>
        <MolecularViewer showControls={true} />
      </div>

      {/* Library overlay on top when active */}
      {activeOverlay === 'library' && (
        <div className="absolute z-20 flex flex-col h-full bg-gray-900" style={{ top: 0, left: 0, right: 0, bottom: 0 }}>
          <div className="flex items-center px-6 min-h-[53px] text-sm text-gray-400 border-b border-gray-800">
            Manage and browse your molecular structure collection
          </div>
          <LibraryTool />
        </div>
      )}

      <OverlayPages />
    </AppLayout>
  )
}
