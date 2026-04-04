import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BaseColorName } from '@/lib/base-color-config'
import type { WarmAccentPreset } from '@/lib/accent-config'

interface PreferencesStore {
  baseColor: BaseColorName
  customColorMode: boolean
  customColorHex: string
  setBaseColor: (color: BaseColorName) => void
  setCustomColor: (hex: string) => void
  enableCustomMode: (enabled: boolean) => void

  warmAccentPreset: WarmAccentPreset
  warmAccentCustomMode: boolean
  warmAccentCustomHex: string
  setWarmAccentPreset: (preset: WarmAccentPreset) => void
  setWarmAccentCustomHex: (hex: string) => void
  enableWarmAccentCustomMode: (enabled: boolean) => void
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      baseColor: 'cyan',
      customColorMode: false,
      customColorHex: '#06b6d4',
      setBaseColor: (color) => set({ baseColor: color, customColorMode: false }),
      setCustomColor: (hex) => set({ customColorHex: hex, customColorMode: true }),
      enableCustomMode: (enabled) => set({ customColorMode: enabled }),

      warmAccentPreset: 'ochre',
      warmAccentCustomMode: false,
      warmAccentCustomHex: '#ca8a04',
      setWarmAccentPreset: (preset) =>
        set({ warmAccentPreset: preset, warmAccentCustomMode: false }),
      setWarmAccentCustomHex: (hex) => set({ warmAccentCustomHex: hex, warmAccentCustomMode: true }),
      enableWarmAccentCustomMode: (enabled) => set({ warmAccentCustomMode: enabled }),
    }),
    { name: 'ligandx-preferences' }
  )
)
