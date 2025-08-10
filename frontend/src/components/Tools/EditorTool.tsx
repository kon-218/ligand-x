'use client'

import dynamic from 'next/dynamic'
import { KetcherSkeleton } from './MoleculeEditor/KetcherSkeleton'

// Dynamically import MoleculeEditorTool with SSR disabled
// This prevents Ketcher (which relies on browser APIs and jsdom) from being loaded during SSR
const MoleculeEditorTool = dynamic(
  () => import('./MoleculeEditor').then((mod) => ({ default: mod.MoleculeEditorTool })),
  {
    ssr: false,
    loading: () => <KetcherSkeleton />,
  }
)

export function EditorTool() {
  // CRITICAL FIX: Do NOT force remounting on every tab switch
  // Remounting causes Ketcher to reinitialize, which leads to KetcherLogger errors
  // Instead, keep the component mounted and let it handle visibility internally
  // The component will properly clean up only when it truly unmounts
  return <MoleculeEditorTool />
}

// Export the loader function for preloading purposes
// This allows external code to trigger bundle preloading before the component is mounted
export const preloadEditorBundle = () => {
  // Preload both the component and the ketcher-react bundle
  Promise.all([
    import('./MoleculeEditor').catch((err) => {
      console.error('Failed to preload MoleculeEditor:', err)
    }),
    // Preload ketcher-react bundle directly
    import('ketcher-react').catch((err) => {
      console.error('Failed to preload ketcher-react:', err)
    })
  ]).catch((err) => {
    console.error('Failed to preload editor bundle:', err)
  })
}
