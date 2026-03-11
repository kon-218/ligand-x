/**
 * Utility functions for converting ORCA MO data to Molstar alpha-orbitals format.
 * Shared between MolecularViewer (main viewer) and any orbital visualization components.
 */

export interface OrbitalData {
  energy: number
  occupancy: number
  alpha: number[]
}

export interface BasisShell {
  angularMomentum: number[]
  exponents: number[]
  coefficients: number[][]
}

export interface BasisAtom {
  center: number[]
  shells: BasisShell[]
}

export interface ConvertedOrbitalData {
  basisData: { atoms: BasisAtom[] }
  orbitalsData: OrbitalData[]
  homoIndex: number
}

/**
 * Convert ORCA JSON format to Molstar alpha-orbitals format
 */
export function convertOrcaToMolstarFormat(moData: any): ConvertedOrbitalData {
  const coords = moData.geometry.Coordinates.Cartesians
  const isBohr = moData.geometry.Coordinates.Units === 'a.u.'

  // Molstar's alpha-orbitals extension expects basis centers in Bohr (atomic units).
  // It converts to Angstroms internally in createGrid via BohrToAngstromFactor.
  const bohrFactor = isBohr ? 1.0 : (1.0 / 0.529177)

  // Convert basis functions to Molstar format
  const atoms: BasisAtom[] = moData.atoms.map((atom: any, atomIndex: number) => {
    const [, origX, origY, origZ] = coords[atomIndex]
    const x = origX * bohrFactor
    const y = origY * bohrFactor
    const z = origZ * bohrFactor

    const shells: BasisShell[] = atom.Basis.map((basis: any) => {
      let angularMomentum: number[]
      const shellType = basis.Shell.toLowerCase()

      switch (shellType) {
        case 's': angularMomentum = [0]; break
        case 'p': angularMomentum = [1]; break
        case 'd': angularMomentum = [2]; break
        case 'f': angularMomentum = [3]; break
        default:
          console.warn(`Unknown shell type: ${shellType}, defaulting to s`)
          angularMomentum = [0]
      }

      const normalizedCoefficients = basis.Coefficients.map((coeff: number) =>
        Math.abs(coeff) < 1e-10 ? 0 : coeff
      )

      return {
        angularMomentum,
        exponents: basis.Exponents,
        coefficients: [normalizedCoefficients]
      }
    })

    return { center: [x, y, z], shells }
  })

  // Calculate total number of basis functions
  let totalBasisFunctions = 0
  atoms.forEach(atom => {
    atom.shells.forEach(shell => {
      const l = shell.angularMomentum[0]
      const numFunctions = l === 0 ? 1 : (l === 1 ? 3 : (l === 2 ? 5 : (l === 3 ? 7 : 2 * l + 1)))
      totalBasisFunctions += numFunctions
    })
  })

  // Convert MO coefficients to Molstar format
  const mos = moData.molecular_orbitals.MOs || []
  const orbitalsData: OrbitalData[] = mos.map((mo: any, idx: number) => {
    const coefficients = mo.MOCoefficients

    if (coefficients.length !== totalBasisFunctions) {
      const adjustedCoeffs = new Array(totalBasisFunctions).fill(0)
      const copyLength = Math.min(coefficients.length, totalBasisFunctions)
      for (let i = 0; i < copyLength; i++) {
        adjustedCoeffs[i] = coefficients[i]
      }
      return {
        energy: mo.OrbitalEnergy,
        occupancy: mo.Occupancy || 0,
        alpha: adjustedCoeffs
      }
    }

    const normalizedCoeffs = coefficients.map((coeff: number) => {
      if (Math.abs(coeff) < 1e-12) return 0
      return coeff
    })

    return {
      energy: mo.OrbitalEnergy,
      occupancy: mo.Occupancy || 0,
      alpha: normalizedCoeffs
    }
  })

  // Determine HOMO index from occupancy or electron count
  let homoIndex = -1
  if (mos.length > 0 && mos[0].Occupancy !== undefined) {
    for (let i = mos.length - 1; i >= 0; i--) {
      if (mos[i].Occupancy > 0) {
        homoIndex = i
        break
      }
    }
  } else {
    const nElectrons = moData.n_electrons || 0
    homoIndex = nElectrons > 0 ? Math.floor(nElectrons / 2) - 1 : Math.floor(mos.length / 2) - 1
  }

  return { basisData: { atoms }, orbitalsData, homoIndex }
}

/**
 * Get human-readable MO label relative to HOMO
 */
export function getMOLabel(index: number, homoIndex: number): string {
  if (index === homoIndex) return 'HOMO'
  if (index === homoIndex + 1) return 'LUMO'
  if (index === homoIndex - 1) return 'HOMO-1'
  if (index === homoIndex + 2) return 'LUMO+1'
  if (index < homoIndex) return `HOMO-${homoIndex - index}`
  return `LUMO+${index - homoIndex - 1}`
}
