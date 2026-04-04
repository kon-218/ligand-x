'use client'

import { useMemo } from 'react'
import { usePreferencesStore } from '@/store/preferences-store'
import {
  warmAccentConfigs,
  generateCustomWarmAccentStyles,
  type AccentColorConfig,
  type CustomWarmAccentStyles,
  type WarmAccentPreset,
} from '@/lib/accent-config'

export interface UseWarmAccentReturn {
  isCustom: boolean
  preset: WarmAccentPreset
  hexValue: string
  rgbString: string
  config: AccentColorConfig | null
  customStyles: CustomWarmAccentStyles | null
}

export function useWarmAccent(): UseWarmAccentReturn {
  const { warmAccentPreset, warmAccentCustomMode, warmAccentCustomHex } = usePreferencesStore()

  return useMemo(() => {
    if (warmAccentCustomMode) {
      const customStyles = generateCustomWarmAccentStyles(warmAccentCustomHex)
      return {
        isCustom: true,
        preset: warmAccentPreset,
        hexValue: customStyles.hexValue,
        rgbString: customStyles.rgbString,
        config: null,
        customStyles,
      }
    }
    const config = warmAccentConfigs[warmAccentPreset]
    return {
      isCustom: false,
      preset: warmAccentPreset,
      hexValue: config.hexValue,
      rgbString: config.hexRgb,
      config,
      customStyles: null,
    }
  }, [warmAccentCustomMode, warmAccentCustomHex, warmAccentPreset])
}
