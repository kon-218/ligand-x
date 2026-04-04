/**
 * Warm accent colours for Projects, Library “Tools” actions, and related chrome.
 * Presets use literal Tailwind classes; custom mode uses inline styles (see useWarmAccent).
 */

import type { CSSProperties } from 'react'
import { hexToRgb } from '@/lib/base-color-config'

export type WarmAccentPreset =
  | 'ochre'
  | 'amber'
  | 'copper'
  | 'honey'
  | 'orchid'
  | 'raspberry'
  | 'plum'

export interface AccentColorConfig {
  buttonBg: string
  buttonBgHover: string
  buttonBorder: string
  iconBg: string
  iconBgGradient: string
  iconBorder: string
  iconColor: string
  shadowGlow: string
  shadowGlowHover: string
  gradientFrom: string
  gradientTo: string
  gradientHoverFrom: string
  gradientHoverTo: string
  cardGlowGradient: string
  cardBorderGlow: string
  cardIconBorderHover: string
  cardIconColor: string
  cardIconHoverShadow: string
  menuItemHoverClass: string
  hexValue: string
  hexRgb: string
}

export const WARM_ACCENT_LABELS: Record<WarmAccentPreset, string> = {
  ochre: 'Golden ochre',
  amber: 'Amber',
  copper: 'Copper',
  honey: 'Honey gold',
  orchid: 'Orchid',
  raspberry: 'Raspberry',
  plum: 'Plum',
}

export const warmAccentConfigs: Record<WarmAccentPreset, AccentColorConfig> = {
  ochre: {
    buttonBg: 'bg-yellow-700',
    buttonBgHover: 'hover:bg-yellow-800',
    buttonBorder: 'border-yellow-600',
    iconBg: 'bg-yellow-600/15',
    iconBgGradient: 'shadow-[0_0_30px_rgba(202,138,4,0.15)]',
    iconBorder: 'border-yellow-500/45',
    iconColor: 'text-yellow-400',
    shadowGlow: 'shadow-[0_0_20px_rgba(202,138,4,0.2)]',
    shadowGlowHover: 'hover:shadow-[0_0_30px_rgba(202,138,4,0.4)]',
    gradientFrom: 'from-yellow-500',
    gradientTo: 'to-yellow-600',
    gradientHoverFrom: 'hover:from-yellow-600',
    gradientHoverTo: 'hover:to-yellow-700',
    cardGlowGradient: 'from-yellow-600/5',
    cardBorderGlow: 'inset 0 0 0 1px rgba(202, 138, 4, 0.2)',
    cardIconBorderHover: 'group-hover:border-yellow-600/30',
    cardIconColor: 'group-hover:text-yellow-500',
    cardIconHoverShadow: 'group-hover:shadow-[0_0_15px_rgba(202,138,4,0.15)]',
    menuItemHoverClass: 'hover:bg-yellow-600/20',
    hexValue: '#ca8a04',
    hexRgb: '202, 138, 4',
  },
  amber: {
    buttonBg: 'bg-amber-700',
    buttonBgHover: 'hover:bg-amber-800',
    buttonBorder: 'border-amber-600',
    iconBg: 'bg-amber-600/15',
    iconBgGradient: 'shadow-[0_0_30px_rgba(217,119,6,0.15)]',
    iconBorder: 'border-amber-500/45',
    iconColor: 'text-amber-400',
    shadowGlow: 'shadow-[0_0_20px_rgba(217,119,6,0.2)]',
    shadowGlowHover: 'hover:shadow-[0_0_30px_rgba(217,119,6,0.4)]',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-amber-600',
    gradientHoverFrom: 'hover:from-amber-600',
    gradientHoverTo: 'hover:to-amber-700',
    cardGlowGradient: 'from-amber-600/5',
    cardBorderGlow: 'inset 0 0 0 1px rgba(217, 119, 6, 0.2)',
    cardIconBorderHover: 'group-hover:border-amber-600/30',
    cardIconColor: 'group-hover:text-amber-500',
    cardIconHoverShadow: 'group-hover:shadow-[0_0_15px_rgba(217,119,6,0.15)]',
    menuItemHoverClass: 'hover:bg-amber-600/20',
    hexValue: '#d97706',
    hexRgb: '217, 119, 6',
  },
  copper: {
    buttonBg: 'bg-orange-800',
    buttonBgHover: 'hover:bg-orange-900',
    buttonBorder: 'border-orange-700',
    iconBg: 'bg-orange-700/15',
    iconBgGradient: 'shadow-[0_0_30px_rgba(194,65,12,0.18)]',
    iconBorder: 'border-orange-500/45',
    iconColor: 'text-orange-400',
    shadowGlow: 'shadow-[0_0_20px_rgba(194,65,12,0.22)]',
    shadowGlowHover: 'hover:shadow-[0_0_30px_rgba(194,65,12,0.4)]',
    gradientFrom: 'from-orange-600',
    gradientTo: 'to-orange-800',
    gradientHoverFrom: 'hover:from-orange-700',
    gradientHoverTo: 'hover:to-orange-900',
    cardGlowGradient: 'from-orange-700/8',
    cardBorderGlow: 'inset 0 0 0 1px rgba(194, 65, 12, 0.22)',
    cardIconBorderHover: 'group-hover:border-orange-700/35',
    cardIconColor: 'group-hover:text-orange-400',
    cardIconHoverShadow: 'group-hover:shadow-[0_0_15px_rgba(194,65,12,0.18)]',
    menuItemHoverClass: 'hover:bg-orange-700/25',
    hexValue: '#c2410c',
    hexRgb: '194, 65, 12',
  },
  honey: {
    buttonBg: 'bg-amber-600',
    buttonBgHover: 'hover:bg-amber-700',
    buttonBorder: 'border-amber-500',
    iconBg: 'bg-amber-500/15',
    iconBgGradient: 'shadow-[0_0_30px_rgba(245,158,11,0.16)]',
    iconBorder: 'border-amber-400/45',
    iconColor: 'text-amber-300',
    shadowGlow: 'shadow-[0_0_20px_rgba(245,158,11,0.22)]',
    shadowGlowHover: 'hover:shadow-[0_0_30px_rgba(245,158,11,0.38)]',
    gradientFrom: 'from-amber-400',
    gradientTo: 'to-amber-600',
    gradientHoverFrom: 'hover:from-amber-500',
    gradientHoverTo: 'hover:to-amber-700',
    cardGlowGradient: 'from-amber-500/8',
    cardBorderGlow: 'inset 0 0 0 1px rgba(245, 158, 11, 0.22)',
    cardIconBorderHover: 'group-hover:border-amber-500/35',
    cardIconColor: 'group-hover:text-amber-400',
    cardIconHoverShadow: 'group-hover:shadow-[0_0_15px_rgba(245,158,11,0.16)]',
    menuItemHoverClass: 'hover:bg-amber-500/22',
    hexValue: '#f59e0b',
    hexRgb: '245, 158, 11',
  },
  orchid: {
    buttonBg: 'bg-[#c8049d]',
    buttonBgHover: 'hover:bg-[#a00380]',
    buttonBorder: 'border-[#e879c8]',
    iconBg: 'bg-[#c8049d]/18',
    iconBgGradient: 'shadow-[0_0_30px_rgba(200,4,157,0.15)]',
    iconBorder: 'border-[#e879c8]/50',
    iconColor: 'text-[#f472b6]',
    shadowGlow: 'shadow-[0_0_20px_rgba(200,4,157,0.2)]',
    shadowGlowHover: 'hover:shadow-[0_0_30px_rgba(200,4,157,0.4)]',
    gradientFrom: 'from-[#f0abfc]',
    gradientTo: 'to-[#c8049d]',
    gradientHoverFrom: 'hover:from-[#e879c8]',
    gradientHoverTo: 'hover:to-[#a00380]',
    cardGlowGradient: 'from-[#c8049d]/8',
    cardBorderGlow: 'inset 0 0 0 1px rgba(200, 4, 157, 0.22)',
    cardIconBorderHover: 'group-hover:border-[#c8049d]/32',
    cardIconColor: 'group-hover:text-[#f0abfc]',
    cardIconHoverShadow: 'group-hover:shadow-[0_0_15px_rgba(200,4,157,0.15)]',
    menuItemHoverClass: 'hover:bg-[#c8049d]/22',
    hexValue: '#c8049d',
    hexRgb: '200, 4, 157',
  },
  raspberry: {
    buttonBg: 'bg-pink-700',
    buttonBgHover: 'hover:bg-pink-800',
    buttonBorder: 'border-pink-600',
    iconBg: 'bg-pink-600/15',
    iconBgGradient: 'shadow-[0_0_30px_rgba(219,39,119,0.15)]',
    iconBorder: 'border-pink-500/45',
    iconColor: 'text-pink-400',
    shadowGlow: 'shadow-[0_0_20px_rgba(219,39,119,0.2)]',
    shadowGlowHover: 'hover:shadow-[0_0_30px_rgba(219,39,119,0.4)]',
    gradientFrom: 'from-pink-400',
    gradientTo: 'to-pink-700',
    gradientHoverFrom: 'hover:from-pink-500',
    gradientHoverTo: 'hover:to-pink-800',
    cardGlowGradient: 'from-pink-600/8',
    cardBorderGlow: 'inset 0 0 0 1px rgba(219, 39, 119, 0.22)',
    cardIconBorderHover: 'group-hover:border-pink-600/32',
    cardIconColor: 'group-hover:text-pink-400',
    cardIconHoverShadow: 'group-hover:shadow-[0_0_15px_rgba(219,39,119,0.15)]',
    menuItemHoverClass: 'hover:bg-pink-600/22',
    hexValue: '#db2777',
    hexRgb: '219, 39, 119',
  },
  plum: {
    buttonBg: 'bg-violet-700',
    buttonBgHover: 'hover:bg-violet-800',
    buttonBorder: 'border-violet-600',
    iconBg: 'bg-violet-600/15',
    iconBgGradient: 'shadow-[0_0_30px_rgba(124,58,237,0.16)]',
    iconBorder: 'border-violet-400/45',
    iconColor: 'text-violet-400',
    shadowGlow: 'shadow-[0_0_20px_rgba(124,58,237,0.22)]',
    shadowGlowHover: 'hover:shadow-[0_0_30px_rgba(124,58,237,0.4)]',
    gradientFrom: 'from-violet-400',
    gradientTo: 'to-violet-700',
    gradientHoverFrom: 'hover:from-violet-500',
    gradientHoverTo: 'hover:to-violet-800',
    cardGlowGradient: 'from-violet-600/8',
    cardBorderGlow: 'inset 0 0 0 1px rgba(124, 58, 237, 0.22)',
    cardIconBorderHover: 'group-hover:border-violet-600/32',
    cardIconColor: 'group-hover:text-violet-400',
    cardIconHoverShadow: 'group-hover:shadow-[0_0_15px_rgba(124,58,237,0.16)]',
    menuItemHoverClass: 'hover:bg-violet-600/22',
    hexValue: '#7c3aed',
    hexRgb: '124, 58, 237',
  },
}

export interface CustomWarmAccentStyles {
  hexValue: string
  rgbString: string
  sidePanelButton: CSSProperties
  libraryToolsButton: CSSProperties
  projectsHeaderIconBox: CSSProperties
  projectsHeaderIconBoxShadow: string
  folderIcon: CSSProperties
  projectsNewButton: CSSProperties
  projectsNewButtonHover: CSSProperties
  cardGlowOverlay: CSSProperties
  cardBorderGlow: string
  cardIconCell: CSSProperties
  cardIconCellHover: CSSProperties
  cardIconFolder: CSSProperties
  cardIconFolderHover: CSSProperties
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function darkenHex(hexValue: string, factor = 0.82): string {
  const { r, g, b } = hexToRgb(hexValue)
  return rgbToHex(
    Math.round(r * factor),
    Math.round(g * factor),
    Math.round(b * factor)
  )
}

export function generateCustomWarmAccentStyles(hexValue: string): CustomWarmAccentStyles {
  const { r, g, b, rgbString } = hexToRgb(hexValue)
  const darker = darkenHex(hexValue, 0.82)
  const { r: dr, g: dg, b: db } = hexToRgb(darker)

  return {
    hexValue,
    rgbString,
    sidePanelButton: {
      backgroundColor: hexValue,
      borderColor: hexValue,
    },
    libraryToolsButton: {
      backgroundColor: hexValue,
    },
    projectsHeaderIconBox: {
      backgroundColor: `rgba(${rgbString}, 0.14)`,
      borderColor: `rgba(${rgbString}, 0.45)`,
    },
    projectsHeaderIconBoxShadow: `0 0 30px rgba(${rgbString}, 0.15)`,
    folderIcon: { color: hexValue },
    projectsNewButton: {
      backgroundColor: hexValue,
      borderColor: hexValue,
      color: '#fff',
      boxShadow: `0 0 20px rgba(${rgbString}, 0.2)`,
    },
    projectsNewButtonHover: {
      backgroundColor: darker,
      borderColor: darker,
      color: '#fff',
      boxShadow: `0 0 30px rgba(${rgbString}, 0.4)`,
    },
    cardGlowOverlay: {
      background: `linear-gradient(to bottom right, rgba(${rgbString}, 0.06), transparent)`,
    },
    cardBorderGlow: `inset 0 0 0 1px rgba(${rgbString}, 0.2)`,
    cardIconCell: {},
    cardIconCellHover: {
      borderColor: `rgba(${rgbString}, 0.35)`,
      boxShadow: `0 0 15px rgba(${rgbString}, 0.15)`,
    },
    cardIconFolder: { color: '#6b7280' },
    cardIconFolderHover: { color: hexValue },
  }
}
