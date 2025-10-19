// Standalone structure service provider for Ketcher
// This uses ketcher-standalone for client-side structure processing
// No backend dependency required for basic editor operations

import { StandaloneStructServiceProvider } from 'ketcher-standalone'

/**
 * Create and configure the Ketcher standalone structure service provider
 * This provides all core functionality client-side:
 * - Format conversion (MOL, SMILES, InChI, SDF, KET)
 * - Structure layout and cleanup
 * - Validation and structure checking
 * 
 * Benefits:
 * - No backend required for basic operations
 * - Faster response times
 * - More reliable MOL file handling
 * - Better compatibility with Ketcher's internal formats
 */
export function createStructServiceProvider() {
  return new StandaloneStructServiceProvider()
}

// Export the provider instance as a singleton pattern
// This ensures the same instance is reused across the application
// but initialization is deferred until actually needed
let instance: any = null

export const getStructServiceProvider = () => {
  if (!instance) {
    instance = new StandaloneStructServiceProvider()
  }
  return instance
}
// Deprecated: use getStructServiceProvider() instead
// Keeping for backward compatibility if needed, but it will trigger eager loading
export const structServiceProvider = instance || (instance = new StandaloneStructServiceProvider())
