'use client'

import { cn } from '@/lib/utils'
import { useUIStore, type OverlayId } from '@/store/ui-store'

export function Header() {
  const { activeOverlay, setActiveOverlay, closeOverlay } = useUIStore()

  const navItems: { id: OverlayId; label: string }[] = [
    { id: 'library', label: 'Library' },
  ]

  return (
    <header className="h-14 bg-gray-950 border-b border-gray-800/50 flex items-center px-6">
      {/* Navigation Tabs */}
      <nav className="flex items-center gap-1">
        {navItems.map((item) => {
          const isActive = activeOverlay === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveOverlay(isActive ? null : item.id)}
              className={cn(
                'h-8 px-3 text-sm font-medium rounded-lg transition-colors',
                isActive
                  ? 'text-white bg-gray-800'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              )}
            >
              {item.label}
            </button>
          )
        })}

        {/* Viewer button */}
        <button
          onClick={closeOverlay}
          className={cn(
            'h-8 px-3 text-sm font-medium rounded-lg transition-colors',
            activeOverlay === null
              ? 'text-white bg-gray-800'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
          )}
        >
          Viewer
        </button>
      </nav>

      {/* Spacer */}
      <div className="flex-1" />
    </header>
  )
}
