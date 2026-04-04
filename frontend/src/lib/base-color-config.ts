/**
 * Base colour configuration system for the application UI chrome.
 * Provides Tailwind class mappings and hex values for user-selectable colours.
 * All class strings are literals (not templates) so Tailwind's scanner detects them at build time.
 */

import type { CSSProperties } from 'react'

export type BaseColorName = 'cyan' | 'teal' | 'blue' | 'indigo' | 'magenta' | 'fuchsia' | 'rose'

export interface BaseColorConfig {
  // Buttons and interactive elements
  buttonBg: string
  buttonBgHover: string
  buttonBorder: string

  // Text and icons
  text: string
  textMid: string

  // Backgrounds (light variants for overlays, glows, highlights)
  bgLight: string
  bgLighter: string

  // Borders
  borderLight: string
  borderMid: string

  // Gradient directional stops
  gradientFrom: string
  gradientFromLight: string
  gradientTo: string

  // Shadow/glow effects
  shadowGlow: string

  // Hex values for inline styles (e.g., tool card hover glows)
  hexValue: string
  hexRgb: string

  // Composite classes (e.g., for tabs where multiple classes apply)
  activeTab: string
  activeTabHover: string

  /** Library molecule cards: MW / LogP / Atoms / Bonds tinted cells */
  libraryPropCell: string
  libraryPropLabel: string
  libraryPropValue: string
}

export const baseColorConfigs: Record<BaseColorName, BaseColorConfig> = {
  cyan: {
    buttonBg: 'bg-cyan-600',
    buttonBgHover: 'hover:bg-cyan-700',
    buttonBorder: 'border-cyan-500',
    text: 'text-cyan-400',
    textMid: 'text-cyan-500',
    bgLight: 'bg-cyan-500/10',
    bgLighter: 'bg-cyan-500/20',
    borderLight: 'border-cyan-500/20',
    borderMid: 'border-cyan-500/50',
    gradientFrom: 'from-cyan-500',
    gradientFromLight: 'from-cyan-500/20',
    gradientTo: 'to-blue-600',
    shadowGlow: 'shadow-cyan-500/20',
    hexValue: '#06b6d4',
    hexRgb: '6, 182, 212',
    activeTab: 'bg-cyan-600 text-white shadow-md',
    activeTabHover: 'hover:bg-cyan-700',
    libraryPropCell: 'bg-cyan-950/60 border border-cyan-900/45',
    libraryPropLabel: 'text-cyan-400',
    libraryPropValue: 'text-cyan-50',
  },
  teal: {
    buttonBg: 'bg-teal-600',
    buttonBgHover: 'hover:bg-teal-700',
    buttonBorder: 'border-teal-500',
    text: 'text-teal-400',
    textMid: 'text-teal-500',
    bgLight: 'bg-teal-500/10',
    bgLighter: 'bg-teal-500/20',
    borderLight: 'border-teal-500/20',
    borderMid: 'border-teal-500/50',
    gradientFrom: 'from-teal-500',
    gradientFromLight: 'from-teal-500/20',
    gradientTo: 'to-cyan-600',
    shadowGlow: 'shadow-teal-500/20',
    hexValue: '#14b8a6',
    hexRgb: '20, 184, 166',
    activeTab: 'bg-teal-600 text-white shadow-md',
    activeTabHover: 'hover:bg-teal-700',
    libraryPropCell: 'bg-teal-950/60 border border-teal-900/45',
    libraryPropLabel: 'text-teal-400',
    libraryPropValue: 'text-teal-50',
  },
  blue: {
    buttonBg: 'bg-blue-600',
    buttonBgHover: 'hover:bg-blue-700',
    buttonBorder: 'border-blue-500',
    text: 'text-blue-400',
    textMid: 'text-blue-500',
    bgLight: 'bg-blue-500/10',
    bgLighter: 'bg-blue-500/20',
    borderLight: 'border-blue-500/20',
    borderMid: 'border-blue-500/50',
    gradientFrom: 'from-blue-500',
    gradientFromLight: 'from-blue-500/20',
    gradientTo: 'to-cyan-600',
    shadowGlow: 'shadow-blue-500/20',
    hexValue: '#3b82f6',
    hexRgb: '59, 130, 246',
    activeTab: 'bg-blue-600 text-white shadow-md',
    activeTabHover: 'hover:bg-blue-700',
    libraryPropCell: 'bg-blue-950/60 border border-blue-900/45',
    libraryPropLabel: 'text-blue-400',
    libraryPropValue: 'text-blue-50',
  },
  indigo: {
    buttonBg: 'bg-indigo-600',
    buttonBgHover: 'hover:bg-indigo-700',
    buttonBorder: 'border-indigo-500',
    text: 'text-indigo-400',
    textMid: 'text-indigo-500',
    bgLight: 'bg-indigo-500/10',
    bgLighter: 'bg-indigo-500/20',
    borderLight: 'border-indigo-500/20',
    borderMid: 'border-indigo-500/50',
    gradientFrom: 'from-indigo-500',
    gradientFromLight: 'from-indigo-500/20',
    gradientTo: 'to-blue-600',
    shadowGlow: 'shadow-indigo-500/20',
    hexValue: '#6366f1',
    hexRgb: '99, 102, 241',
    activeTab: 'bg-indigo-600 text-white shadow-md',
    activeTabHover: 'hover:bg-indigo-700',
    libraryPropCell: 'bg-indigo-950/60 border border-indigo-900/45',
    libraryPropLabel: 'text-indigo-400',
    libraryPropValue: 'text-indigo-50',
  },
  magenta: {
    buttonBg: 'bg-[#ea0674]',
    buttonBgHover: 'hover:bg-[#c50562]',
    buttonBorder: 'border-[#f6339a]',
    text: 'text-[#fb7eb5]',
    textMid: 'text-[#f472b0]',
    bgLight: 'bg-[#ea0674]/10',
    bgLighter: 'bg-[#ea0674]/20',
    borderLight: 'border-[#ea0674]/20',
    borderMid: 'border-[#ea0674]/50',
    gradientFrom: 'from-[#ea0674]',
    gradientFromLight: 'from-[#ea0674]/20',
    gradientTo: 'to-[#9d174d]',
    shadowGlow: 'shadow-[0_0_20px_rgba(234,6,116,0.2)]',
    hexValue: '#ea0674',
    hexRgb: '234, 6, 116',
    activeTab: 'bg-[#ea0674] text-white shadow-md',
    activeTabHover: 'hover:bg-[#c50562]',
    libraryPropCell: 'bg-pink-950/60 border border-pink-900/45',
    libraryPropLabel: 'text-pink-400',
    libraryPropValue: 'text-pink-50',
  },
  fuchsia: {
    buttonBg: 'bg-fuchsia-600',
    buttonBgHover: 'hover:bg-fuchsia-700',
    buttonBorder: 'border-fuchsia-500',
    text: 'text-fuchsia-400',
    textMid: 'text-fuchsia-500',
    bgLight: 'bg-fuchsia-500/10',
    bgLighter: 'bg-fuchsia-500/20',
    borderLight: 'border-fuchsia-500/20',
    borderMid: 'border-fuchsia-500/50',
    gradientFrom: 'from-fuchsia-500',
    gradientFromLight: 'from-fuchsia-500/20',
    gradientTo: 'to-purple-700',
    shadowGlow: 'shadow-fuchsia-500/20',
    hexValue: '#c026d3',
    hexRgb: '192, 38, 211',
    activeTab: 'bg-fuchsia-600 text-white shadow-md',
    activeTabHover: 'hover:bg-fuchsia-700',
    libraryPropCell: 'bg-fuchsia-950/60 border border-fuchsia-900/45',
    libraryPropLabel: 'text-fuchsia-400',
    libraryPropValue: 'text-fuchsia-50',
  },
  rose: {
    buttonBg: 'bg-rose-600',
    buttonBgHover: 'hover:bg-rose-700',
    buttonBorder: 'border-rose-500',
    text: 'text-rose-400',
    textMid: 'text-rose-500',
    bgLight: 'bg-rose-500/10',
    bgLighter: 'bg-rose-500/20',
    borderLight: 'border-rose-500/20',
    borderMid: 'border-rose-500/50',
    gradientFrom: 'from-rose-500',
    gradientFromLight: 'from-rose-500/20',
    gradientTo: 'to-pink-700',
    shadowGlow: 'shadow-rose-500/20',
    hexValue: '#e11d48',
    hexRgb: '225, 29, 72',
    activeTab: 'bg-rose-600 text-white shadow-md',
    activeTabHover: 'hover:bg-rose-700',
    libraryPropCell: 'bg-rose-950/60 border border-rose-900/45',
    libraryPropLabel: 'text-rose-400',
    libraryPropValue: 'text-rose-50',
  },
}

export const BASE_COLOR_LABELS: Record<BaseColorName, string> = {
  cyan: 'Cyan',
  teal: 'Teal',
  blue: 'Blue',
  indigo: 'Indigo',
  magenta: 'Magenta',
  fuchsia: 'Fuchsia',
  rose: 'Rose',
}

/**
 * Parse hex colour to RGB components
 */
export function hexToRgb(hexValue: string): { r: number; g: number; b: number; rgbString: string } {
  const hex = hexValue.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  return {
    r,
    g,
    b,
    rgbString: `${r}, ${g}, ${b}`,
  }
}

/**
 * Create inline style object from custom hex colour
 * For custom colours, we use inline styles instead of Tailwind classes
 */
export interface CustomColorStyles {
  buttonBg: CSSProperties
  buttonBgHover: CSSProperties
  text: CSSProperties
  textMid: CSSProperties
  bgLight: CSSProperties
  bgLighter: CSSProperties
  borderLight: CSSProperties
  borderMid: CSSProperties
  hexValue: string
  hexRgb: string
  shadowGlow: CSSProperties
}

export interface LibraryPropBadgeStyles {
  cell: CSSProperties
  label: CSSProperties
  value: CSSProperties
}

/** Dark-tinted property cells for Library cards when base colour is custom */
export function generateLibraryPropBadgeStyles(hexValue: string): LibraryPropBadgeStyles {
  const { rgbString } = hexToRgb(hexValue)
  return {
    cell: {
      backgroundColor: `rgba(${rgbString}, 0.12)`,
      borderColor: `rgba(${rgbString}, 0.4)`,
      borderWidth: 1,
      borderStyle: 'solid',
    },
    label: {
      color: `color-mix(in srgb, white 58%, ${hexValue} 42%)`,
    },
    value: {
      color: `color-mix(in srgb, white 96%, ${hexValue} 4%)`,
    },
  }
}

export function generateCustomColorStyles(hexValue: string): CustomColorStyles {
  const rgb = hexToRgb(hexValue)

  return {
    buttonBg: {
      backgroundColor: hexValue,
    },
    buttonBgHover: {
      backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`,
    },
    text: {
      color: hexValue,
    },
    textMid: {
      color: hexValue,
    },
    bgLight: {
      backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`,
    },
    bgLighter: {
      backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`,
    },
    borderLight: {
      borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`,
    },
    borderMid: {
      borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`,
    },
    hexValue: hexValue,
    hexRgb: rgb.rgbString,
    shadowGlow: {
      boxShadow: `0 0 20px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`,
    },
  }
}
