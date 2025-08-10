'use client'

import { useMolecularStore } from '@/store/molecular-store'
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
    <div className="bg-gray-900 border-b border-gray-700 flex items-center gap-1 px-2 py-1.5 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900 hover:scrollbar-thumb-gray-600 flex-nowrap flex-shrink-0 min-h-[40px]" suppressHydrationWarning>
      {allTabs.map((tab) => {
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-150 group flex-shrink-0 cursor-pointer',
              isActive
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            )}
          >
            <div
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2"
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
                'flex-shrink-0 p-0.5 rounded transition-colors',
                isActive
                  ? 'hover:bg-blue-700'
                  : 'hover:bg-gray-600 opacity-0 group-hover:opacity-100'
              )}
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
