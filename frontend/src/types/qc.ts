// Type definitions for Quantum Chemistry workflow

export interface QCPreset {
    id: string
    name: string
    description: string
    method: string
    basis_set: string
    keywords: string[]
    use_case: string
}

export interface QCJob {
    id: string
    molecule_id: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    job_type?: 'standard' | 'ir' | 'fukui' | 'conformer' | 'bde'
    method: string
    basis_set: string
    created_at: string
    updated_at: string
    progress?: {
        percent: number
        step: string
        details: string
        updated_at: string
    }
    completed_stages?: string[]
    error_message?: string
}

export interface QCResults {
    energy?: number
    homo?: number
    lumo?: number
    dipole_moment?: number
    mulliken_charges?: number[]
    fukui?: {
        atoms: string[]
        f_plus: number[]
        f_minus: number[]
        f_zero: number[]
        charges_neutral: number[]
    }
    ir_spectrum?: {
        frequencies: number[]
        intensities: number[]
    }
    conformers?: Array<{
        conf_id: number
        energy_hartree: number
        rel_energy_kcal: number
        xyz_content: string
        xyz_file?: string
    }>
    [key: string]: any
}

// Workflow types for the 3 standard calculation modes
export type QCCalculationWorkflow = 'optimize' | 'ir' | 'properties'

// A curated, robust method choice for standard calculations
export interface QCCuratedMethod {
    id: string
    label: string
    tag: string
    method: string
    basis_set: string
    dispersion: 'none' | 'D3BJ' | 'D4'
    use_rijcosx: boolean
}

export const CURATED_METHODS: QCCuratedMethod[] = [
    {
        id: 'b3lyp-svp',
        label: 'B3LYP/def2-SVP + D3BJ',
        tag: 'Recommended',
        method: 'B3LYP',
        basis_set: 'def2-SVP',
        dispersion: 'D3BJ',
        use_rijcosx: true,
    },
    {
        id: 'pbe0-tzvp',
        label: 'PBE0/def2-TZVP + D3BJ',
        tag: 'High Accuracy',
        method: 'PBE0',
        basis_set: 'def2-TZVP',
        dispersion: 'D3BJ',
        use_rijcosx: true,
    },
    {
        id: 'wb97x-d3-svp',
        label: 'wB97X-D3/def2-SVP',
        tag: 'Non-covalent',
        method: 'wB97X-D3',
        basis_set: 'def2-SVP',
        dispersion: 'none',
        use_rijcosx: true,
    },
    {
        id: 'r2scan-3c',
        label: 'r2SCAN-3c',
        tag: 'Fast composite',
        method: 'r2SCAN-3c',
        basis_set: '',
        dispersion: 'none',
        use_rijcosx: false,
    },
    {
        id: 'gfn2-xtb',
        label: 'GFN2-xTB',
        tag: 'Large molecules',
        method: 'GFN2-xTB',
        basis_set: '',
        dispersion: 'none',
        use_rijcosx: false,
    },
    {
        id: 'dlpno-ccsd-t',
        label: 'DLPNO-CCSD(T)/cc-pVTZ',
        tag: 'Gold standard',
        method: 'DLPNO-CCSD(T)',
        basis_set: 'cc-pVTZ',
        dispersion: 'none',
        use_rijcosx: true,  // RIJCOSX speeds up the HF reference step
    },
    {
        id: 'ccsd-t',
        label: 'CCSD(T)/cc-pVTZ',
        tag: 'Canonical CC',
        method: 'CCSD(T)',
        basis_set: 'cc-pVTZ',
        dispersion: 'none',
        use_rijcosx: false,
    },
]

// Workflow presets define WHAT is calculated, not HOW (method is user's choice)
export interface QCWorkflowPreset {
    id: QCCalculationWorkflow
    name: string
    description: string
    task: 'SP' | 'OPT' | 'OPT_FREQ'
    outputs: string[]
    defaultProperties: {
        chelpg: boolean
        mulliken: boolean
        orbitals: boolean
        dipole: boolean
    }
    accentColor: string
}

export const WORKFLOW_PRESETS: QCWorkflowPreset[] = [
    {
        id: 'optimize',
        name: 'Geometry Optimization',
        description: 'Find the lowest-energy 3D structure of your molecule.',
        task: 'OPT',
        outputs: ['Optimized geometry', 'Ground state energy', 'HOMO/LUMO orbitals'],
        defaultProperties: { chelpg: false, mulliken: false, orbitals: true, dipole: true },
        accentColor: 'blue',
    },
    {
        id: 'ir',
        name: 'IR Spectrum & Thermochemistry',
        description: 'Optimize then compute vibrational frequencies to confirm a true minimum and get IR spectrum.',
        task: 'OPT_FREQ',
        outputs: ['IR spectrum plot', 'ΔG, ΔH thermochemistry', 'Imaginary frequency check'],
        defaultProperties: { chelpg: false, mulliken: false, orbitals: false, dipole: true },
        accentColor: 'purple',
    },
    {
        id: 'properties',
        name: 'Electronic Properties',
        description: 'Single-point calculation for charges, orbitals and reactivity descriptors.',
        task: 'SP',
        outputs: ['CHELPG charges', 'HOMO/LUMO gap', 'Dipole moment'],
        defaultProperties: { chelpg: true, mulliken: true, orbitals: true, dipole: true },
        accentColor: 'emerald',
    },
]

// Legacy presets kept for backward-compatible API responses
// Based on ORCA Manual Section 7.4 - Choice of Computational Model
export const DEFAULT_QC_PRESETS: QCPreset[] = [
    {
        id: 'r2scan-3c',
        name: 'r2SCAN-3c',
        description: 'Modern composite method — best balance of speed and accuracy',
        method: 'r2SCAN-3c',
        basis_set: 'N/A',
        keywords: ['!r2SCAN-3c'],
        use_case: 'General Purpose'
    },
    {
        id: 'b97-3c',
        name: 'B97-3c',
        description: 'Fast, accurate GGA composite method',
        method: 'B97-3c',
        basis_set: 'N/A',
        keywords: ['!B97-3c'],
        use_case: 'Fast Calculations'
    },
    {
        id: 'wb97x-3c',
        name: 'wB97X-3c',
        description: 'Range-separated hybrid composite method',
        method: 'wB97X-3c',
        basis_set: 'N/A',
        keywords: ['!wB97X-3c'],
        use_case: 'High Accuracy'
    },
    {
        id: 'dft-b3lyp',
        name: 'B3LYP/def2-SVP',
        description: 'Standard B3LYP with dispersion and RIJCOSX acceleration',
        method: 'B3LYP',
        basis_set: 'def2-SVP',
        keywords: ['!B3LYP', 'def2-SVP', 'D3BJ', 'RIJCOSX', 'def2/J', 'TightSCF'],
        use_case: 'General DFT'
    },
    {
        id: 'dft-pbe0',
        name: 'PBE0/def2-SVP',
        description: 'PBE0 hybrid functional with dispersion',
        method: 'PBE0',
        basis_set: 'def2-SVP',
        keywords: ['!PBE0', 'def2-SVP', 'D3BJ', 'RIJCOSX', 'def2/J', 'TightSCF'],
        use_case: 'General DFT'
    },
    {
        id: 'gfn2-xtb',
        name: 'GFN2-xTB',
        description: 'Extended tight-binding for large systems (100+ atoms)',
        method: 'GFN2-xTB',
        basis_set: 'N/A',
        keywords: ['!GFN2-xTB'],
        use_case: 'Large Systems'
    },
]
