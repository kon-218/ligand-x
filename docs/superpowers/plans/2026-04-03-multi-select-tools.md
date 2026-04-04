# Multi-Select Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to Ctrl+click multiple tools in the New Experiment overlay, see visual selection feedback, and load all selected tools into the sidebar simultaneously.

**Architecture:** Track selected tool IDs in NewExperimentOverlay state. On Ctrl+click, toggle selection and update card styles. When "Load Tools" button is clicked, dispatch a new `addMultipleExperimentTools()` action that adds all selected tools. Close overlay after loading.

**Tech Stack:** React hooks (useState), Zustand (ui-store), Tailwind CSS (selection styling)

---

## File Structure

**Modify:**
- `frontend/src/components/Layout/OverlayPages.tsx` - Add selection state, Ctrl+click handler, visual feedback, instruction subtitle, Load Tools button
- `frontend/src/store/ui-store.ts` - Add `addMultipleExperimentTools()` action

---

## Tasks

### Task 1: Add `addMultipleExperimentTools()` action to UI store

**Files:**
- Modify: `frontend/src/store/ui-store.ts`

- [ ] **Step 1: Read the current ui-store to understand the pattern**

Run: `grep -A 10 "addExperimentTool" frontend/src/store/ui-store.ts`

This shows the existing single-tool action pattern you need to follow.

- [ ] **Step 2: Add `addMultipleExperimentTools` action**

After the `addExperimentTool` method in the store, add:

```typescript
addMultipleExperimentTools: (toolIds: string[]) =>
  set((state) => ({
    experimentTools: [...state.experimentTools, ...toolIds.map(id => id as any)],
  })),
```

(Place it right after `addExperimentTool` method, maintaining consistent style)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/ui-store.ts
git commit -m "feat: add addMultipleExperimentTools action to ui-store"
```

---

### Task 2: Add multi-select state and Ctrl+click handler to NewExperimentOverlay

**Files:**
- Modify: `frontend/src/components/Layout/OverlayPages.tsx` (NewExperimentOverlay function)

- [ ] **Step 1: Add useState for selected tools**

Inside `NewExperimentOverlay()`, after the existing state declarations, add:

```typescript
const [selectedToolIds, setSelectedToolIds] = useState<Set<string>>(new Set())
```

- [ ] **Step 2: Create Ctrl+click handler for regular tools**

Add this handler function inside NewExperimentOverlay (after handleQCWorkflowSelect):

```typescript
const handleToolClick = (toolId: string, event: React.MouseEvent<HTMLButtonElement>) => {
  if (event.ctrlKey || event.metaKey) {
    // Ctrl/Cmd click: toggle selection
    event.preventDefault()
    setSelectedToolIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(toolId)) {
        newSet.delete(toolId)
      } else {
        newSet.add(toolId)
      }
      return newSet
    })
  } else {
    // Regular click: select single tool (existing behavior)
    handleToolSelect(toolId)
  }
}
```

- [ ] **Step 3: Create Ctrl+click handler for QC workflow cards**

Add this handler function inside NewExperimentOverlay (after handleToolClick):

```typescript
const handleQCWorkflowClick = (card: QCWorkflowCard, event: React.MouseEvent<HTMLButtonElement>) => {
  if (event.ctrlKey || event.metaKey) {
    // Ctrl/Cmd click: toggle selection (use card.id as toolId)
    event.preventDefault()
    setSelectedToolIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(card.id)) {
        newSet.delete(card.id)
      } else {
        newSet.add(card.id)
      }
      return newSet
    })
    return
  }
  // Regular click: select single QC workflow (existing behavior)
  handleQCWorkflowSelect(card)
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Layout/OverlayPages.tsx
git commit -m "feat: add multi-select state and Ctrl+click handlers to NewExperimentOverlay"
```

---

### Task 3: Add instruction subtitle under the header

**Files:**
- Modify: `frontend/src/components/Layout/OverlayPages.tsx` (NewExperimentOverlay, Header section)

- [ ] **Step 1: Update the header description paragraph**

Find this section in NewExperimentOverlay (around line 388):

```typescript
<p className="text-sm text-gray-400 mt-1">
  Choose a computational tool to start your analysis
</p>
```

Replace it with:

```typescript
<div className="space-y-1">
  <p className="text-sm text-gray-400">
    Choose a computational tool to start your analysis
  </p>
  <p className="text-xs text-gray-500">
    Hold Ctrl and click to select multiple tools
  </p>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Layout/OverlayPages.tsx
git commit -m "feat: add Ctrl+click instruction subtitle to New Experiment header"
```

---

### Task 4: Update card onClick to use new handlers and add selection visual feedback

**Files:**
- Modify: `frontend/src/components/Layout/OverlayPages.tsx` (NewExperimentOverlay, cards section)

- [ ] **Step 1: Find the card mapping section**

Locate the section around line 432 where cards are rendered. Find this onClick handler:

```typescript
onClick={() => handleQCWorkflowSelect(card)}
```

Replace with:

```typescript
onClick={(e) => handleQCWorkflowClick(card, e)}
```

- [ ] **Step 2: Update regular tool card onClick**

Find the non-QC card onClick around line 429:

```typescript
onClick={() => handleToolSelect(tool.id as string)}
```

Replace with:

```typescript
onClick={(e) => handleToolClick(tool.id as string, e)}
```

- [ ] **Step 3: Add selection styling to the card className**

Find the button className around line 436. Update it to include selection state:

```typescript
className={cn(
  "group relative p-6 rounded-2xl text-left transition-all duration-300",
  "bg-gray-900/40 border border-gray-800/80 backdrop-blur-sm overflow-hidden",
  "hover:bg-gray-800/50 hover:border-gray-700",
  selectedToolIds.has(id) && "border-2 scale-[1.02]",
  selectedToolIds.has(id) && accent === 'purple' && "border-purple-500/60 shadow-[0_0_20px_rgba(168,85,247,0.3)]",
  selectedToolIds.has(id) && accent === 'indigo' && "border-indigo-500/60 shadow-[0_0_20px_rgba(99,102,241,0.3)]",
  selectedToolIds.has(id) && accent === 'green' && "border-green-500/60 shadow-[0_0_20px_rgba(34,197,94,0.3)]",
  selectedToolIds.has(id) && accent === 'orange' && "border-orange-500/60 shadow-[0_0_20px_rgba(249,115,22,0.3)]",
  selectedToolIds.has(id) && accent === 'cyan' && "border-cyan-500/60 shadow-[0_0_20px_rgba(6,182,212,0.3)]",
  selectedToolIds.has(id) && accent === 'teal' && "border-teal-500/60 shadow-[0_0_20px_rgba(20,184,166,0.3)]",
  selectedToolIds.has(id) && accent === 'blue' && "border-blue-500/60 shadow-[0_0_20px_rgba(59,130,246,0.3)]",
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Layout/OverlayPages.tsx
git commit -m "feat: add selection visual feedback to tool cards"
```

---

### Task 5: Add Load Tools button at bottom of overlay

**Files:**
- Modify: `frontend/src/components/Layout/OverlayPages.tsx` (NewExperimentOverlay, before closing tags)

- [ ] **Step 1: Find the closing div of the Tool Categories section**

This is around line 506. After the closing `</div>` of the categories section and before the outer `</div>`, add:

```typescript
{/* Load Tools Button */}
{selectedToolIds.size > 0 && (
  <div className="fixed bottom-6 right-6 z-40">
    <button
      onClick={() => {
        addMultipleExperimentTools(Array.from(selectedToolIds))
        closeOverlay()
      }}
      className={cn(
        "px-6 py-3 rounded-xl font-semibold transition-all duration-300",
        "bg-gradient-to-r from-cyan-500 to-blue-500 text-gray-900",
        "hover:from-cyan-400 hover:to-blue-400 hover:scale-105",
        "shadow-lg hover:shadow-xl"
      )}
    >
      Load {selectedToolIds.size} Tool{selectedToolIds.size !== 1 ? 's' : ''}
    </button>
  </div>
)}
```

- [ ] **Step 2: Add the import for `addMultipleExperimentTools`**

At the top of NewExperimentOverlay function, update the destructuring from useUIStore:

```typescript
const { closeOverlay, setActiveTool, addExperimentTool, addMultipleExperimentTools, sidebarWidth } = useUIStore()
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Layout/OverlayPages.tsx
git commit -m "feat: add Load Tools button with selection counter"
```

---

### Task 6: Test the multi-select flow manually

**Files:**
- Test: Manual in-browser testing

- [ ] **Step 1: Start development server**

```bash
make dev
```

Expected: Frontend loads at http://localhost:3000

- [ ] **Step 2: Open New Experiment overlay**

Click the "+ New Experiment" button in the sidebar.

- [ ] **Step 3: Test Ctrl+click selection**

Hold Ctrl and click on 2-3 different tool cards. Verify:
- Cards show colored borders matching their accent color
- Cards have a subtle glow/shadow
- Cards scale up slightly (1.02x)
- Instruction subtitle is visible under the header

- [ ] **Step 4: Test Load Tools button**

Verify the button appears at bottom-right showing "Load 3 Tools". Click it.

Expected:
- Overlay closes
- All 3 tools appear as new tabs in the sidebar
- Can switch between them

- [ ] **Step 5: Test single-click behavior still works**

Click a single tool without Ctrl. Should open that tool immediately (existing behavior).

- [ ] **Step 6: Test deselection**

Ctrl+click a selected card again. It should deselect (border goes back to gray).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: verify multi-select flow works end-to-end"
```

---

## Self-Review Checklist

✓ **Spec coverage:**
- Ctrl+click multi-select: Task 2 ✓
- Selection visual feedback (colored borders, glow): Task 4 ✓
- Load Tools button with counter: Task 5 ✓
- Subtitle instruction: Task 3 ✓
- Add multiple tools to sidebar: Task 1 ✓

✓ **Placeholder scan:** No "TBD", "TODO", or vague instructions — all code is complete and runnable.

✓ **Type consistency:** 
- `selectedToolIds: Set<string>` used consistently
- Action `addMultipleExperimentTools(toolIds: string[])` signature matches usage
- Card `id` field maps to store toolId

✓ **No gaps:** All requirements implemented.
