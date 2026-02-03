# ImageViewer Component Usage Guide

## Overview
The `ImageFileViewer` component is a new feature that allows displaying images in the right-hand side panel of the molecular viewer, similar to how `TextFileViewer` displays text files.

## Component Location
- **Component**: `/frontend/src/components/MolecularViewer/ImageFileViewer.tsx`
- **Store**: `/frontend/src/store/molecular-store.ts`
- **Tab Bar**: `/frontend/src/components/MolecularViewer/StructureTabBar.tsx`
- **Main Viewer**: `/frontend/src/components/MolecularViewer/MolecularViewer.tsx`

## Features
- **Zoom Controls**: Zoom in/out with buttons (50%-300% range)
- **Rotation**: Rotate images by 90° increments
- **Reset**: Reset zoom and rotation to defaults
- **Download**: Download the displayed image
- **Tab Management**: Images appear as tabs alongside structures and text files
- **Responsive**: Full-screen image display with proper scaling

## Usage

### Adding an Image Tab
To add an image tab to the molecular viewer, use the `addImageFileTab` function from the store:

```typescript
import { useMolecularStore } from '@/store/molecular-store'

function MyComponent() {
  const { addImageFileTab } = useMolecularStore()
  
  const handleAddImage = (imageUrl: string, imageName: string) => {
    const tabId = addImageFileTab(imageUrl, imageName)
    // Tab is automatically created and becomes active
  }
  
  return (
    <button onClick={() => handleAddImage('/path/to/image.png', 'My Image')}>
      Add Image
    </button>
  )
}
```

### Removing an Image Tab
```typescript
const { removeImageFileTab } = useMolecularStore()

removeImageFileTab(tabId)
```

### Accessing Image Tabs
```typescript
const { imageFileTabs, activeTabId } = useMolecularStore()

const activeImageTab = imageFileTabs.find(tab => tab.id === activeTabId)
```

## Store Interface

### ImageFileTab Type
```typescript
interface ImageFileTab {
  id: string                // Unique tab identifier
  name: string              // Display name for the tab
  imageUrl: string          // URL or data URI of the image
  createdAt: number         // Timestamp when tab was created
}
```

### Store Methods
- `addImageFileTab(imageUrl: string, name?: string): string` - Creates a new image tab and returns its ID
- `removeImageFileTab(tabId: string): void` - Removes an image tab
- `imageFileTabs: ImageFileTab[]` - Array of all image tabs
- `activeTabId: string | null` - Currently active tab ID

## Integration Points

### Tab Bar
The `StructureTabBar` component automatically displays image tabs with an image icon. No additional configuration needed.

### Main Viewer
The `MolecularViewer` component automatically renders the `ImageFileViewer` when an image tab is active, hiding the molecular structure behind it.

## Example: Adding Images from Results

```typescript
import { useMolecularStore } from '@/store/molecular-store'

function ResultsPanel() {
  const { addImageFileTab } = useMolecularStore()
  
  const handleViewImage = (imageUrl: string) => {
    addImageFileTab(imageUrl, `Result Image - ${new Date().toLocaleTimeString()}`)
  }
  
  return (
    <div>
      <button onClick={() => handleViewImage('/api/results/plot.png')}>
        View Plot
      </button>
      <button onClick={() => handleViewImage('/api/results/structure.png')}>
        View Structure
      </button>
    </div>
  )
}
```

## Styling
The component uses TailwindCSS with a dark theme matching the rest of the application:
- Dark background: `bg-gray-950`
- Header: `bg-gray-800`
- Borders: `border-gray-700`
- Text: `text-gray-200` / `text-gray-300`

## Keyboard/Mouse Interactions
- **Click buttons** to zoom, rotate, or reset
- **Download button** saves the image with its original name
- **Tab switching** automatically updates the displayed image
- **Close button** removes the image tab

## Notes
- Images are displayed at their natural aspect ratio
- Large images are automatically scaled to fit the viewport
- The component preserves the molecular viewer state when switching between tabs
- Image URLs can be absolute paths, relative paths, or data URIs
