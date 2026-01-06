/**
 * Molecular Orbital Utilities
 * 
 * This module provides utilities for parsing ORCA JSON output and computing
 * molecular orbitals on a 3D grid for visualization.
 * 
 * Based on Molstar's alpha-orbitals example approach.
 */

import { Vec3 } from 'molstar/lib/mol-math/linear-algebra'

export interface OrcaMOData {
  geometry: {
    Coordinates: {
      Cartesians: Array<[string, number, number, number]>
      Type: string
      Units: string
    }
    NAtoms: number
  }
  atoms: Array<{
    Basis: Array<{
      Shell: string
      Exponents: number[]
      Coefficients: number[]
    }>
  }>
  molecular_orbitals: {
    MOs: Array<{
      OrbitalEnergy: number
      MOCoefficients: number[]
      OrbitalSymLabel?: string
    }>
  }
  n_electrons?: number
}

export interface MOInfo {
  index: number
  energy: number
  label: string
  isOccupied: boolean
  coefficients: number[]
}

export interface BasisFunction {
  atomIndex: number
  shell: string
  exponents: number[]
  coefficients: number[]
  center: Vec3
}

const BOHR_TO_ANGSTROM = 0.529177210903

/**
 * Parse ORCA MO data and extract key information
 */
export function parseOrcaMOData(data: OrcaMOData): {
  atoms: Array<{ element: string; position: Vec3 }>
  basisFunctions: BasisFunction[]
  mos: MOInfo[]
  homoIndex: number
} {
  const atoms: Array<{ element: string; position: Vec3 }> = []
  const basisFunctions: BasisFunction[] = []
  
  // Parse atoms and convert coordinates
  const coords = data.geometry.Coordinates.Cartesians
  const isBohr = data.geometry.Coordinates.Units === 'a.u.'
  const conversionFactor = isBohr ? BOHR_TO_ANGSTROM : 1.0
  
  coords.forEach(([element, x, y, z], atomIndex) => {
    const position = Vec3.create(
      x * conversionFactor,
      y * conversionFactor,
      z * conversionFactor
    )
    atoms.push({ element, position })
    
    // Parse basis functions for this atom
    const atomBasis = data.atoms[atomIndex]?.Basis || []
    atomBasis.forEach(basis => {
      basisFunctions.push({
        atomIndex,
        shell: basis.Shell,
        exponents: basis.Exponents,
        coefficients: basis.Coefficients,
        center: position
      })
    })
  })
  
  // Parse MO information
  const moData = data.molecular_orbitals.MOs || []
  const nElectrons = data.n_electrons || 0
  const homoIndex = nElectrons > 0 ? Math.floor(nElectrons / 2) - 1 : Math.floor(moData.length / 2) - 1
  
  const mos: MOInfo[] = moData.map((mo, index) => ({
    index,
    energy: mo.OrbitalEnergy,
    label: mo.OrbitalSymLabel || `MO ${index}`,
    isOccupied: index <= homoIndex,
    coefficients: mo.MOCoefficients || []
  }))
  
  return { atoms, basisFunctions, mos, homoIndex }
}

/**
 * Compute the value of a Gaussian basis function at a point
 */
function evaluateGaussian(
  point: Vec3,
  center: Vec3,
  shell: string,
  exponents: number[],
  coefficients: number[]
): number {
  const dx = point[0] - center[0]
  const dy = point[1] - center[1]
  const dz = point[2] - center[2]
  const r2 = dx * dx + dy * dy + dz * dz
  
  let value = 0
  
  // Evaluate contracted Gaussian
  for (let i = 0; i < exponents.length; i++) {
    const alpha = exponents[i]
    const coeff = coefficients[i]
    const gaussian = Math.exp(-alpha * r2)
    
    // Apply angular momentum
    let angular = 1.0
    switch (shell.toLowerCase()) {
      case 's':
        angular = 1.0
        break
      case 'p':
        // For p orbitals, we'd need to know px, py, or pz
        // Simplified: use average contribution
        angular = (Math.abs(dx) + Math.abs(dy) + Math.abs(dz)) / 3
        break
      case 'd':
        // For d orbitals, simplified
        angular = r2
        break
      default:
        angular = 1.0
    }
    
    value += coeff * gaussian * angular
  }
  
  return value
}

/**
 * Evaluate a molecular orbital at a point
 */
export function evaluateMO(
  point: Vec3,
  moCoefficients: number[],
  basisFunctions: BasisFunction[]
): number {
  let value = 0
  
  for (let i = 0; i < basisFunctions.length && i < moCoefficients.length; i++) {
    const basis = basisFunctions[i]
    const coeff = moCoefficients[i]
    
    const basisValue = evaluateGaussian(
      point,
      basis.center,
      basis.shell,
      basis.exponents,
      basis.coefficients
    )
    
    value += coeff * basisValue
  }
  
  return value
}

/**
 * Generate a 3D grid for orbital evaluation
 */
export function generateGrid(
  atoms: Array<{ position: Vec3 }>,
  spacing: number = 0.3,
  margin: number = 3.0
): {
  origin: Vec3
  dimensions: [number, number, number]
  spacing: number
  points: Vec3[]
} {
  // Find bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  
  atoms.forEach(atom => {
    const [x, y, z] = atom.position
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    maxZ = Math.max(maxZ, z)
  })
  
  // Add margin
  minX -= margin
  minY -= margin
  minZ -= margin
  maxX += margin
  maxY += margin
  maxZ += margin
  
  // Calculate grid dimensions
  const nx = Math.ceil((maxX - minX) / spacing)
  const ny = Math.ceil((maxY - minY) / spacing)
  const nz = Math.ceil((maxZ - minZ) / spacing)
  
  const origin = Vec3.create(minX, minY, minZ)
  const dimensions: [number, number, number] = [nx, ny, nz]
  
  // Generate grid points
  const points: Vec3[] = []
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        points.push(Vec3.create(
          minX + i * spacing,
          minY + j * spacing,
          minZ + k * spacing
        ))
      }
    }
  }
  
  return { origin, dimensions, spacing, points }
}

/**
 * Compute orbital values on a grid
 */
export function computeOrbitalGrid(
  moCoefficients: number[],
  basisFunctions: BasisFunction[],
  gridPoints: Vec3[]
): Float32Array {
  const values = new Float32Array(gridPoints.length)
  
  for (let i = 0; i < gridPoints.length; i++) {
    values[i] = evaluateMO(gridPoints[i], moCoefficients, basisFunctions)
  }
  
  return values
}

/**
 * Helper to get MO label (HOMO, LUMO, etc.)
 */
export function getMOLabel(index: number, homoIndex: number): string {
  if (index === homoIndex) return 'HOMO'
  if (index === homoIndex + 1) return 'LUMO'
  if (index === homoIndex - 1) return 'HOMO-1'
  if (index === homoIndex + 2) return 'LUMO+1'
  if (index < homoIndex) return `HOMO-${homoIndex - index}`
  return `LUMO+${index - homoIndex - 1}`
}
