'use client'

import { usePreferencesStore } from '@/store/preferences-store'
import { baseColorConfigs, generateCustomColorStyles } from '@/lib/base-color-config'
import type { BaseColorName, CustomColorStyles } from '@/lib/base-color-config'

export interface UseBaseColorReturn {
  isCustom: boolean
  /** Current preset id from settings (still set when custom mode is active). */
  basePreset: BaseColorName
  hexValue: string
  rgbString: string
  // Tailwind classes (only when using presets)
  buttonBg?: string
  buttonBgHover?: string
  buttonBorder?: string
  text?: string
  textMid?: string
  bgLight?: string
  bgLighter?: string
  borderLight?: string
  shadowGlow?: string
  gradientFrom?: string
  gradientFromLight?: string
  gradientTo?: string
  // Inline styles (only when using custom)
  styles?: CustomColorStyles
}

/**
 * Hook to get the current base colour configuration
 * Returns either Tailwind classes (for presets) or inline styles (for custom colours)
 */
export function useBaseColor(): UseBaseColorReturn {
  const { baseColor, customColorMode, customColorHex } = usePreferencesStore()

  if (customColorMode) {
    const styles = generateCustomColorStyles(customColorHex)
    return {
      isCustom: true,
      basePreset: baseColor,
      hexValue: styles.hexValue,
      rgbString: styles.hexRgb,
      styles,
    }
  }

  const config = baseColorConfigs[baseColor]
  return {
    isCustom: false,
    basePreset: baseColor,
    hexValue: config.hexValue,
    rgbString: config.hexRgb,
    buttonBg: config.buttonBg,
    buttonBgHover: config.buttonBgHover,
    buttonBorder: config.buttonBorder,
    text: config.text,
    textMid: config.textMid,
    bgLight: config.bgLight,
    bgLighter: config.bgLighter,
    borderLight: config.borderLight,
    shadowGlow: config.shadowGlow,
    gradientFrom: config.gradientFrom,
    gradientFromLight: config.gradientFromLight,
    gradientTo: config.gradientTo,
  }
}
