# Minimizable Job List & Toggle-Select Design

**Date:** 2026-04-01
**Scope:** `UnifiedJobList` component — applies uniformly to all consumers (ResultsTool + all service-specific results panels)

---

## Context

Every results panel in the app (unified Results browser + MD, RBFE, ABFE, Docking, Boltz-2, QC tool result steps) shows a job list above the results area. Once the user selects a job, the job list takes up vertical space that could be used for results. This spec adds a minimize toggle so the user can collapse the list to a slim header bar after selecting a job, maximising space for results.

Additionally, the expected job selection behaviour is: click a different job → switch to new results; click the already-selected job → deselect and clear results.

**Note:** Toggle-deselect (clicking the active job calls `onSelectJob(null, null)`) is already implemented at `UnifiedJobList.tsx:294`. No consumer changes are needed for that behaviour.

---

## Changes: `UnifiedJobList.tsx` only

This is a self-contained change to one file. All consumers benefit with zero code changes on their side.

### 1. New internal state

```tsx
const [isMinimized, setIsMinimized] = useState(false)
```

Default: expanded. The state is transient — it resets when the user navigates away and returns, which is acceptable.

### 2. Auto-expand on deselect

When `activeJobId` becomes `null`, automatically expand the list so the user is not left staring at a collapsed empty-results panel:

```tsx
useEffect(() => {
  if (!activeJobId) setIsMinimized(false)
}, [activeJobId])
```

### 3. Collapsed render (minimized state)

> **Implementation note:** The early minimized return must be placed *after* all hook declarations in the component function body (React rules of hooks). All existing `useState`, `useMemo`, and `useEffect` calls run unconditionally first; the early return follows them.

When `isMinimized === true`, replace the entire component body with a slim `~36px` bar:

```
[ Title   ·  {N} jobs ]         [ ⌄ ]
```

- **Left:** `{title}` text + a muted pill showing `filteredJobs.length` ("3 jobs")
- **Right:** `ChevronDown` icon
- The entire bar is clickable to expand (`onClick={() => setIsMinimized(false)}`)
- No job list, no tabs, no resize handle

```tsx
if (isMinimized) {
  return (
    <div className="p-3 border-b border-gray-700">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsMinimized(false)}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-white">{title}</h3>
          <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded-full">
            {filteredJobs.length}
          </span>
        </div>
        <ChevronDown className="w-4 h-4 text-gray-400 hover:text-white transition-colors" />
      </div>
    </div>
  )
}
```

### 4. Expanded header — add minimize button

In the existing expanded header, make the title area clickable to minimize. Replace the current plain `<h3>` with a clickable group:

**Before:**
```tsx
<h3 className="text-sm font-medium text-white">{title}</h3>
```

**After:**
```tsx
<div
  className="flex items-center gap-1.5 cursor-pointer group/title"
  onClick={() => setIsMinimized(true)}
  title="Minimize job list"
>
  <h3 className="text-sm font-medium text-white">{title}</h3>
  <ChevronUp className="w-3.5 h-3.5 text-gray-500 group-hover/title:text-gray-300 transition-colors" />
</div>
```

The chevron is subtle (gray-500) until hovered, keeping the header uncluttered.

### 5. Import

Add to existing lucide-react import: `ChevronDown`, `ChevronUp`.

---

## Affected files

| File | Change |
|------|--------|
| `frontend/src/components/Tools/shared/UnifiedJobList.tsx` | Add minimize state, collapsed render, auto-expand effect, chevron in header |

No other files need changes. The behaviour propagates to:
- `frontend/src/components/Tools/Results/ResultsTool.tsx`
- `frontend/src/components/Tools/MD/MDStepResults.tsx`
- `frontend/src/components/Tools/RBFE/RBFEResultsPanel.tsx`
- `frontend/src/components/Tools/ABFE/ABFEStepResults.tsx`
- `frontend/src/components/Tools/Docking/DockingStepResults.tsx`
- `frontend/src/components/Tools/Boltz2/Boltz2StepResults.tsx`
- `frontend/src/components/Tools/QuantumChemistry/QCTabResults.tsx`

---

## Interaction summary

| User action | Result |
|-------------|--------|
| Click job (not selected) | Select job, show results |
| Click different job | Switch to new job results |
| Click already-selected job | Deselect, clear results, auto-expand list |
| Click chevron / title in expanded header | Minimize list to slim bar |
| Click anywhere in slim bar | Expand list |
| Job deselected (activeJobId → null) | List auto-expands |

---

## Verification

1. Open any service tool's Results step — job list has a chevron next to the title
2. Click the chevron → list collapses to a slim header showing title + job count
3. Click the slim header → list expands again
4. Select a job → results appear below, list stays in whatever minimize state the user set
5. Click the selected job again → job deselects, results clear, list auto-expands
6. In unified Results browser (ResultsTool) — same behaviour with all service filters
7. Resize handle still works when expanded; absent when minimized
