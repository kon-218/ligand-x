# Unified Tool UX System

This document describes the unified UX components for calculation tools (Docking, MD, Boltz2, ABFE, ADMET).

## Overview

All calculation tools now follow a consistent 4-step wizard pattern:

1. **Selection** - Choose protein and ligand structures
2. **Parameters** - Configure calculation settings
3. **Execute** - Review configuration and start calculation
4. **Results** - View results with actions (save, download, optimize)

## Shared Components

Located in `/src/components/Tools/shared/`:

### WorkflowContainer

Main wrapper component that provides consistent layout:

```tsx
<WorkflowContainer
  title="Tool Name"
  description="Brief description"
  icon={<IconComponent />}
  steps={STEPS}
  currentStep={store.currentStep}
  onStepClick={(step) => store.setStep(step)}
  onBack={store.previousStep}
  onNext={store.nextStep}
  onReset={store.reset}
  onExecute={runCalculation}
  canProceed={isValid}
  isRunning={store.isRunning}
  executeLabel="Start"
  accentColor="blue"
  error={error}
>
  {/* Step content */}
</WorkflowContainer>
```

### StepIndicator

Visual step progress indicator with clickable steps:

```tsx
<StepIndicator
  steps={[
    { id: 1, label: 'Selection' },
    { id: 2, label: 'Parameters' },
    { id: 3, label: 'Execute' },
    { id: 4, label: 'Results' },
  ]}
  currentStep={2}
  onStepClick={(step) => setStep(step)}
  accentColor="blue"
/>
```

### StructureSelector

Unified protein/ligand selection with multiple input methods:

```tsx
<StructureSelector
  selectedProtein={protein}
  onProteinSelect={setProtein}
  hasProtein={!!currentStructure}
  proteinName={currentStructure?.structure_id}
  selectedLigand={ligand}
  onLigandSelect={setLigand}
  availableLigands={ligands}
  ligandInputMethod="existing"
  onLigandMethodChange={setMethod}
  showSmilesInput
  showFileUpload
  accentColor="blue"
/>
```

### Parameter Components

Consistent parameter input components:

```tsx
// Slider with value display
<SliderParameter
  label="Temperature"
  value={300}
  onChange={setTemp}
  min={250}
  max={400}
  unit="K"
  description="Simulation temperature"
/>

// Select dropdown
<SelectParameter
  label="Method"
  value="vina"
  onChange={setMethod}
  options={[
    { value: 'vina', label: 'AutoDock Vina' },
    { value: 'vinardo', label: 'Vinardo' },
  ]}
/>

// Toggle switch
<ToggleParameter
  label="Fast Mode"
  value={fastMode}
  onChange={setFastMode}
  description="Faster but less accurate"
/>

// Preset selector
<PresetSelector
  label="Simulation Preset"
  presets={[
    { id: 'quick', name: 'Quick', description: '~30 min' },
    { id: 'standard', name: 'Standard', description: '~2 hours' },
  ]}
  selectedPreset="standard"
  onPresetSelect={setPreset}
/>

// Collapsible section
<ParameterSection title="Advanced Options" collapsible defaultExpanded={false}>
  {/* Parameters */}
</ParameterSection>
```

### ExecutionPanel

Progress display during calculation:

```tsx
<ExecutionPanel
  isRunning={isRunning}
  progress={75}
  progressMessage="Running equilibration..."
  completedStages={['Preparation', 'Minimization']}
  error={error}
  configSummary={[
    { label: 'Protein', value: 'PDB_1ABC' },
    { label: 'Ligand', value: 'ATP' },
  ]}
/>
```

### ResultsContainer

Unified results display with actions:

```tsx
<ResultsContainer
  status="success"
  isRunning={false}
  error={null}
  onNewCalculation={reset}
  onDownload={download}
  onSave={saveToLibrary}
  onOptimize={optimizeWithMD}
>
  <ResultMetric
    label="Binding Affinity"
    value={-8.5}
    unit="kcal/mol"
    status="good"
    description="Strong binding"
  />
  <ResultsTable
    columns={[
      { key: 'pose', label: 'Pose' },
      { key: 'affinity', label: 'Affinity', align: 'right' },
    ]}
    data={poses}
    onRowClick={selectPose}
    selectedIndex={selectedPose}
  />
</ResultsContainer>
```

### InfoBox

Contextual information display:

```tsx
<InfoBox variant="info" title="About This Tool">
  Description of the tool and its purpose.
</InfoBox>

// Variants: info, warning, success, error, tip
```

## Accent Colors

Each tool uses a distinct accent color for visual differentiation:

| Tool | Color | Usage |
|------|-------|-------|
| Docking | `blue` | Primary calculation tool |
| MD Optimization | `green` | Simulation/optimization |
| Boltz-2 | `purple` | AI/ML prediction |
| ABFE | `orange` | Free energy calculation |
| ADMET | `pink` | Property prediction |

## Migration Guide

To migrate an existing tool to the unified UX:

1. Import shared components:
```tsx
import {
  WorkflowContainer,
  StructureSelector,
  ParameterSection,
  ExecutionPanel,
  ResultsContainer,
} from './shared'
```

2. Define workflow steps:
```tsx
const STEPS: WorkflowStep[] = [
  { id: 1, label: 'Selection' },
  { id: 2, label: 'Parameters' },
  { id: 3, label: 'Execute' },
  { id: 4, label: 'Results' },
]
```

3. Wrap content in WorkflowContainer:
```tsx
return (
  <WorkflowContainer
    title="Tool Name"
    steps={STEPS}
    currentStep={store.currentStep}
    // ... other props
  >
    {renderStepContent()}
  </WorkflowContainer>
)
```

4. Replace custom step content with shared components.

## Benefits

- **Consistency**: Users learn one pattern, apply everywhere
- **Maintainability**: Single source of truth for UI components
- **Accessibility**: Unified keyboard navigation and focus management
- **Theming**: Easy to update colors/styles globally
- **Testing**: Shared components can be tested once

## File Structure

```
src/components/Tools/
├── shared/
│   ├── index.ts              # Exports all components
│   ├── types.ts              # Shared type definitions
│   ├── WorkflowContainer.tsx # Main wrapper
│   ├── StepIndicator.tsx     # Step progress
│   ├── WorkflowNavigation.tsx # Back/Next/Reset buttons
│   ├── StructureSelector.tsx # Input selection
│   ├── ParameterSection.tsx  # Parameter inputs
│   ├── ExecutionPanel.tsx    # Progress display
│   ├── ResultsContainer.tsx  # Results display
│   └── InfoBox.tsx           # Info/warning boxes
├── Docking/
├── MD/
├── Boltz2/
├── ABFE/
└── ADMET/
```
