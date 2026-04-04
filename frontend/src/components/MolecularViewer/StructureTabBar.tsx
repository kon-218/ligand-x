'use client'

import { useMolecularStore } from '@/store/molecular-store'
import { usePreferencesStore } from '@/store/preferences-store'
import { baseColorConfigs } from '@/lib/base-color-config'
import { useBaseColor } from '@/hooks/use-base-color'
import { X, Beaker, FileText, Image } from 'lucide-react'
import { cn } from '@/lib/utils'

export function StructureTabBar() {
  const {
    structureTabs,
    inputFileTabs,
    imageFileTabs,
    activeTabId,
    setActiveTab,
    removeStructureTab,
    removeInputFileTab,
    removeImageFileTab
  } = useMolecularStore()
  const { baseColor } = usePreferencesStore()
  const bc = baseColorConfigs[baseColor]
  const bc_active = useBaseColor()

  const allTabs = [
    ...structureTabs.map(tab => ({ ...tab, type: 'structure' as const })),
    ...inputFileTabs.map(tab => ({ ...tab, type: 'input' as const })),
    ...imageFileTabs.map(tab => ({ ...tab, type: 'image' as const }))
  ].sort((a, b) => a.createdAt - b.createdAt)

  if (allTabs.length === 0) {
    return null
  }

  const handleCloseTab = (e: React.MouseEvent, tabId: string, type: 'structure' | 'input' | 'image') => {
    e.stopPropagation()
    if (type === 'structure') {
      removeStructureTab(tabId)
    } else if (type === 'input') {
      removeInputFileTab(tabId)
    } else if (type === 'image') {
      removeImageFileTab(tabId)
    }
  }

  return (
    <div className="shrink-0 bg-gray-900 border-b border-gray-800/50 flex items-center gap-1 px-3 py-2.5 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900 hover:scrollbar-thumb-gray-600 flex-nowrap" suppressHydrationWarning>
      {allTabs.map((tab) => {
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            className={cn(
              'flex items-center h-8 min-h-8 max-h-8 shrink-0 gap-2 px-3 rounded-md border border-transparent box-border transition-colors duration-150 group cursor-pointer',
              isActive && !bc_active.isCustom
                ? `${bc_active.buttonBg} text-white ring-1 ring-inset ring-white/25`
                : !isActive && 'bg-gray-800 text-gray-300 hover:bg-gray-700',
              isActive && bc_active.isCustom && 'ring-1 ring-inset ring-white/25'
            )}
            style={isActive && bc_active.isCustom ? {
              backgroundColor: bc_active.hexValue,
              color: 'white',
            } : undefined}
          >
            <div
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 h-full"
            >
              {tab.type === 'input' ? (
                <FileText className="w-3.5 h-3.5 flex-shrink-0" />
              ) : tab.type === 'image' ? (
                <Image className="w-3.5 h-3.5 flex-shrink-0" />
              ) : (
                <Beaker className="w-3.5 h-3.5 flex-shrink-0" />
              )}
              <span className="text-xs font-medium whitespace-nowrap max-w-[120px] truncate" title={tab.name}>
                {tab.name}
              </span>
            </div>
            <button
              onClick={(e) => handleCloseTab(e, tab.id, tab.type)}
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors',
                isActive && !bc_active.isCustom
                  ? bc_active.buttonBgHover
                  : (isActive && bc_active.isCustom ? '' : 'hover:bg-gray-600 opacity-0 group-hover:opacity-100')
              )}
              style={isActive && bc_active.isCustom ? {
                cursor: 'pointer',
              } : undefined}
              onMouseEnter={(e) => {
                if (isActive && bc_active.isCustom) {
                  (e.target as HTMLElement).style.backgroundColor = `rgba(${bc_active.rgbString}, 0.2)`
                }
              }}
              onMouseLeave={(e) => {
                if (isActive && bc_active.isCustom) {
                  (e.target as HTMLElement).style.backgroundColor = 'transparent'
                }
              }}
              title="Close tab"
              type="button"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
