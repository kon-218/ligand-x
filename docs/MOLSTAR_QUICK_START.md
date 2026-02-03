# Molstar Enhanced Viewer - Quick Start Guide

## What Was Created

Based on the Molstar basic-wrapper example, I've created a comprehensive React-based molecular viewer with all visualization customizations.

## New Files

```
frontend-react/
├── src/
│   ├── components/
│   │   └── MolecularViewer/
│   │       ├── MolstarViewerEnhanced.tsx          # Core viewer with full API
│   │       ├── MolstarViewerControls.tsx          # Pre-built UI controls
│   │       ├── MolecularViewerEnhanced.tsx        # Integration component
│   │       └── themes/
│   │           ├── CustomColorTheme.ts            # Radial gradient theme
│   │           └── StripedResidues.ts             # Alternating residue colors
│   └── app/
│       └── molstar-demo/
│           └── page.tsx                           # Live demo page
├── MOLSTAR_ENHANCED_VIEWER.md                     # Full documentation
└── MOLSTAR_QUICK_START.md                         # This file
```

## Features Available

### 🎨 Color Themes
- Default Molstar themes
- **Striped Residues**: Red/blue alternating pattern
- **Radial Gradient**: Rainbow gradient from center

### 🎬 Animations
- Spin rotation
- Frame-by-frame animation (for multi-model structures)
- Loop, palindrome, forward/backward modes

### 🖱️ Interactivity
- Residue highlighting by sequence ID
- Custom loci manipulation
- Click event handling

### 🎯 Customization
- Background colors
- Camera controls
- Full Molstar plugin access

## Quick Usage

### Option 1: Simple Integration (Recommended for Main App)

Replace your current `MolecularViewer` with the enhanced version:

```tsx
// In src/app/page.tsx
import { MolecularViewerEnhanced } from '@/components/MolecularViewer'

export default function Home() {
  return (
    <div className="flex flex-col h-screen">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <SidePanel />
        <main className="flex-1">
          <MolecularViewerEnhanced 
            showControls={true}
            initialPdbId="1cbs"
          />
        </main>
      </div>
    </div>
  )
}
```

This gives you:
- ✅ Full Molstar viewer
- ✅ Sliding controls panel
- ✅ All customization features
- ✅ Clean integration with your existing layout

### Option 2: Full Control

For complete programmatic control:

```tsx
import { useRef } from 'react'
import { MolstarViewerEnhanced, MolstarViewerHandle } from '@/components/MolecularViewer'

export default function MyComponent() {
  const viewerRef = useRef<MolstarViewerHandle>(null)
  
  // Load a structure
  const loadProtein = async () => {
    await viewerRef.current?.load({ pdbId: '2hhb' })
  }
  
  // Apply custom theme
  const applyTheme = async () => {
    await viewerRef.current?.coloring.applyStripes()
  }
  
  // Toggle spinning
  const spin = () => {
    viewerRef.current?.toggleSpin()
  }
  
  // Highlight a residue
  const highlight = () => {
    viewerRef.current?.interactivity.highlightResidue(42)
  }
  
  return (
    <div className="h-screen">
      <div className="controls">
        <button onClick={loadProtein}>Load Hemoglobin</button>
        <button onClick={applyTheme}>Striped Theme</button>
        <button onClick={spin}>Spin</button>
        <button onClick={highlight}>Highlight Res 42</button>
      </div>
      <MolstarViewerEnhanced 
        ref={viewerRef}
        backgroundColor={0x1a1a2e}
      />
    </div>
  )
}
```

## View the Demo

1. **Start the dev server** (if not already running):
   ```bash
   cd frontend-react
   npm run dev
   ```

2. **Visit the demo page**:
   - Navigate to: http://localhost:3001/molstar-demo
   - Try the controls in the right sidebar
   - Load different structures (1cbs, 2hhb, 4hhb, 7bna)
   - Experiment with color themes and animations

## API Reference

### Viewer Handle Methods

```typescript
const viewerRef = useRef<MolstarViewerHandle>(null)

// Access methods:
viewerRef.current?.load({ pdbId: '1cbs' })
viewerRef.current?.setBackground(0xff0000)
viewerRef.current?.toggleSpin()

viewerRef.current?.animate.loop()
viewerRef.current?.animate.stop()

viewerRef.current?.coloring.applyStripes()
viewerRef.current?.coloring.applyCustomTheme()
viewerRef.current?.coloring.applyDefault()

viewerRef.current?.interactivity.highlightResidue(7)
viewerRef.current?.interactivity.clearHighlight()

// Direct plugin access:
viewerRef.current?.plugin // Full PluginUIContext
```

## Available Color Themes

| Theme | Description | Method |
|-------|-------------|--------|
| Default | Standard Molstar themes | `coloring.applyDefault()` |
| Striped Residues | Red/blue alternating | `coloring.applyStripes()` |
| Radial Gradient | Rainbow from center | `coloring.applyCustomTheme()` |

## Integration with Tools

The enhanced viewer can be integrated with your existing tools:

```tsx
// In your tool component
import { useRef } from 'react'
import { MolstarViewerHandle } from '@/components/MolecularViewer'

export function DockingTool() {
  const viewerRef = useRef<MolstarViewerHandle>(null)
  
  const handleDockingComplete = (result) => {
    // Highlight binding site
    viewerRef.current?.interactivity.highlightResidue(result.bindingSite)
    
    // Apply custom coloring
    viewerRef.current?.coloring.applyCustomTheme()
  }
  
  return (
    // Your tool UI
  )
}
```

## Next Steps

1. **Test the demo page** at `/molstar-demo`
2. **Read full documentation** in `MOLSTAR_ENHANCED_VIEWER.md`
3. **Replace your current viewer** with `MolecularViewerEnhanced`
4. **Customize themes** or create your own (see docs)
5. **Integrate with your tools** (docking, MD, ADMET, etc.)

## Comparison: Old vs New

| Feature | Old MolStarViewer | Enhanced Viewer |
|---------|-------------------|-----------------|
| Basic rendering | ✅ | ✅ |
| Custom themes | ❌ | ✅ |
| Animation controls | ❌ | ✅ |
| Programmatic highlighting | ❌ | ✅ |
| UI controls | ❌ | ✅ |
| Full plugin access | ⚠️ Limited | ✅ Full |
| Based on official example | ❌ | ✅ |

## Troubleshooting

### Viewer not showing
- Check console for errors
- Ensure Molstar is installed: `npm list molstar`
- Verify Next.js is running on correct port

### Controls not working
- Ensure viewerRef is passed correctly
- Check that viewer is initialized (ref.current !== null)
- Wait for plugin to be ready

### Themes not applying
- Ensure structure is loaded first
- Check console for theme registration errors
- Verify plugin.current exists

## Support

- Full documentation: `MOLSTAR_ENHANCED_VIEWER.md`
- Molstar docs: https://molstar.org/docs/
- Demo page: http://localhost:3001/molstar-demo

---

**Created**: Based on Molstar basic-wrapper example  
**Framework**: Next.js 15, React 19, TypeScript  
**Molstar Version**: 5.0.0
