/**
 * BlobRegistry - Non-reactive storage for large data blobs
 * 
 * This registry stores heavy data (PDB strings, SDF data, etc.) outside of
 * Zustand stores to prevent unnecessary React re-renders when switching tabs
 * or updating unrelated state.
 * 
 * Pattern: Store only IDs in Zustand, fetch actual content from here when needed.
 */

// Internal storage - NOT reactive
const registry = new Map<string, string>()

// Metadata storage for tracking blob info without storing the actual content
interface BlobMetadata {
  size: number
  createdAt: number
  type: 'pdb' | 'sdf' | 'xyz' | 'smiles' | 'other'
}
const metadataRegistry = new Map<string, BlobMetadata>()

/**
 * Generate a unique blob ID
 */
export function generateBlobId(prefix: string = 'blob'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * BlobRegistry - Simple memory map for heavy data
 * 
 * Usage:
 * - Store: BlobRegistry.set('my-id', pdbString)
 * - Retrieve: const pdb = BlobRegistry.get('my-id')
 * - Delete: BlobRegistry.delete('my-id')
 */
export const BlobRegistry = {
  /**
   * Store content in the registry
   * @param id - Unique identifier for the blob
   * @param content - The content to store (PDB string, SDF data, etc.)
   * @param type - Optional type hint for the content
   */
  set: (id: string, content: string, type: BlobMetadata['type'] = 'other'): void => {
    registry.set(id, content)
    metadataRegistry.set(id, {
      size: content.length,
      createdAt: Date.now(),
      type,
    })
  },

  /**
   * Retrieve content from the registry
   * @param id - The blob ID
   * @returns The content or null if not found
   */
  get: (id: string): string | null => {
    return registry.get(id) || null
  },

  /**
   * Check if a blob exists
   * @param id - The blob ID
   */
  has: (id: string): boolean => {
    return registry.has(id)
  },

  /**
   * Delete a blob from the registry
   * @param id - The blob ID
   */
  delete: (id: string): boolean => {
    metadataRegistry.delete(id)
    return registry.delete(id)
  },

  /**
   * Get metadata for a blob without retrieving the content
   * @param id - The blob ID
   */
  getMetadata: (id: string): BlobMetadata | null => {
    return metadataRegistry.get(id) || null
  },

  /**
   * Clear all blobs from the registry
   */
  clear: (): void => {
    registry.clear()
    metadataRegistry.clear()
  },

  /**
   * Get the number of stored blobs
   */
  size: (): number => {
    return registry.size
  },

  /**
   * Get all blob IDs
   */
  keys: (): string[] => {
    return Array.from(registry.keys())
  },

  /**
   * Get total memory usage (approximate, in bytes)
   */
  getTotalSize: (): number => {
    let total = 0
    for (const meta of metadataRegistry.values()) {
      total += meta.size
    }
    return total
  },

  /**
   * Format total size for display
   */
  getFormattedSize: (): string => {
    const bytes = BlobRegistry.getTotalSize()
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  },
}

// Export type for use in stores
export type { BlobMetadata }
