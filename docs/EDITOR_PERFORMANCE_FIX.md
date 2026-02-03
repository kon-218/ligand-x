# Editor Performance Optimization

## Problem
The Ketcher molecular editor was taking a long time to load on first compilation, loading after the entire page and causing noticeable delays.

## Root Causes Identified

1. **Synchronous CSS Import**: The Ketcher CSS (`ketcher-react/dist/index.css`) was being imported synchronously at the top of the component, blocking the initial render.

2. **Eager Library Fetch**: Library molecules were being fetched immediately on component mount, even if the user never opened the library dropdown.

3. **Delayed Event Subscription**: There was an unnecessary 1-second `setTimeout` delay before subscribing to Ketcher change events, delaying interactivity.

## Solutions Implemented

### 1. Lazy Load Ketcher CSS
**File**: `frontend/src/components/Tools/MoleculeEditor/MoleculeEditorTool.tsx`

- Removed synchronous CSS import
- Created `KetcherStyles.tsx` component that dynamically imports CSS
- Used Next.js `dynamic()` with `ssr: false` to load CSS asynchronously
- CSS now loads after the component mounts, not blocking initial render

**Impact**: Eliminates CSS blocking the initial render, allowing the editor UI to appear immediately.

### 2. Lazy Load Library Molecules
**File**: `frontend/src/components/Tools/MoleculeEditor/MoleculeEditorTool.tsx`

- Changed from eager fetch on mount to lazy fetch on dropdown open
- Added `libraryFetchedRef` to cache fetch results and prevent duplicate requests
- Library molecules now only load when user clicks "From Library" button

**Impact**: Removes unnecessary API call on editor load, saving network bandwidth and time.

### 3. Remove Unnecessary Event Subscription Delay
**File**: `frontend/src/components/Tools/MoleculeEditor/MoleculeEditorTool.tsx`

- Removed 1-second `setTimeout` before subscribing to Ketcher change events
- Subscribe immediately after Ketcher initialization (in `onInit` callback)
- Ketcher is ready to accept subscriptions right after `onInit` completes

**Impact**: Editor becomes interactive immediately, no artificial 1-second delay.

## Performance Gains

- **Initial Load**: ~1 second faster (removed setTimeout delay)
- **Page Render**: CSS no longer blocks initial page render
- **First Interaction**: Immediate response to user actions
- **API Calls**: Eliminated unnecessary library fetch on every editor open

## Files Modified

1. `frontend/src/components/Tools/MoleculeEditor/MoleculeEditorTool.tsx`
   - Removed synchronous CSS import
   - Added lazy CSS loading via dynamic import
   - Optimized library fetch to lazy-load on dropdown open
   - Removed 1-second setTimeout delay from event subscription

2. `frontend/src/components/Tools/MoleculeEditor/KetcherStyles.tsx` (NEW)
   - New component for lazy-loading Ketcher CSS
   - Imported in MoleculeEditorTool render output

## Testing

To verify the fix:
1. Open the application and navigate to the Editor tool
2. Observe that the editor UI appears immediately
3. The editor should be interactive without waiting
4. Library dropdown should load molecules only when clicked
