# Ligand Image Loading Fix

## Problem
Ligand images in the RBFE network graph were not loading properly, showing broken image placeholders (gray boxes with question marks).

## Root Causes
1. **CORS Issues** - PubChem API may block cross-origin requests from browsers
2. **Network Timeouts** - PubChem API requests may timeout or fail
3. **Missing SMILES Data** - Some ligands may not have SMILES data available
4. **SVG Image Constraints** - SVG image elements have limitations with external URLs

## Solution Implemented

### 1. **Graceful Fallback Mechanism**
Added fallback colored circles that display when images fail to load:
- If image loads successfully: displays the chemical structure image with label below
- If image fails to load: displays a colored circle (indigo/purple background) with label below
- If no SMILES available: displays text label with ligand name in center

### 1.5 **Ligand Labels**
Added visible ligand name labels to all nodes:
- **With images**: Label positioned below the node (y + nodeRadius + 15)
- **Without images**: Label centered on the node
- **Truncation**: Long names truncated to 8 characters with ".." suffix

### 2. **SVG Error Handling**
Updated the SVG generation to include:
```xml
<image href="..." onerror="this.style.display='none'" />
<!-- Fallback circle in case image fails to load -->
<circle cx="..." cy="..." r="..." fill="#e0e7ff" stroke="#c7d2fe" />
```

This ensures:
- The image element hides itself if it fails to load
- A fallback circle is always visible behind the image
- The graph remains functional and visually appealing regardless of image loading

### 3. **Improved Image URL**
Updated PubChem API URL parameters:
- Increased image size from 150x150 to 200x200 for better visibility
- Added proper URL encoding for SMILES strings
- Maintained compatibility with PubChem's REST API

### 4. **Helper Functions**
Added `createFallbackImageDataUrl()` function for future use:
- Creates SVG-based fallback images programmatically
- Can be used for alternative image generation approaches

## Files Modified
- **`rbfe-network-export.ts`**
  - Updated `getLigandImageUrl()` with better documentation
  - Added `createFallbackImageDataUrl()` helper function
  - Updated SVG generation to include fallback circles
  - Added comprehensive comments about image loading behavior

## Visual Changes
- **Before**: 
  - Broken image placeholders (gray boxes with ?)
  - No visible ligand labels
- **After**: 
  - Successful images: Display chemical structures from PubChem with ligand name below
  - Failed images: Display indigo/purple colored circles with ligand name below
  - No SMILES: Display gray circles with ligand name centered
  - **All nodes now clearly labeled with ligand identifiers**

## Fallback Circle Colors
- **With image attempt**: Indigo background (#e0e7ff) with indigo border (#c7d2fe)
- **No SMILES/image**: Gray background (#f3f4f6) with gray border (#d1d5db)

## Benefits
✅ **Robust** - Graph works even if all images fail to load  
✅ **User-Friendly** - Clear visual distinction between image and fallback states  
✅ **Accessible** - Text labels always visible and readable  
✅ **Professional** - Colored circles provide visual appeal when images unavailable  
✅ **Identifiable** - All ligands clearly labeled with their names  
✅ **No Breaking Changes** - Existing functionality preserved  

## Testing Recommendations
1. Test with network offline - should show all fallback circles
2. Test with valid SMILES - should show images when available
3. Test with missing SMILES - should show text labels
4. Test SVG download - should work with or without images
5. Test in ImageViewer - should display correctly with zoom/rotate

## Future Improvements
1. **Alternative Image Sources**
   - Implement fallback to other chemical structure APIs
   - Cache images locally to reduce API calls
   - Use pre-generated images when available

2. **Performance Optimization**
   - Batch image requests
   - Implement image loading timeout
   - Use image compression

3. **User Control**
   - Add toggle to show/hide images
   - Allow users to upload custom images
   - Provide image quality settings

## Technical Notes
- SVG `onerror` attribute works in modern browsers
- Fallback circles are rendered behind images using SVG layering
- No external dependencies required for fallback mechanism
- Compatible with all modern browsers (Chrome, Firefox, Safari, Edge)
