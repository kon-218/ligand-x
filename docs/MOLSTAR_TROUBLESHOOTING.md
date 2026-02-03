# Mol* Viewer - Troubleshooting Guide

## Common Development Warnings (Safe to Ignore)

### 1. Hydration Mismatch Warnings

**Error Message:**
```
A tree hydrated but some attributes of the server rendered HTML didn't match the client properties.
```

**Attributes like:**
- `bis_register="..."`
- `__processed_*__="true"`
- Browser extension script injections

**Cause:** 
Browser extensions (privacy tools, ad blockers, security extensions) inject attributes and scripts into the DOM before React hydrates.

**Impact:** 
- ⚠️ Development only
- ✅ Does NOT affect production builds
- ✅ Does NOT affect functionality
- ✅ Viewer works perfectly despite this warning

**Solution:**
- **Option 1:** Ignore these warnings (recommended for development)
- **Option 2:** Disable browser extensions while developing
- **Option 3:** Use incognito/private browsing mode for testing

---

### 2. Mol* Symbol Registration Warnings

**Error Message:**
```
Symbol 'computed.accessible-surface-area.is-buried' already added. 
Call removeSymbol/removeCustomProps re-adding the symbol.
```

**Cause:**
React Strict Mode in development intentionally mounts components twice to detect side effects. This causes Mol* to initialize twice and attempt to register the same computational symbols twice.

**Impact:**
- ⚠️ Development only (Strict Mode is disabled in production)
- ✅ Does NOT affect functionality
- ✅ Structures load and render correctly
- ✅ All features work as expected

**Why React Strict Mode?**
React Strict Mode helps identify potential problems by:
- Detecting unexpected side effects
- Warning about deprecated APIs
- Ensuring components are resilient to mounting/unmounting

**Solution:**
These warnings are **harmless and expected** in development. The improved initialization guard now prevents most double-initialization issues.

**If you want to eliminate these warnings completely (NOT recommended):**
```typescript
// In src/app/layout.tsx - Remove StrictMode wrapper
// NOT RECOMMENDED: This disables helpful React checks

// Before (with Strict Mode - KEEP THIS):
<body className={`${inter.className}`}>
  {children}
</body>

// After (without Strict Mode - DON'T DO THIS):
// Would require wrapping in a provider without StrictMode
```

**Recommendation:** Keep React Strict Mode enabled and ignore these warnings. They don't affect functionality and help catch real issues.

---

## Real Errors to Watch For

### ❌ "Failed to load structure"

**Likely Causes:**
1. Invalid PDB ID
2. Network connectivity issues
3. RCSB PDB server temporarily unavailable

**Solutions:**
- Verify PDB ID is valid (4 characters, e.g., "1CRN", "4HHB")
- Check browser console for specific error messages
- Try a known working PDB ID like "1CRN"
- Check if BinaryCIF fallback to mmCIF is working

---

### ❌ "Failed to initialize Mol* viewer"

**Likely Causes:**
1. Molstar package not installed
2. Import errors
3. Browser compatibility issues

**Solutions:**
```bash
# Reinstall Molstar
cd frontend-react
npm install molstar

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

---

### ❌ Canvas not appearing

**Likely Causes:**
1. Parent container has no dimensions
2. Plugin initialization failed silently

**Solutions:**
- Ensure parent container has explicit width/height
- Check browser console for errors
- Verify the component is receiving a structure via props

---

## Performance Issues

### Slow loading for large structures

**Solutions:**
1. Ensure BinaryCIF is being used (check Network tab in DevTools)
2. Consider showing a loading indicator
3. For extremely large structures (>1M atoms), warn users before loading

### Viewer feels sluggish

**Possible Causes:**
- Too many representations active
- Surface rendering with high detail
- Multiple structures loaded simultaneously

**Solutions:**
- Clear previous structures before loading new ones
- Adjust surface quality settings
- Limit number of active representations

---

## Browser Compatibility

### Supported Browsers
✅ Chrome 90+  
✅ Firefox 88+  
✅ Edge 90+  
✅ Safari 14+  

### Known Issues
- **Safari < 14:** Limited WebGL 2.0 support
- **Mobile browsers:** Performance may vary with large structures

---

## Development vs Production

### Development Mode Characteristics
- React Strict Mode enabled (double rendering)
- Verbose console warnings
- Source maps enabled
- Hot module replacement active

### Production Mode Characteristics
- React Strict Mode disabled (single rendering)
- Minimal console output
- Optimized bundle size
- No development warnings

**To test production behavior:**
```bash
npm run build
npm start
```

---

## Debugging Tips

### Enable Mol* Debug Logging
```typescript
// In MolStarViewer.tsx, add to plugin init:
const spec = {
  ...DefaultPluginUISpec(),
  config: [
    [PluginConfig.General.LogLevel, 'debug'],
  ],
}
```

### Check Plugin State
```typescript
// In browser console when viewer is active
console.log(window.molstarPlugin) // if you expose it
// Or use React DevTools to inspect component state
```

### Monitor Network Requests
1. Open DevTools → Network tab
2. Load a structure
3. Look for `.bcif` or `.cif` file downloads
4. Check response status and size

---

## When to Report an Issue

Report an issue if:
- ❌ Structures fail to load consistently
- ❌ Viewer crashes or freezes
- ❌ Memory leaks after multiple loads
- ❌ Atom click events don't fire
- ❌ Production build behaves differently than documented

Do NOT report:
- ✅ Browser extension hydration warnings
- ✅ React Strict Mode double-init warnings
- ✅ Console logs about visualization state changes (those are intentional)

---

## Quick Checklist

When encountering issues:
- [ ] Check browser console for actual errors (not warnings)
- [ ] Verify structure ID is valid
- [ ] Test with a known working structure (e.g., "1CRN")
- [ ] Disable browser extensions temporarily
- [ ] Try in incognito/private mode
- [ ] Check Network tab for failed requests
- [ ] Verify `molstar` package is installed
- [ ] Restart development server
- [ ] Clear browser cache

---

## Getting Help

1. **Check Documentation:** `MOLSTAR_INTEGRATION.md`
2. **Mol* Resources:** https://molstar.org/docs/
3. **GitHub Issues:** https://github.com/molstar/molstar/issues
4. **RCSB PDB Help:** https://www.rcsb.org/pages/help

Remember: Most console warnings in development are normal and don't indicate problems! 🎉
