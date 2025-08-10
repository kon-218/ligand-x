'use client'

import { Atom } from 'lucide-react'
import { motion } from 'framer-motion'
import { useUIStore } from '@/store/ui-store'

export function Header() {
  const { sidebarIconsWidth } = useUIStore()

  // Calculate logo size based on sidebar width (scale from 40px at 60px width to 56px at 200px width)
  const logoSize = Math.max(40, Math.min(56, (sidebarIconsWidth - 60) / (200 - 60) * (56 - 40) + 40))
  const iconSize = Math.max(20, Math.min(28, (sidebarIconsWidth - 60) / (200 - 60) * (28 - 20) + 20))

  return (
    <header className="h-16 bg-gray-900 border-b border-gray-700 flex items-center pr-6">
      {/* Logo and Title - Aligned with sidebar icons */}
      <div className="flex items-center flex-1 min-w-0" suppressHydrationWarning>
        {/* Spacer matching sidebar width exactly - logo centered within this space */}
        <motion.div
          className="flex-shrink-0 flex items-center justify-center"
          style={{ width: sidebarIconsWidth }}
          initial={{ width: 80 }}
          animate={{ width: sidebarIconsWidth }}
          transition={{
            duration: 0.2,
            ease: [0.4, 0, 0.2, 1]
          }}
          suppressHydrationWarning
        >
          {/* Enhanced Logo - centered to align with sidebar icons */}
          <motion.div
            className="relative bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20 transition-all duration-300 hover:shadow-purple-500/40 hover:scale-105 group"
            style={{
              width: `${logoSize}px`,
              height: `${logoSize}px`
            }}
            initial={{ width: 48, height: 48 }}
            animate={{ width: logoSize, height: logoSize }}
            transition={{
              duration: 0.2,
              ease: [0.4, 0, 0.2, 1]
            }}
            suppressHydrationWarning
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-purple-600 rounded-xl opacity-75 blur-sm group-hover:opacity-100 transition-opacity" />
            <Atom
              className="text-white relative z-10 group-hover:rotate-180 transition-transform duration-500"
              style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
              strokeWidth={2.5}
            />
          </motion.div>
        </motion.div>
        {/* Title Section - positioned after the logo */}
        <div className="flex items-center gap-3" suppressHydrationWarning>
          <div className="flex flex-col" suppressHydrationWarning>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent tracking-tight">
              Ligand-X
            </h1>
            <p className="text-xs text-gray-400 font-medium mt-0.5">Molecular Structure Analysis</p>
          </div>
        </div>
      </div>

      {/* User Menu (placeholder) */}
      <div className="flex items-center gap-4 flex-shrink-0" suppressHydrationWarning>
        <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-gray-300" suppressHydrationWarning>
          <span className="text-sm font-medium">U</span>
        </div>
      </div>
    </header>
  )
}
