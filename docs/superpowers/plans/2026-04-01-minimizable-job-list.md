# Minimizable Job List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimize toggle to `UnifiedJobList` so users can collapse the job list to a slim header bar after selecting a job, giving results more vertical space — applied uniformly to all service result panels and the unified Results browser.

**Architecture:** Single-file change to `UnifiedJobList.tsx`. Internal `isMinimized` state with a collapsed early-return render path and auto-expand when the active job is deselected. No consumer changes needed. Toggle-deselect (click active job → deselect) is already implemented at line 294.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, lucide-react icons

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/components/Tools/shared/UnifiedJobList.tsx` | Add minimize state, auto-expand effect, collapsed render, chevron in header |

No other files are modified. All consumers inherit the behaviour automatically.

---

### Task 1: Add lucide-react import + minimize state + auto-expand effect

**Files:**
- Modify: `frontend/src/components/Tools/shared/UnifiedJobList.tsx:1` (import line)
- Modify: `frontend/src/components/Tools/shared/UnifiedJobList.tsx:215-240` (state + effects section)

- [ ] **Step 1: Add ChevronDown and ChevronUp to imports**

The file currently has no lucide-react import. Add one at the top of the file, after the existing imports:

```tsx
// After line 4 (the last existing import), add:
import { ChevronDown, ChevronUp } from 'lucide-react'
```

File top should look like:
```tsx
import { useState, useMemo, useRef, useEffect } from 'react'
import { StatusIcon, getStatusLabel } from './StatusIcon'
import type { UnifiedJob, ServiceType, SERVICE_CONFIGS } from '@/types/unified-job-types'
import { getJobDisplaySummary, getQCJobTypeLabel, getMDJobTypeLabel } from '@/types/unified-job-types'
import { ChevronDown, ChevronUp } from 'lucide-react'
```

- [ ] **Step 2: Add isMinimized state**

After `const [height, setHeight] = useState(initialHeight)` at line 215, add:

```tsx
const [isMinimized, setIsMinimized] = useState(false)
```

- [ ] **Step 3: Add auto-expand effect**

After the existing resize `useEffect` block (which ends around line 240), add:

```tsx
// Auto-expand list when job is deselected so user isn't left with a collapsed empty panel
useEffect(() => {
  if (!activeJobId) setIsMinimized(false)
}, [activeJobId])
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/konstantin-nomerotski/Documents/ligand-x/frontend
bun run tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing errors unrelated to this file).

- [ ] **Step 5: Commit**

```bash
cd /home/konstantin-nomerotski/Documents/ligand-x
git add frontend/src/components/Tools/shared/UnifiedJobList.tsx
git commit -m "feat: add minimize state and auto-expand effect to UnifiedJobList"
```

---

### Task 2: Add collapsed header render (minimized state)

**Files:**
- Modify: `frontend/src/components/Tools/shared/UnifiedJobList.tsx` — add early return after all hooks, before the main `return`

- [ ] **Step 1: Insert the minimized early return**

After the `handleMouseDown` function (around line 249) and **before** the main `return (` at line 251, insert:

```tsx
// Collapsed / minimized render — slim header bar only
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

This is valid React — placing a conditional return after all hooks is fine. The `filteredJobs` memo is computed above (line 191) and available here.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/konstantin-nomerotski/Documents/ligand-x/frontend
bun run tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /home/konstantin-nomerotski/Documents/ligand-x
git add frontend/src/components/Tools/shared/UnifiedJobList.tsx
git commit -m "feat: add collapsed header render to UnifiedJobList"
```

---

### Task 3: Add minimize button to expanded header

**Files:**
- Modify: `frontend/src/components/Tools/shared/UnifiedJobList.tsx:255` (header section)

- [ ] **Step 1: Replace the plain title `<h3>` with a clickable minimize group**

In the main `return`, find this in the header section (around line 255):

```tsx
<h3 className="text-sm font-medium text-white">{title}</h3>
```

Replace it with:

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

The chevron is intentionally subtle (gray-500) until hovered so it doesn't clutter the header. The entire title + chevron group is the click target.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/konstantin-nomerotski/Documents/ligand-x/frontend
bun run tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 3: Manual verification checklist**

Start the dev environment and open the app:

```bash
cd /home/konstantin-nomerotski/Documents/ligand-x
make dev
# Open http://localhost:3000
```

Check each of the following:

| # | Action | Expected |
|---|--------|----------|
| 1 | Open any service tool (e.g. MD) → Results step | Job list visible, `ChevronUp` icon next to title |
| 2 | Click the title / chevron in expanded header | List collapses to slim bar with title + job count + `ChevronDown` |
| 3 | Click anywhere on the slim bar | List expands again |
| 4 | Select a job | Results appear below; list stays in current minimize state |
| 5 | While list is minimized, click the active job (via expand → click → minimize again is fine) | Job deselects, results clear, list auto-expands |
| 6 | Click an unselected job | Selects it, shows results |
| 7 | Click the already-selected job | Deselects it, clears results, list expands |
| 8 | Open unified Results browser | Same minimize/expand behaviour with all service filters |
| 9 | Resize handle works when expanded | Drag-resize still functions |
| 10 | Resize handle absent when minimized | No resize handle visible in slim bar |

- [ ] **Step 4: Commit**

```bash
cd /home/konstantin-nomerotski/Documents/ligand-x
git add frontend/src/components/Tools/shared/UnifiedJobList.tsx
git commit -m "feat: minimizable job list with toggle-deselect behaviour"
```
