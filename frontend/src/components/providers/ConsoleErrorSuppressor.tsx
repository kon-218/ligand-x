'use client'

/**
 * Suppresses non-critical console errors and warnings
 * Filters out known harmless warnings from Molstar, Cairo, and other libraries
 */

import { useEffect } from 'react'

export const ConsoleErrorSuppressor = () => {
  useEffect(() => {
    // Store original console methods
    const originalError = console.error
    const originalWarn = console.warn

    // Suppress specific non-critical errors and warnings
    console.error = function(...args: any[]) {
      const message = args[0]?.toString?.() || ''
      const fullMessage = args.map((a: any) => a?.toString?.() || '').join(' ')

      // Suppress PDBe API fetch errors (expected in dev mode)
      if (
        message.includes('Failed to fetch') ||
        message.includes('ERR_CONNECTION_REFUSED') ||
        message.includes('localhost:9000') ||
        message.includes('list_entries')
      ) {
        return
      }

      // Suppress Cairo-related warnings
      if (
        message.includes('cairo') ||
        message.includes('Cairo') ||
        fullMessage.includes('cairo boilerplate')
      ) {
        return
      }

      // Suppress Molstar entry list initialization errors
      if (
        message.includes('initializeEntryLists') ||
        message.includes('getEntryList')
      ) {
        return
      }

      // Pass through all other errors
      originalError.apply(console, args)
    }

    console.warn = function(...args: any[]) {
      const message = args[0]?.toString?.() || ''

      // Suppress non-passive event listener warnings (browser optimization)
      if (message.includes('non-passive event listener')) {
        return
      }

      // Suppress Cairo warnings
      if (message.includes('cairo') || message.includes('Cairo')) {
        return
      }

      // Pass through all other warnings
      originalWarn.apply(console, args)
    }

    // Cleanup: restore original console methods on unmount
    return () => {
      console.error = originalError
      console.warn = originalWarn
    }
  }, [])

  return null
}
