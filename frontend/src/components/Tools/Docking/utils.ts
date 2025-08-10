// Utility functions for docking workflow

/**
 * Two-letter element symbols that need special handling
 * These must be matched before single-letter elements to avoid Br -> B, Cl -> C, etc.
 */
const TWO_LETTER_ELEMENTS = new Set([
    'BR', 'CL', 'FE', 'ZN', 'MG', 'CA', 'NA', 'MN', 'CO', 'CU', 'NI', 
    'SE', 'SI', 'AL', 'AS', 'AU', 'AG', 'BA', 'BE', 'BI', 'CD', 'CE',
    'CR', 'CS', 'DY', 'ER', 'EU', 'GA', 'GD', 'GE', 'HF', 'HG', 'HO',
    'IN', 'IR', 'LA', 'LI', 'LU', 'MO', 'NB', 'ND', 'OS', 'PB', 'PD',
    'PM', 'PR', 'PT', 'RB', 'RE', 'RH', 'RU', 'SB', 'SC', 'SM', 'SN',
    'SR', 'TA', 'TB', 'TC', 'TE', 'TH', 'TI', 'TL', 'TM', 'VN', 'WO',
    'XE', 'YB', 'ZR'
])

/**
 * Extract element symbol from PDBQT atom type (last field after column 77)
 * PDBQT uses AutoDock atom types (NA, OA, C, N, S, etc.) which need to be mapped to elements.
 * Returns null if not found or invalid.
 */
function extractElementFromPDBQTAtomType(line: string): string | null {
    // PDBQT format has atom type as the last whitespace-separated field
    // Example: "ATOM      9  N   UNL     1     -44.457   2.107 -20.054  0.00  0.00    +0.000 NA"
    //                                                                                      ^^ atom type (AutoDock)
    const parts = line.trim().split(/\s+/)
    if (parts.length < 2) return null
    
    const lastField = parts[parts.length - 1].toUpperCase()
    
    // Map AutoDock atom types to element symbols
    // AutoDock uses: C, N, NA, NS, OA, OS, S, SA, P, F, Cl, Br, I, etc.
    const autodockToElement: Record<string, string> = {
        'C': ' C',      // Carbon
        'N': ' N',      // Nitrogen
        'NA': ' N',     // Nitrogen acceptor
        'NS': ' N',     // Nitrogen sulfur
        'O': ' O',      // Oxygen
        'OA': ' O',     // Oxygen acceptor
        'OS': ' O',     // Oxygen sulfur
        'S': ' S',      // Sulfur
        'SA': ' S',     // Sulfur acceptor
        'P': ' P',      // Phosphorus
        'F': ' F',      // Fluorine
        'CL': 'Cl',     // Chlorine
        'BR': 'Br',     // Bromine
        'I': ' I',      // Iodine
        'H': ' H',      // Hydrogen
        'HD': ' H',     // Hydrogen donor
    }
    
    // Check if it's a known AutoDock atom type
    if (lastField in autodockToElement) {
        return autodockToElement[lastField]
    }
    
    // Validate it's a known element (fallback)
    if (TWO_LETTER_ELEMENTS.has(lastField)) {
        return lastField[0] + lastField[1].toLowerCase()
    }
    
    // Check for single-letter elements
    if (lastField.length === 1 && 'CNOHSPFIBV'.includes(lastField)) {
        return ' ' + lastField
    }
    
    // Check if it looks like an element (1-2 letters)
    if (/^[A-Z]{1,2}$/.test(lastField)) {
        if (lastField.length === 2) {
            return lastField[0] + lastField[1].toLowerCase()
        }
        return ' ' + lastField
    }
    
    return null
}

/**
 * Extract element symbol from atom name (columns 13-16 in PDB/PDBQT format)
 * Handles two-letter elements like Br, Cl, Fe, etc.
 */
function extractElementFromAtomName(atomName: string): string {
    // Remove leading/trailing spaces and digits
    const cleaned = atomName.trim().replace(/[0-9]/g, '').toUpperCase()
    
    if (cleaned.length === 0) {
        return '  ' // Unknown element
    }
    
    // Check for two-letter elements first (e.g., BR, CL, FE)
    if (cleaned.length >= 2) {
        const twoChar = cleaned.substring(0, 2)
        if (TWO_LETTER_ELEMENTS.has(twoChar)) {
            // Return properly capitalized (e.g., "Br" not "BR")
            return twoChar[0] + twoChar[1].toLowerCase()
        }
    }
    
    // Single-letter element (C, N, O, H, S, P, F, I, etc.)
    const firstChar = cleaned[0]
    if ('CNOHSPFIBV'.includes(firstChar)) {
        return ' ' + firstChar // Right-justified in 2-char field
    }
    
    // Default: return first character right-justified
    return ' ' + firstChar
}

/**
 * Parse atom coordinates from PDBQT/PDB lines
 */
interface AtomCoord {
    serial: number
    x: number
    y: number
    z: number
    element: string
}

/**
 * Extract bonds from PDBQT BRANCH records and infer aromatic ring bonds
 * PDBQT format uses BRANCH X Y to indicate a bond between atoms X and Y
 * For aromatic rings, we also infer bonds from atom proximity (C-C distance ~1.4 Å)
 * Returns a Set of bond pairs in the format "X-Y" (sorted so X < Y)
 */
function extractBondsFromPDBQT(pdbqtData: string): Set<string> {
    const bonds = new Set<string>()
    const lines = pdbqtData.split('\n')
    const atoms: AtomCoord[] = []
    
    // First pass: extract explicit BRANCH bonds and collect atom coordinates
    for (const line of lines) {
        // Extract BRANCH records
        if (line.startsWith('BRANCH')) {
            const parts = line.trim().split(/\s+/)
            if (parts.length >= 3) {
                try {
                    const atom1 = parseInt(parts[1])
                    const atom2 = parseInt(parts[2])
                    if (!isNaN(atom1) && !isNaN(atom2)) {
                        // Store as sorted pair to avoid duplicates
                        const [min, max] = atom1 < atom2 ? [atom1, atom2] : [atom2, atom1]
                        bonds.add(`${min}-${max}`)
                    }
                } catch {
                    // Skip malformed BRANCH lines
                }
            }
        }
        
        // Extract atom coordinates for aromatic ring inference
        if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
            try {
                const serial = parseInt(line.substring(6, 11).trim())
                const x = parseFloat(line.substring(30, 38).trim())
                const y = parseFloat(line.substring(38, 46).trim())
                const z = parseFloat(line.substring(46, 54).trim())
                
                // Try to get element from PDBQT atom type (last field)
                const parts = line.trim().split(/\s+/)
                const element = parts.length > 0 ? parts[parts.length - 1].toUpperCase() : 'C'
                
                if (!isNaN(serial) && !isNaN(x) && !isNaN(y) && !isNaN(z)) {
                    atoms.push({ serial, x, y, z, element })
                }
            } catch {
                // Skip malformed atom lines
            }
        }
    }
    
    // Second pass: infer aromatic ring bonds from C-C proximity
    // Aromatic C-C bonds are typically ~1.4 Å, aliphatic C-C bonds are ~1.54 Å
    // We use a threshold of 1.6 Å to catch both aromatic and some aliphatic bonds
    const AROMATIC_BOND_DISTANCE = 1.6
    
    for (let i = 0; i < atoms.length; i++) {
        for (let j = i + 1; j < atoms.length; j++) {
            const atom1 = atoms[i]
            const atom2 = atoms[j]
            
            // Only infer bonds between carbon atoms (aromatic rings)
            if (atom1.element === 'C' && atom2.element === 'C') {
                const dx = atom1.x - atom2.x
                const dy = atom1.y - atom2.y
                const dz = atom1.z - atom2.z
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
                
                // If atoms are close enough, infer a bond
                if (distance > 0.5 && distance < AROMATIC_BOND_DISTANCE) {
                    const [min, max] = atom1.serial < atom2.serial 
                        ? [atom1.serial, atom2.serial] 
                        : [atom2.serial, atom1.serial]
                    const bondKey = `${min}-${max}`
                    
                    // Only add if not already in explicit bonds (avoid duplicates)
                    if (!bonds.has(bondKey)) {
                        bonds.add(bondKey)
                    }
                }
            }
        }
    }
    
    return bonds
}

/**
 * Convert PDBQT format to PDB format with proper element symbols and bond information
 * 
 * PDBQT format has AutoDock atom types after column 77, but columns 77-78
 * (element symbol) are often not properly set. This function:
 * 1. First tries to extract element from PDBQT atom type (most reliable)
 * 2. Falls back to extracting from atom name (columns 13-16)
 * 3. Properly sets columns 77-78 with the element symbol
 * 4. Converts ATOM records to HETATM for ligands
 * 5. Extracts bond information from BRANCH records and generates CONECT records
 * 
 * This fixes issues where:
 * - Two-letter elements like Bromine (Br) were being incorrectly interpreted as single-letter elements like Boron (B)
 * - Aromatic rings (benzene, etc.) were not being visualized correctly due to missing bond information
 */
export function convertPDBQTtoPDB(pdbqtData: string): string {
    if (!pdbqtData || typeof pdbqtData !== 'string') {
        console.warn('convertPDBQTtoPDB: Invalid input data')
        return ''
    }
    
    const lines = pdbqtData.split('\n')
    const pdbLines: string[] = []
    const bonds = extractBondsFromPDBQT(pdbqtData)
    
    // First pass: convert ATOM/HETATM records
    for (const line of lines) {
        if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
            // Pad line to at least 78 characters if needed
            let pdbLine = line.padEnd(78, ' ')
            
            // Truncate to 76 chars (before element columns in PDB)
            pdbLine = pdbLine.substring(0, 76)
            
            // Try to get element from PDBQT atom type first (most reliable)
            let element = extractElementFromPDBQTAtomType(line)
            
            // Fall back to extracting from atom name
            if (!element) {
                const atomName = line.substring(12, 16)
                element = extractElementFromAtomName(atomName)
            }
            
            // Append element symbol (columns 77-78) and pad to 80 chars
            pdbLine = pdbLine + element + '  '
            
            // Convert ATOM to HETATM so Mol* recognizes the ligand atoms
            // This is necessary because PDBQT uses ATOM records, but Mol* expects
            // ligand/small molecule atoms to be HETATM records
            if (pdbLine.startsWith('ATOM  ')) {
                pdbLine = 'HETATM' + pdbLine.substring(6)
            }
            pdbLines.push(pdbLine)
        }
    }
    
    // Second pass: generate CONECT records from bonds
    if (bonds.size > 0) {
        // Build a map of atom serial numbers to their connections
        const conectMap = new Map<number, Set<number>>()
        
        for (const bond of bonds) {
            const [atom1Str, atom2Str] = bond.split('-')
            const atom1 = parseInt(atom1Str)
            const atom2 = parseInt(atom2Str)
            
            if (!conectMap.has(atom1)) conectMap.set(atom1, new Set())
            if (!conectMap.has(atom2)) conectMap.set(atom2, new Set())
            
            conectMap.get(atom1)!.add(atom2)
            conectMap.get(atom2)!.add(atom1)
        }
        
        // Generate CONECT records (sorted by atom number)
        const sortedAtoms = Array.from(conectMap.keys()).sort((a, b) => a - b)
        for (const atomNum of sortedAtoms) {
            const connections = Array.from(conectMap.get(atomNum)!).sort((a, b) => a - b)
            
            // PDB CONECT format: CONECT followed by atom serial numbers
            // Each CONECT record can have up to 4 connections
            for (let i = 0; i < connections.length; i += 4) {
                const chunk = connections.slice(i, i + 4)
                const conectLine = `CONECT${atomNum.toString().padStart(5)}${chunk.map(c => c.toString().padStart(5)).join('')}`
                pdbLines.push(conectLine)
            }
        }
    }
    
    // Add END record
    pdbLines.push('END')
    
    return pdbLines.join('\n')
}

/**
 * Parse PDBQT format to extract individual model poses
 */
export function parsePDBQT(pdbqtData: string): string[] {
    if (!pdbqtData || typeof pdbqtData !== 'string') {
        console.warn('parsePDBQT: Invalid input data')
        return []
    }
    const poses: string[] = []
    const lines = pdbqtData.split('\n')
    let currentPose: string[] = []
    let inModel = false

    for (const line of lines) {
        if (line.startsWith('MODEL')) {
            inModel = true
            currentPose = []
        } else if (line.startsWith('ENDMDL')) {
            inModel = false
            if (currentPose.length > 0) {
                poses.push(currentPose.join('\n'))
            }
        } else if (inModel && (line.startsWith('ATOM') || line.startsWith('HETATM'))) {
            currentPose.push(line)
        }
    }

    // If no MODEL/ENDMDL tags, treat entire content as one pose
    if (poses.length === 0 && lines.some(l => l.startsWith('ATOM') || l.startsWith('HETATM'))) {
        poses.push(lines.filter(l => l.startsWith('ATOM') || l.startsWith('HETATM')).join('\n'))
    }

    return poses
}

/**
 * Parse multi-molecule SDF format to extract individual poses
 * SDF files use $$$$ as molecule separator
 */
export function parseSDF(sdfData: string): string[] {
    if (!sdfData || sdfData.trim() === '') {
        return []
    }
    
    // Split by $$$$ separator
    const molecules = sdfData.split('$$$$')
        .map(mol => mol.trim())
        .filter(mol => mol.length > 0)
    
    return molecules
}

/**
 * Convert SDF molecule block to PDB format for visualization
 * This preserves bond information by including CONECT records
 */
export function convertSDFtoPDB(sdfBlock: string): string {
    const lines = sdfBlock.split('\n')
    const pdbLines: string[] = []
    
    // Parse SDF header (first 4 lines)
    // Line 1: Molecule name
    // Line 2: Program/timestamp info
    // Line 3: Comment
    // Line 4: Counts line (num_atoms num_bonds ...)
    
    if (lines.length < 4) {
        return ''
    }
    
    const countsLine = lines[3].trim()
    const countsParts = countsLine.split(/\s+/)
    const numAtoms = parseInt(countsParts[0]) || 0
    const numBonds = parseInt(countsParts[1]) || 0
    
    if (numAtoms === 0) {
        return ''
    }
    
    // Parse atom block (starts at line 4)
    const atoms: { x: number; y: number; z: number; element: string }[] = []
    for (let i = 4; i < 4 + numAtoms && i < lines.length; i++) {
        const atomLine = lines[i]
        if (atomLine.length < 34) continue
        
        try {
            const x = parseFloat(atomLine.substring(0, 10).trim())
            const y = parseFloat(atomLine.substring(10, 20).trim())
            const z = parseFloat(atomLine.substring(20, 30).trim())
            const element = atomLine.substring(31, 34).trim()
            atoms.push({ x, y, z, element })
        } catch {
            continue
        }
    }
    
    // Generate HETATM records
    for (let i = 0; i < atoms.length; i++) {
        const atom = atoms[i]
        const atomNum = i + 1
        const atomName = `${atom.element}${atomNum}`.padEnd(4).substring(0, 4)
        const element = atom.element.length === 1 ? ` ${atom.element}` : atom.element.substring(0, 2)
        
        // PDB HETATM format
        const hetatm = `HETATM${atomNum.toString().padStart(5)} ${atomName} LIG A   1    ${atom.x.toFixed(3).padStart(8)}${atom.y.toFixed(3).padStart(8)}${atom.z.toFixed(3).padStart(8)}  1.00  0.00          ${element}`
        pdbLines.push(hetatm)
    }
    
    // Parse bond block and generate CONECT records
    const bondStart = 4 + numAtoms
    const conectMap: Map<number, number[]> = new Map()
    
    for (let i = bondStart; i < bondStart + numBonds && i < lines.length; i++) {
        const bondLine = lines[i]
        if (bondLine.startsWith('M ') || bondLine.trim() === '') break
        
        try {
            const atom1 = parseInt(bondLine.substring(0, 3).trim())
            const atom2 = parseInt(bondLine.substring(3, 6).trim())
            // Bond type is at positions 6-9, but PDB CONECT doesn't distinguish bond types
            
            if (atom1 > 0 && atom2 > 0 && atom1 <= numAtoms && atom2 <= numAtoms) {
                // Add bidirectional connections
                if (!conectMap.has(atom1)) conectMap.set(atom1, [])
                if (!conectMap.has(atom2)) conectMap.set(atom2, [])
                conectMap.get(atom1)!.push(atom2)
                conectMap.get(atom2)!.push(atom1)
            }
        } catch {
            continue
        }
    }
    
    // Generate CONECT records
    for (const [atomNum, connections] of conectMap) {
        // PDB CONECT format: CONECT followed by atom serial numbers
        // Each CONECT record can have up to 4 connections
        const uniqueConnections = [...new Set(connections)].sort((a, b) => a - b)
        for (let i = 0; i < uniqueConnections.length; i += 4) {
            const chunk = uniqueConnections.slice(i, i + 4)
            const conectLine = `CONECT${atomNum.toString().padStart(5)}${chunk.map(c => c.toString().padStart(5)).join('')}`
            pdbLines.push(conectLine)
        }
    }
    
    pdbLines.push('END')
    return pdbLines.join('\n')
}

/**
 * Calculate binding strength from affinity value
 */
export function calculateBindingStrength(affinity: number): string {
    if (affinity <= -10.0) {
        return 'Very Strong'
    } else if (affinity <= -8.0) {
        return 'Strong'
    } else if (affinity <= -6.0) {
        return 'Moderate'
    } else if (affinity <= -4.0) {
        return 'Weak'
    } else {
        return 'Very Weak'
    }
}
