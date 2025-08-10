'use client'

import { useMolecularStore } from '@/store/molecular-store'
import type { VisualizationStyle, SurfaceType } from '@/types/molecular'

export function VisualizationTool() {
  const {
    visualizationState,
    setVisualizationStyle,
    toggleSurface,
    setSurfaceType,
    setSurfaceOpacity,
    toggleComponent,
  } = useMolecularStore()

  const styles: VisualizationStyle[] = ['cartoon', 'stick', 'ball-stick', 'sphere', 'line']
  const surfaceTypes: SurfaceType[] = ['VDW', 'SAS', 'MS']

  return (
    <div className="p-4 space-y-6">
      {/* Style Selection */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">Style</h3>
        <div className="grid grid-cols-2 gap-2">
          {styles.map((style) => (
            <button
              key={style}
              onClick={() => setVisualizationStyle(style)}
              className={`px-3 py-2 rounded text-sm ${
                visualizationState.style === style
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {style.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Surface Controls */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-300">Surface</h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={visualizationState.showSurface}
              onChange={(e) => toggleSurface(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
        {visualizationState.showSurface && (
          <div className="space-y-3">
            <select
              value={visualizationState.surfaceType}
              onChange={(e) => setSurfaceType(e.target.value as SurfaceType)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
            >
              {surfaceTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <div>
              <label className="text-xs text-gray-400">Opacity: {visualizationState.surfaceOpacity}</label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={visualizationState.surfaceOpacity}
                onChange={(e) => setSurfaceOpacity(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>

      {/* Component Toggles */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">Components</h3>
        <div className="space-y-2">
          {(['protein', 'ligands', 'water', 'ions'] as const).map((component) => (
            <label key={component} className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-gray-300 capitalize">{component}</span>
              <input
                type="checkbox"
                checked={visualizationState[`show${component.charAt(0).toUpperCase() + component.slice(1)}` as keyof typeof visualizationState] as boolean}
                onChange={(e) => toggleComponent(component, e.target.checked)}
                className="w-4 h-4"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
