# QC Workflow Cards in New Experiment Overlay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single "Quantum Chemistry" card in the New Experiment overlay with 7 individual workflow cards so users land directly in the right QC configuration.

**Architecture:** Add `pendingInitialState` to the QC Zustand store; New Experiment overlay sets it before opening the tool; `QuantumChemistryTool` reads and clears it on mount. `selectedWorkflow` is lifted from `QCTabSetup` local state to `QuantumChemistryTool` so it can be set externally.

**Tech Stack:** React 19, TypeScript, Zustand, Next.js 15, Tailwind CSS, Lucide icons

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/store/qc-store.ts` | Add `pendingInitialState` field + 2 actions |
| `frontend/src/components/Tools/QuantumChemistry/QCTabSetup.tsx` | Accept `selectedWorkflow` / `onSelectedWorkflowChange` as controlled props |
| `frontend/src/components/Tools/QuantumChemistryTool.tsx` | Lift `selectedWorkflow` state up; add mount effect to apply pending nav |
| `frontend/src/components/Layout/OverlayPages.tsx` | Define `QC_WORKFLOW_CARDS`; replace single QC card with 7 cards; set pending state on click |

---

### Task 1: Add `pendingInitialState` to QC store

**Files:**
- Modify: `frontend/src/store/qc-store.ts`

- [ ] **Step 1: Add the type and field to the store interface**

In `frontend/src/store/qc-store.ts`, inside the `QCStore` interface (after `advancedParameters: QCAdvancedParameters | null`), add:

```ts
pendingInitialState: {
  calculationType: 'standard' | 'fukui' | 'conformer' | 'bde'
  workflow?: 'optimize' | 'ir' | 'properties'
} | null
setPendingInitialState: (state: { calculationType: 'standard' | 'fukui' | 'conformer' | 'bde'; workflow?: 'optimize' | 'ir' | 'properties' }) => void
clearPendingInitialState: () => void
```

- [ ] **Step 2: Add initial value and action implementations**

In the `create<QCStore>` call, add to the initial state (after `advancedParameters: null`):

```ts
pendingInitialState: null,
```

Add the action implementations (after `setAdvancedParameters` and `updateAdvancedParameters`):

```ts
setPendingInitialState: (state) => set({ pendingInitialState: state }),
clearPendingInitialState: () => set({ pendingInitialState: null }),
```

Also add `pendingInitialState: null` to the `reset()` action's set call.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/qc-store.ts
git commit -m "feat: add pendingInitialState to QC store for new-experiment pre-navigation"
```

---

### Task 2: Lift `selectedWorkflow` state into `QuantumChemistryTool`

**Files:**
- Modify: `frontend/src/components/Tools/QuantumChemistry/QCTabSetup.tsx`
- Modify: `frontend/src/components/Tools/QuantumChemistryTool.tsx`

- [ ] **Step 1: Add controlled props to `QCTabSetupProps`**

In `frontend/src/components/Tools/QuantumChemistry/QCTabSetup.tsx`, add two optional props to the `QCTabSetupProps` interface (after `onCalculationTypeChange`):

```ts
selectedWorkflow?: QCCalculationWorkflow
onSelectedWorkflowChange?: (workflow: QCCalculationWorkflow) => void
```

- [ ] **Step 2: Replace local `selectedWorkflow` state with controlled pattern**

Find this in `QCTabSetup` (around line 188):
```ts
const [selectedWorkflow, setSelectedWorkflow] = useState<QCCalculationWorkflow>('optimize')
```

Replace with:
```ts
const [localSelectedWorkflow, setLocalSelectedWorkflow] = useState<QCCalculationWorkflow>('optimize')
const selectedWorkflow = props.selectedWorkflow !== undefined ? props.selectedWorkflow : localSelectedWorkflow
const setSelectedWorkflow = (workflow: QCCalculationWorkflow) => {
    if (props.onSelectedWorkflowChange) {
        props.onSelectedWorkflowChange(workflow)
    } else {
        setLocalSelectedWorkflow(workflow)
    }
}
```

Note: the destructured props in the function signature need `selectedWorkflow: controlledSelectedWorkflow` aliasing. Update the function signature destructuring to add:

```ts
selectedWorkflow: controlledSelectedWorkflow,
onSelectedWorkflowChange,
```

Then use:
```ts
const selectedWorkflow = controlledSelectedWorkflow !== undefined ? controlledSelectedWorkflow : localSelectedWorkflow
const setSelectedWorkflow = (workflow: QCCalculationWorkflow) => {
    if (onSelectedWorkflowChange) {
        onSelectedWorkflowChange(workflow)
    } else {
        setLocalSelectedWorkflow(workflow)
    }
}
```

- [ ] **Step 3: Add `selectedWorkflow` and `onSelectedWorkflowChange` state to `QuantumChemistryTool`**

In `frontend/src/components/Tools/QuantumChemistryTool.tsx`, add to the local state section (after `calculationType` state, around line 49):

```ts
const [selectedWorkflow, setSelectedWorkflow] = useState<'optimize' | 'ir' | 'properties'>('optimize')
```

Add the import for the type at the top of the file:
```ts
import type { QCCalculationWorkflow } from '@/types/qc'
```

Then update the `<QCTabSetup>` JSX in the render to pass these as props (in the `activeTab === 'setup'` block):
```tsx
selectedWorkflow={selectedWorkflow}
onSelectedWorkflowChange={setSelectedWorkflow}
```

- [ ] **Step 4: Verify types compile**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "qc|QC|QuantumChem" | head -20
```

Expected: no errors related to QC files.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Tools/QuantumChemistry/QCTabSetup.tsx \
        frontend/src/components/Tools/QuantumChemistryTool.tsx
git commit -m "refactor: lift selectedWorkflow state to QuantumChemistryTool for external control"
```

---

### Task 3: Apply pending navigation on mount in `QuantumChemistryTool`

**Files:**
- Modify: `frontend/src/components/Tools/QuantumChemistryTool.tsx`

- [ ] **Step 1: Destructure the two new store actions**

In `QuantumChemistryTool`, the `useQCStore` destructuring already exists. Add to it:

```ts
clearPendingInitialState,
```

Full updated destructure (find the existing one and add the new field):
```ts
const {
    activeJobId,
    results,
    activeResults,
    advancedParameters,
    setActiveJob,
    setIsRunning,
    setResults,
    setActiveResults,
    setAdvancedParameters,
    clearPendingInitialState,
} = useQCStore()
```

- [ ] **Step 2: Add mount effect to apply pending navigation**

Add this `useEffect` near the top of the component, after the existing state declarations and before other effects:

```ts
// Apply pre-selected workflow from New Experiment overlay navigation
useEffect(() => {
    const pending = useQCStore.getState().pendingInitialState
    if (pending) {
        setCalculationType(pending.calculationType)
        if (pending.workflow) setSelectedWorkflow(pending.workflow)
        clearPendingInitialState()
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

- [ ] **Step 3: Verify types compile**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "qc|QC|QuantumChem" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Tools/QuantumChemistryTool.tsx
git commit -m "feat: apply pending QC navigation state on tool mount"
```

---

### Task 4: Add 7 QC workflow cards to the New Experiment overlay

**Files:**
- Modify: `frontend/src/components/Layout/OverlayPages.tsx`

- [ ] **Step 1: Add missing icon imports**

At the top of `OverlayPages.tsx`, the lucide-react import currently includes `Zap` and `FlaskConical`. Add `Waves`, `Atom`, `Layers`, `Scissors` to it:

```ts
import {
  FolderOpen,
  Library,
  Settings,
  HelpCircle,
  User,
  FlaskConical,
  ArrowLeft,
  X,
  Plus,
  ScanSearch,
  Target,
  Activity,
  Flame,
  GitBranch,
  Sparkles,
  Beaker,
  Zap,
  Loader2,
  Waves,
  Atom,
  Layers,
  Scissors,
} from 'lucide-react'
```

- [ ] **Step 2: Add new icons to `iconMap`**

Find the `iconMap` constant and add entries for the new icons:

```ts
const iconMap: Record<string, React.ReactNode> = {
  ScanSearch: <ScanSearch className="w-6 h-6" />,
  Target: <Target className="w-6 h-6" />,
  Activity: <Activity className="w-6 h-6" />,
  Flame: <Flame className="w-6 h-6" />,
  GitBranch: <GitBranch className="w-6 h-6" />,
  Sparkles: <Sparkles className="w-6 h-6" />,
  Beaker: <Beaker className="w-6 h-6" />,
  Zap: <Zap className="w-6 h-6" />,
  FlaskConical: <FlaskConical className="w-6 h-6" />,
  Waves: <Waves className="w-6 h-6" />,
  Atom: <Atom className="w-6 h-6" />,
  Layers: <Layers className="w-6 h-6" />,
  Scissors: <Scissors className="w-6 h-6" />,
}
```

- [ ] **Step 3: Add `useQCStore` import**

Add at the top of `OverlayPages.tsx` (with other imports):

```ts
import { useQCStore } from '@/store/qc-store'
```

- [ ] **Step 4: Define `QC_WORKFLOW_CARDS` constant**

Add this constant before the `NewExperimentOverlay` function:

```ts
interface QCWorkflowCard {
  id: string
  name: string
  description: string
  iconName: string
  accentColor: string
  calculationType?: 'standard' | 'fukui' | 'conformer' | 'bde'
  workflow?: 'optimize' | 'ir' | 'properties'
}

const QC_WORKFLOW_CARDS: QCWorkflowCard[] = [
  {
    id: 'qc-optimize',
    name: 'Geometry Optimization',
    description: 'Find the lowest-energy 3D structure of your molecule.',
    iconName: 'FlaskConical',
    accentColor: 'blue',
    calculationType: 'standard',
    workflow: 'optimize',
  },
  {
    id: 'qc-ir',
    name: 'IR Spectrum & Thermochemistry',
    description: 'Compute vibrational frequencies, IR spectrum, and ΔG/ΔH thermochemistry.',
    iconName: 'Waves',
    accentColor: 'purple',
    calculationType: 'standard',
    workflow: 'ir',
  },
  {
    id: 'qc-properties',
    name: 'Electronic Properties',
    description: 'Single-point calculation for charges, HOMO/LUMO gap, and dipole moment.',
    iconName: 'Atom',
    accentColor: 'teal',
    calculationType: 'standard',
    workflow: 'properties',
  },
  {
    id: 'qc-fukui',
    name: 'Fukui Indices',
    description: 'Identify electrophilic and nucleophilic attack sites on your molecule.',
    iconName: 'Zap',
    accentColor: 'orange',
    calculationType: 'fukui',
  },
  {
    id: 'qc-conformer',
    name: 'Conformer Search',
    description: 'Enumerate and rank low-energy conformers with r2SCAN-3c refinement.',
    iconName: 'Layers',
    accentColor: 'green',
    calculationType: 'conformer',
  },
  {
    id: 'qc-bde',
    name: 'Bond Dissociation Energy',
    description: 'Calculate BDE for every bond in the molecule to identify weak points.',
    iconName: 'Scissors',
    accentColor: 'indigo',
    calculationType: 'bde',
  },
  {
    id: 'qc-custom',
    name: 'Custom QC',
    description: 'Full ORCA quantum chemistry with custom method, basis set, and properties.',
    iconName: 'Zap',
    accentColor: 'blue',
    // no calculationType — opens tool with default state
  },
]
```

- [ ] **Step 5: Update `NewExperimentOverlay` to render QC workflow cards**

Inside `NewExperimentOverlay`, add the `setPendingInitialState` action from the QC store:

```ts
const { setPendingInitialState } = useQCStore()
```

Add a handler for QC workflow card clicks:

```ts
const handleQCWorkflowSelect = (card: QCWorkflowCard) => {
  if (card.calculationType) {
    setPendingInitialState({
      calculationType: card.calculationType,
      workflow: card.workflow,
    })
  }
  addExperimentTool('quantum-chemistry')
  setActiveTool('quantum-chemistry')
  closeOverlay()
}
```

In the grid rendering, replace the current `tools.map(...)` with a `flatMap` that expands the QC tool into the 7 cards:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {tools.flatMap((tool) => {
    if (tool.id === 'quantum-chemistry') {
      return QC_WORKFLOW_CARDS.map((card) => {
        const accent = card.accentColor
        return (
          <button
            key={card.id}
            onClick={() => handleQCWorkflowSelect(card)}
            className={cn(
              "group relative p-5 rounded-xl text-left transition-all duration-300",
              "bg-gray-900 border border-gray-800",
              "hover:border-transparent hover:shadow-lg",
            )}
          >
            {/* Hover glow */}
            <div
              className={cn(
                "absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              )}
              style={{
                boxShadow: accent === 'purple' ? '0 0 30px rgba(168, 85, 247, 0.15)' :
                           accent === 'indigo' ? '0 0 30px rgba(99, 102, 241, 0.15)' :
                           accent === 'green' ? '0 0 30px rgba(34, 197, 94, 0.15)' :
                           accent === 'orange' ? '0 0 30px rgba(249, 115, 22, 0.15)' :
                           accent === 'cyan' ? '0 0 30px rgba(6, 182, 212, 0.15)' :
                           accent === 'teal' ? '0 0 30px rgba(20, 184, 166, 0.15)' :
                           '0 0 30px rgba(59, 130, 246, 0.15)',
              }}
            />
            {/* Hover border */}
            <div
              className={cn(
                "absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none border-2",
                accent === 'purple' && "border-purple-500",
                accent === 'indigo' && "border-indigo-500",
                accent === 'green' && "border-green-500",
                accent === 'orange' && "border-orange-500",
                accent === 'cyan' && "border-cyan-500",
                accent === 'teal' && "border-teal-500",
                accent === 'blue' && "border-blue-500",
              )}
            />
            <div className="relative flex items-start gap-4">
              <div
                className={cn(
                  "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300",
                  "bg-gray-800 text-gray-400",
                  accent === 'purple' && "group-hover:bg-purple-500/20 group-hover:text-purple-400",
                  accent === 'indigo' && "group-hover:bg-indigo-500/20 group-hover:text-indigo-400",
                  accent === 'green' && "group-hover:bg-green-500/20 group-hover:text-green-400",
                  accent === 'orange' && "group-hover:bg-orange-500/20 group-hover:text-orange-400",
                  accent === 'cyan' && "group-hover:bg-cyan-500/20 group-hover:text-cyan-400",
                  accent === 'teal' && "group-hover:bg-teal-500/20 group-hover:text-teal-400",
                  accent === 'blue' && "group-hover:bg-blue-500/20 group-hover:text-blue-400",
                )}
              >
                {iconMap[card.iconName]}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white mb-1">{card.name}</h3>
                <p className="text-sm text-gray-500 group-hover:text-gray-400 transition-colors line-clamp-2">
                  {card.description}
                </p>
              </div>
            </div>
          </button>
        )
      })
    }

    // Default: render existing tool card as before
    const accent = tool.accentColor || 'blue'
    return [(
      <button
        key={tool.id}
        onClick={() => handleToolSelect(tool.id as string)}
        className={cn(
          "group relative p-5 rounded-xl text-left transition-all duration-300",
          "bg-gray-900 border border-gray-800",
          "hover:border-transparent hover:shadow-lg",
        )}
      >
        {/* Hover glow effect */}
        <div
          className={cn(
            "absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300",
            "pointer-events-none"
          )}
          style={{
            boxShadow: accent === 'purple' ? '0 0 30px rgba(168, 85, 247, 0.15)' :
                       accent === 'indigo' ? '0 0 30px rgba(99, 102, 241, 0.15)' :
                       accent === 'green' ? '0 0 30px rgba(34, 197, 94, 0.15)' :
                       accent === 'orange' ? '0 0 30px rgba(249, 115, 22, 0.15)' :
                       accent === 'cyan' ? '0 0 30px rgba(6, 182, 212, 0.15)' :
                       accent === 'teal' ? '0 0 30px rgba(20, 184, 166, 0.15)' :
                       '0 0 30px rgba(59, 130, 246, 0.15)',
          }}
        />
        {/* Hover border */}
        <div
          className={cn(
            "absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300",
            "pointer-events-none border-2",
            accent === 'purple' && "border-purple-500",
            accent === 'indigo' && "border-indigo-500",
            accent === 'green' && "border-green-500",
            accent === 'orange' && "border-orange-500",
            accent === 'cyan' && "border-cyan-500",
            accent === 'teal' && "border-teal-500",
            accent === 'blue' && "border-blue-500",
          )}
        />
        <div className="relative flex items-start gap-4">
          <div
            className={cn(
              "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300",
              "bg-gray-800 text-gray-400",
              "group-hover:text-white",
              accent === 'purple' && "group-hover:bg-purple-500/20 group-hover:text-purple-400",
              accent === 'indigo' && "group-hover:bg-indigo-500/20 group-hover:text-indigo-400",
              accent === 'green' && "group-hover:bg-green-500/20 group-hover:text-green-400",
              accent === 'orange' && "group-hover:bg-orange-500/20 group-hover:text-orange-400",
              accent === 'cyan' && "group-hover:bg-cyan-500/20 group-hover:text-cyan-400",
              accent === 'teal' && "group-hover:bg-teal-500/20 group-hover:text-teal-400",
              accent === 'blue' && "group-hover:bg-blue-500/20 group-hover:text-blue-400",
            )}
          >
            {iconMap[tool.iconName]}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white mb-1 group-hover:text-white transition-colors">
              {tool.name}
            </h3>
            <p className="text-sm text-gray-500 group-hover:text-gray-400 transition-colors line-clamp-2">
              {tool.description}
            </p>
          </div>
        </div>
      </button>
    )]
  })}
</div>
```

- [ ] **Step 6: Verify types compile**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "OverlayPages|qc-store" | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Layout/OverlayPages.tsx
git commit -m "feat: expand QC new-experiment card into 7 workflow-specific cards"
```
