# QC Workflow Cards in New Experiment Overlay

**Date:** 2026-04-02  
**Status:** Approved

## Problem

The New Experiment overlay shows a single "Quantum Chemistry" card. Users must open the tool, then discover and select the correct calculation type from small icon tabs inside the panel. This creates friction for users who know what they want to run.

## Solution

Replace the single QC card in the New Experiment overlay with 7 cards — one per workflow/capability — so users can jump directly into the right configuration.

## Cards

| Card | calculationType | workflow |
|------|----------------|----------|
| Geometry Optimization | standard | optimize |
| IR Spectrum & Thermochemistry | standard | ir |
| Electronic Properties | standard | properties |
| Fukui Indices | fukui | — |
| Conformer Search | conformer | — |
| BDE Calculation | bde | — |
| Custom QC | — (no pre-selection) | — |

## Architecture

### Option chosen: Pending navigation via QC store (Option B)

No changes to `tools-config.ts` or the SidePanel. All QC workflow cards open the existing `quantum-chemistry` tool. Pre-selection is communicated via a transient store field.

### Files changed

**1. `frontend/src/store/qc-store.ts`**

Add to the store interface and implementation:
```ts
pendingInitialState: {
  calculationType: 'standard' | 'fukui' | 'conformer' | 'bde'
  workflow?: 'optimize' | 'ir' | 'properties'
} | null
setPendingInitialState: (state: { calculationType: ..., workflow?: ... }) => void
clearPendingInitialState: () => void
```

**2. `frontend/src/components/Layout/OverlayPages.tsx`**

- Define `QC_WORKFLOW_CARDS` constant inline — 7 entries with `{ id, name, description, iconName, accentColor, calculationType?, workflow? }`.
- In `NewExperimentOverlay`, when iterating `experimentTools` and the tool is `quantum-chemistry`, render all 7 QC cards instead of the single card.
- `handleToolSelect` for QC cards: call `setPendingInitialState` on the QC store before `addExperimentTool / setActiveTool / closeOverlay`. The Custom QC card does not call `setPendingInitialState`.

**3. `frontend/src/components/Tools/QuantumChemistryTool.tsx`**

- Lift `selectedWorkflow` state up from `QCTabSetup` to `QuantumChemistryTool` and pass it down as a controlled prop.
- Add a `useEffect` (runs once on mount): if `pendingInitialState` is set, apply `setCalculationType` and `setSelectedWorkflow`, then call `clearPendingInitialState`.

**4. `frontend/src/components/Tools/QuantumChemistry/QCTabSetup.tsx`**

- Accept `selectedWorkflow` and `onSelectedWorkflowChange` as controlled props (mirroring how `selectedLigandId` is already handled — local fallback if prop is undefined).

## Data flow

```
User clicks "Geometry Optimization" card
  → setPendingInitialState({ calculationType: 'standard', workflow: 'optimize' })
  → addExperimentTool('quantum-chemistry')
  → setActiveTool('quantum-chemistry')
  → closeOverlay()
  → QuantumChemistryTool mounts
  → useEffect reads pendingInitialState
  → setCalculationType('standard'), setSelectedWorkflow('optimize')
  → clearPendingInitialState()
  → Tool renders with correct workflow pre-selected
```

## What does NOT change

- `tools-config.ts` — single `quantum-chemistry` entry unchanged
- `SidePanel` routing — unchanged
- All QC submission logic — unchanged
- Results tab — unchanged
