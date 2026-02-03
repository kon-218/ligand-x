# Ketcher Tab Switching Fix

## Problem
When switching away from the Molecule Editor tab and back to it, the application would crash with a `KetcherLogger` error. The error message was:
```
Error: Ketcher needs to be initialized before KetcherLogger can be used
```

## Root Cause
The issue was caused by Ketcher being forced to reinitialize every time the tab was switched:

1. **Forced Remounting in `EditorTool.tsx`**: The component had a `mountKey` that incremented on every render, forcing React to completely unmount and remount the MoleculeEditorTool component each time the tab was opened.

2. **AnimatePresence Unmounting**: The `AnimatePresence` component in `SidePanel.tsx` with `mode="wait"` was causing complete unmount/remount cycles when switching between tabs.

3. **Race Condition**: During remounting, Ketcher's internal modules (like `KetcherLogger`) would try to access the main Ketcher instance before it was fully initialized, causing the error.

## Solution
The fix involved three key changes:

### 1. Remove Forced Remounting (`EditorTool.tsx`)
**Before:**
```tsx
export function EditorTool() {
  const [mountKey, setMountKey] = useState(0)

  useEffect(() => {
    setMountKey(prev => prev + 1)  // ❌ Forces remount every time
  }, [])

  return <MoleculeEditorTool key={mountKey} />
}
```

**After:**
```tsx
export function EditorTool() {
  // ✅ No forced remounting - let component stay mounted
  return <MoleculeEditorTool />
}
```

### 2. Keep Editor Mounted (`SidePanel.tsx`)
Instead of using `AnimatePresence` for the Editor (which unmounts/remounts), we keep it always mounted but toggle visibility with CSS:

```tsx
{/* Editor Tool - Always mounted, shown/hidden with CSS */}
<div className={cn(
  "flex-1 flex flex-col bg-gray-900 overflow-hidden",
  activeTool === 'editor' && isSidePanelExpanded ? "block" : "hidden"
)}>
  <div className="flex-1 overflow-y-auto custom-scrollbar">
    <EditorTool />
  </div>
</div>
```

This ensures:
- ✅ Ketcher initializes once and stays initialized
- ✅ No re-initialization when switching tabs
- ✅ No `KetcherLogger` errors
- ✅ Faster tab switching (no initialization delay)

### 3. Enhanced `window.ketcher` Management (`MoleculeEditorTool.tsx`)
Added proper checks and logging for `window.ketcher` lifecycle:

```tsx
const onInit = useCallback((ketcher: KetcherInstance) => {
  if (!ketcher) {
    console.error('Ketcher instance is null or undefined')
    return
  }
  
  // Set window.ketcher to prevent KetcherLogger errors
  if (typeof window !== 'undefined') {
    (window as any).ketcher = ketcher
    console.log('window.ketcher set successfully')
  }
  // ... rest of initialization
}, [])
```

And proper cleanup:

```tsx
return () => {
  // Clean up window.ketcher only if it's our instance
  if (typeof window !== 'undefined' && (window as any).ketcher === ketcherRef.current) {
    delete (window as any).ketcher
    console.log('Cleaned up window.ketcher')
  }
}
```

## Benefits

1. **No More Crashes**: Tab switching works smoothly without `KetcherLogger` errors
2. **Better Performance**: Ketcher doesn't reinitialize on every tab switch
3. **Preserved State**: The editor content is preserved when switching tabs
4. **Faster UX**: No loading delay when returning to the editor tab

## Technical Details

### Why `window.ketcher` is Required
Ketcher's internal modules (like `KetcherLogger`) expect a global `window.ketcher` instance to exist. This is a Ketcher library design pattern. When the instance is missing or not yet initialized, these modules throw errors.

### Why Keep Editor Mounted
React's component lifecycle means that unmounting triggers cleanup and mounting triggers initialization. For complex libraries like Ketcher that:
- Initialize WebGL/Canvas contexts
- Set up event listeners
- Create complex internal state
- Expect global references

...frequent unmount/mount cycles can cause race conditions and initialization issues.

## Testing
To verify the fix works:

1. Start the application
2. Open the Molecule Editor tab
3. Draw a molecule or wait for full initialization
4. Switch to another tab (e.g., Input or Docking)
5. Switch back to the Molecule Editor tab
6. Repeat steps 4-5 multiple times

**Expected Result**: No crashes, no errors, smooth tab switching with preserved editor state.

## Related Files
- `frontend-react/src/components/Tools/EditorTool.tsx` - Removed forced remounting
- `frontend-react/src/components/Layout/SidePanel.tsx` - Keep editor mounted with CSS hide/show
- `frontend-react/src/components/Tools/MoleculeEditor/MoleculeEditorTool.tsx` - Enhanced window.ketcher lifecycle

## Additional Notes

### Other Tools
Other tools (Input, Docking, MD, etc.) still use `AnimatePresence` for unmount/remount because:
- They don't have complex initialization like Ketcher
- They benefit from a fresh state on each open
- They don't have global dependencies like `window.ketcher`

### React StrictMode
In development mode, React's `StrictMode` intentionally mounts components twice. This is usually fine now because:
- The `onInit` callback is idempotent (safe to run multiple times)
- `window.ketcher` gets overwritten with the same instance
- Cleanup properly removes only our instance

If issues persist in development, you can temporarily disable StrictMode, but it should work fine with this fix.

## Summary

The fix prevents Ketcher from reinitializing on every tab switch by:
1. Removing forced component remounting
2. Keeping the Editor component always mounted (just hidden when not active)
3. Properly managing the `window.ketcher` global reference

This ensures `KetcherLogger` and other Ketcher modules always have access to a properly initialized Ketcher instance.



