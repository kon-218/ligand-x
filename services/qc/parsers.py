"""
Quantum Chemistry Output Parsers

This module contains functions to parse ORCA output files and extract
Key Performance Indicators (KPIs) for drug discovery applications.

Main KPIs:
- HOMO/LUMO energies and gap (reactivity/stability)
- CHELPG partial charges (for docking)
- Molecular dipole moment (polarity)
- Gibbs free energy (thermodynamics)
- Solvation free energy (solubility)
- Vibrational frequencies (IR spectrum, geometry validation)
"""

import re
import numpy as np
from pathlib import Path
from typing import Dict, Any, Optional, List
import logging

logger = logging.getLogger(__name__)

# Try to import cclib (install with: pip install cclib)
try:
    import cclib
    from cclib.parser.utils import PeriodicTable
    CCLIB_AVAILABLE = True
except ImportError:
    CCLIB_AVAILABLE = False
    logger.warning("cclib not available. Install with: pip install cclib")

# Try to import orca-parser
try:
    import orca_parser
    ORCA_PARSER_AVAILABLE = True
except ImportError:
    ORCA_PARSER_AVAILABLE = False
    logger.warning("orca-parser not available. Install with: pip install orca-parser")


def parse_fmo_data(output_file: Path) -> Dict[str, Any]:
    """
    Parse Frontier Molecular Orbital (FMO) data from ORCA output.
    
    Extracts HOMO and LUMO energies and calculates the HOMO-LUMO gap.
    These values are critical for understanding:
    - Chemical reactivity
    - Kinetic stability
    - Electron donating/accepting ability
    
    Args:
        output_file: Path to ORCA output file
        
    Returns:
        Dictionary containing:
        - homo_eV: HOMO energy in electron-Volts
        - lumo_eV: LUMO energy in electron-Volts
        - gap_eV: HOMO-LUMO gap in eV
        - homo_index: Index of HOMO orbital (for visualization)
    """
    # 1. Try orca-parser first (best for standard output)
    if ORCA_PARSER_AVAILABLE:
        try:
            optimization = orca_parser.ORCAParse(str(output_file))
            if hasattr(optimization, "parse_HOMO_LUMO"):
                optimization.parse_HOMO_LUMO()
                
                # Extract if available
                fmo = {}
                if hasattr(optimization, "homo") and optimization.homo is not None:
                    fmo["homo_eV"] = float(optimization.homo)
                if hasattr(optimization, "lumo") and optimization.lumo is not None:
                    fmo["lumo_eV"] = float(optimization.lumo)
                if hasattr(optimization, "gap") and optimization.gap is not None:
                    fmo["gap_eV"] = float(optimization.gap)
                
                # If we got the essentials, return
                if "homo_eV" in fmo and "lumo_eV" in fmo:
                    return fmo
        except Exception as e:
            logger.warning(f"orca-parser failed for FMO: {e}")

    # 2. JSON fallback: parse job.property.json for electron count and job.json for MO energies
    try:
        job_dir = output_file.parent
        prop_path = job_dir / "job.property.json"
        main_json_path = job_dir / "job.json"

        n_electrons: Optional[int] = None
        if prop_path.exists():
            try:
                import json
                with open(prop_path, 'r') as f:
                    prop = json.load(f)
                # Navigate to electron count - try multiple paths for different calculation types
                n_electrons = None
                if isinstance(prop, dict):
                    # Try DFT_Summary first (standard DFT)
                    dft_summary = None
                    components = prop.get("Components") if isinstance(prop.get("Components"), list) else None
                    if components and len(components) > 0 and isinstance(components[0], dict):
                        dft_summary = components[0].get("DFT_Summary")
                    if dft_summary is None:
                        dft_summary = prop.get("DFT_Summary")
                    if isinstance(dft_summary, dict):
                        n_electrons = int(round(dft_summary.get("nTotalEl"))) if dft_summary.get("nTotalEl") is not None else None
                    
                    # Try xTB summary if DFT failed
                    if n_electrons is None:
                        xtb_summary = None
                        if components:
                            for comp in components:
                                if isinstance(comp, dict) and "xTB" in comp.get("Type", ""):
                                    xtb_summary = comp
                                    break
                        if xtb_summary is None:
                            xtb_summary = prop.get("xTB_Summary")
                        if isinstance(xtb_summary, dict):
                            n_electrons = int(round(xtb_summary.get("nTotalEl"))) if xtb_summary.get("nTotalEl") is not None else None
                    
                    # Try general electron count as last resort
                    if n_electrons is None:
                        n_electrons = int(round(prop.get("nTotalEl", 0))) if prop.get("nTotalEl") is not None else None
            except Exception as e:
                logger.warning(f"Failed to read nTotalEl from job.property.json: {e}")

        mo_energies_ev: Optional[list] = None
        if main_json_path.exists():
            import json
            with open(main_json_path, 'r') as f:
                data = json.load(f)
            # Navigate to MO energies - try multiple paths for different calculation types
            # NOTE: ORCA stores OrbitalEnergy in Hartree, NOT eV - we must convert
            HARTREE_TO_EV = 27.211386245988
            try:
                # Standard DFT path
                mos = data.get("Molecule", {}).get("MolecularOrbitals", {}).get("MOs", [])
                if not mos:
                    # Try xTB-specific paths
                    xtb_data = data.get("xTB", {})
                    if xtb_data:
                        mos = xtb_data.get("MolecularOrbitals", {}).get("MOs", [])
                    if not mos:
                        # Try alternative structure
                        mos = data.get("MolecularOrbitals", {}).get("MOs", [])
                
                # Convert from Hartree to eV with validation
                mo_energies_ev = []
                for mo in mos:
                    if mo is not None:
                        energy = mo.get("OrbitalEnergy")
                        if energy is not None:
                            try:
                                energy_ev = float(energy) * HARTREE_TO_EV
                                # Filter out extreme values that indicate parsing errors
                                if abs(energy_ev) < 1000:  # Reasonable energy range in eV
                                    mo_energies_ev.append(energy_ev)
                            except (ValueError, TypeError):
                                logger.warning(f"Invalid MO energy: {energy}")
                                continue
                
                if not mo_energies_ev:
                    logger.warning("No valid MO energies found in JSON")
            except Exception as e:
                logger.error(f"Failed to parse MO energies from job.json: {e}")

        if mo_energies_ev and len(mo_energies_ev) >= 2:
            # Determine HOMO index: for closed-shell, HOMO = nElectrons/2 - 1. If unknown, infer from output (.out) HOMO line as fallback
            homo_index: Optional[int] = None
            if n_electrons is not None and n_electrons > 0:
                homo_index = int(n_electrons // 2 - 1)
            else:
                # Try to infer from .out HOMO line
                try:
                    with open(output_file, 'r', encoding='utf-8', errors='ignore') as f:
                        for line in f:
                            if line.strip().startswith("HOMO=") and "LUMO=" in line:
                                # Example: HOMO=   5 E= -7.684 eV LUMO= -6.291 eV gap=   1.393 eV
                                parts = line.replace('=', ' ').split()
                                # parts looks like ['HOMO', '5', 'E', '-7.684', 'eV', 'LUMO', '-6.291', ...]
                                for i, tok in enumerate(parts):
                                    if tok == 'HOMO' and i + 1 < len(parts):
                                        homo_index = int(parts[i + 1])
                                        break
                                if homo_index is not None:
                                    break
                except Exception:
                    pass
            if homo_index is None:
                # As a last resort, assume lowest positive gap position (sorted energies) but keep original order
                # Fallback to center of occupied/virtual split at minimum gap
                import math
                min_gap = math.inf
                guess = 0
                for i in range(len(mo_energies_ev) - 1):
                    gap = mo_energies_ev[i + 1] - mo_energies_ev[i]
                    if gap >= 0 and gap < min_gap:
                        min_gap = gap
                        guess = i
                homo_index = guess

            homo_energy_ev = float(mo_energies_ev[homo_index])
            lumo_energy_ev = float(mo_energies_ev[homo_index + 1])
            gap_ev = lumo_energy_ev - homo_energy_ev
            return {
                "homo_eV": homo_energy_ev,
                "lumo_eV": lumo_energy_ev,
                "gap_eV": gap_ev,
                "homo_index": int(homo_index),
                "mo_energies_eV": mo_energies_ev,
            }

    except Exception as e:
        logger.error(f"Error parsing FMO data (JSON fallback): {e}")
        # Debug: Log actual JSON structure for xTB method verification
        try:
            if main_json_path.exists():
                with open(main_json_path, 'r') as f:
                    data = json.load(f)
                logger.debug(f"ORCA job.json structure (first 500 chars): {json.dumps(data, indent=2)[:500]}")
        except Exception as debug_e:
            logger.warning(f"Could not log JSON structure for debugging: {debug_e}")

    # 3. cclib fallback (deprecated)
    if CCLIB_AVAILABLE:
        try:
            data = cclib.io.ccread(str(output_file))
            if data is not None and hasattr(data, "moenergies") and hasattr(data, "homos"):
                # For RHF/DFT: moenergies is a list with one array; homos is an array with one index
                homo_index = int(data.homos[-1])
                mo_energies_ev = data.moenergies[-1]
                homo_energy_ev = float(mo_energies_ev[homo_index])
                lumo_energy_ev = float(mo_energies_ev[homo_index + 1])
                gap_ev = lumo_energy_ev - homo_energy_ev
                return {
                    "homo_eV": homo_energy_ev,
                    "lumo_eV": lumo_energy_ev,
                    "gap_eV": gap_ev,
                    "homo_index": int(homo_index)
                }
        except Exception as e:
            logger.error(f"Error parsing FMO data with cclib: {e}")

    return {"error": "Could not determine FMO data"}


def _parse_chelpg_from_log(output_file: Path) -> List[float]:
    """Parse CHELPG charges directly from ORCA log text using regex.

    Handles the ORCA 4–6 format:
        CHELPG Charges
        --------------------------------
          0   C   :      -0.231127
          1   C   :       0.092602
        ...
        Total charge:     0.000000
        --------------------------------
    """
    charges: List[float] = []
    try:
        with open(output_file, 'r', encoding='utf-8', errors='ignore') as fh:
            in_section = False
            for line in fh:
                if 'CHELPG Charges' in line:
                    in_section = True
                    continue
                if in_section:
                    # Stop at "Total charge:" or second dashes block after charges
                    if 'Total charge:' in line:
                        break
                    m = re.match(r'\s*\d+\s+\w+\s*:\s*([-+]?\d+\.\d+)', line)
                    if m:
                        charges.append(float(m.group(1)))
    except Exception as e:
        logger.warning(f"CHELPG log parse failed: {e}")
    return charges


def _parse_dipole_from_log(output_file: Path) -> Dict[str, Any]:
    """Parse dipole moment directly from ORCA log text using regex.

    Captures:
        Magnitude (Debye)      :      1.598140763
        Total Dipole Moment    :      0.315745667       0.500793581      -0.211730344
    The vector values in "Total Dipole Moment" are in atomic units (a.u.).
    """
    AU_TO_DEBYE = 2.541746231
    result: Dict[str, Any] = {}
    try:
        with open(output_file, 'r', encoding='utf-8', errors='ignore') as fh:
            content = fh.read()

        # Magnitude in Debye (most reliable)
        mag_match = re.search(r'Magnitude \(Debye\)\s*:\s*([-+]?\d+\.\d+)', content)
        if mag_match:
            result['dipole_magnitude_debye'] = float(mag_match.group(1))

        # Vector in a.u. — convert to Debye for consistency
        vec_match = re.search(
            r'Total Dipole Moment\s*:\s*([-+]?\d+\.\d+)\s+([-+]?\d+\.\d+)\s+([-+]?\d+\.\d+)',
            content
        )
        if vec_match:
            result['dipole_vector'] = [
                float(vec_match.group(1)) * AU_TO_DEBYE,
                float(vec_match.group(2)) * AU_TO_DEBYE,
                float(vec_match.group(3)) * AU_TO_DEBYE,
            ]
    except Exception as e:
        logger.warning(f"Dipole log parse failed: {e}")
    return result


def parse_electrostatics(output_file: Path) -> Dict[str, Any]:
    """
    Parse electrostatic properties from ORCA output.
    
    Extracts:
    - CHELPG charges (ESP-derived, superior to Mulliken)
    - Mulliken charges
    - Molecular dipole moment (magnitude + vector)
    
    Strategy (each step fills in any still-missing fields):
    1. cclib (if available) — parses dipole and all charge types
    2. Regex log parser — direct text parse of ORCA output (robust across ORCA 4–6)
    3. JSON fallback — job.property.json written by ORCA itself
    
    Args:
        output_file: Path to ORCA output file (.out)
        
    Returns:
        Dictionary with: chelpg_charges, mulliken_charges,
        dipole_magnitude_debye, dipole_vector
    """
    results: Dict[str, Any] = {}

    # --- Step 1: cclib ---
    if CCLIB_AVAILABLE:
        try:
            data = cclib.io.ccread(str(output_file))
            if data is not None:
                if hasattr(data, "moments") and len(data.moments) > 1:
                    dipole_vector = data.moments[1]
                    results["dipole_magnitude_debye"] = float(np.linalg.norm(dipole_vector))
                    results["dipole_vector"] = dipole_vector.tolist()
                if hasattr(data, "atomcharges"):
                    if "chelpg" in data.atomcharges:
                        results["chelpg_charges"] = data.atomcharges["chelpg"].tolist()
                    if "mulliken" in data.atomcharges:
                        results["mulliken_charges"] = data.atomcharges["mulliken"].tolist()
        except Exception as e:
            logger.warning(f"cclib parsing error for electrostatics: {e}")

    # --- Step 2: regex log parsers (fill any gaps left by cclib) ---
    if "chelpg_charges" not in results:
        chelpg = _parse_chelpg_from_log(output_file)
        if chelpg:
            results["chelpg_charges"] = chelpg
            logger.info(f"CHELPG charges parsed via regex ({len(chelpg)} atoms)")

    if "dipole_magnitude_debye" not in results:
        dipole = _parse_dipole_from_log(output_file)
        if dipole:
            results.update(dipole)
            logger.info("Dipole moment parsed via regex")

    if results:
        return results

    # --- Step 3: JSON fallback ---
    json_results = parse_electrostatics_json(output_file)
    if json_results and "error" not in json_results:
        return json_results

    return {"error": "No electrostatic properties found in output"}

def parse_electrostatics_json(output_file: Path) -> Dict[str, Any]:
    """Parse electrostatic properties from job.property.json with enhanced xTB support"""
    try:
        job_dir = output_file.parent
        prop_path = job_dir / "job.property.json"
        
        if not prop_path.exists():
            return {"error": "job.property.json not found"}
            
        import json
        with open(prop_path, 'r') as f:
            prop = json.load(f)
            
        results = {}
        
        # Helper to find Component by type (case-insensitive)
        def find_component(data, type_name):
            components = data.get("Components", []) if isinstance(data.get("Components"), list) else []
            for comp in components:
                if isinstance(comp, dict) and type_name.lower() in comp.get("Type", "").lower():
                    return comp
            return None

        # Dipole - try multiple paths
        el_prop = prop.get("ElectricProperties")
        if not el_prop:
            el_prop = find_component(prop, "ElectricProperties")
        
        # Try xTB-specific dipole paths
        if not el_prop:
            el_prop = find_component(prop, "xTB")
            if el_prop:
                el_prop = el_prop.get("ElectricProperties")
        
        if el_prop:
            dipole = el_prop.get("DipoleMoment")
            if dipole:
                 # ORCA JSON usually stores magnitude and vector
                 mag = dipole.get("Magnitude")
                 vec = dipole.get("Vector")
                 if mag is not None:
                     results["dipole_magnitude_debye"] = float(mag)
                 if vec and isinstance(vec, list):
                     results["dipole_vector"] = [float(x) for x in vec]

        # Charges - try multiple paths and types
        charges = prop.get("AtomicCharges")
        if not charges:
            charges = find_component(prop, "AtomicCharges")
        
        # Try xTB-specific charge paths
        if not charges:
            xtb_comp = find_component(prop, "xTB")
            if xtb_comp:
                charges = xtb_comp.get("AtomicCharges")
            
        if charges:
             # Extract ALL available charge types (not just the first found)
             charge_types = ["CHELPG", "Mulliken", "Loewdin", "CM5", "Hirshfeld"]
             for charge_type in charge_types:
                 charge_data = charges.get(charge_type)
                 if charge_data and isinstance(charge_data, list):
                     try:
                         charges_list = [float(x) for x in charge_data]
                         if charges_list:
                             results[f"{charge_type.lower()}_charges"] = charges_list
                     except (ValueError, TypeError):
                         logger.warning(f"Invalid {charge_type} charges data")

        # Additional fallback: try to extract charges from main JSON structure
        if not results:
            main_json_path = job_dir / "job.json"
            if main_json_path.exists():
                with open(main_json_path, 'r') as f:
                    main_data = json.load(f)
                
                # Try xTB section in main JSON
                xtb_data = main_data.get("xTB", {})
                if xtb_data:
                    charges = xtb_data.get("AtomicCharges")
                    if charges:
                        for charge_type in ["Mulliken", "CM5"]:
                            charge_data = charges.get(charge_type)
                            if charge_data and isinstance(charge_data, list):
                                try:
                                    charges_list = [float(x) for x in charge_data]
                                    if charges_list:
                                        results[f"{charge_type.lower()}_charges"] = charges_list
                                        break
                                except (ValueError, TypeError):
                                    continue

        if not results:
             return {"error": "No electrostatic data found in JSON"}
             
        return results
    except Exception as e:
         logger.warning(f"JSON electrostatic parse failed: {e}")
         return {"error": str(e)}


def parse_thermo(output_file: Path) -> Dict[str, Any]:
    """
    Parse thermochemical properties from ORCA frequency calculation.
    
    Extracts:
    - Gibbs Free Energy (G = H - TS)
    - Enthalpy (H)
    - Entropy (S)
    - Validates geometry (checks for imaginary frequencies)
    
    The Gibbs Free Energy is critical for:
    - Boltzmann weighting of conformer ensembles
    - Tautomer/isomer stability ranking
    
    Args:
        output_file: Path to ORCA output file
        
    Returns:
        Dictionary containing:
        - gibbs_free_energy_hartree: G in Hartree
        - enthalpy_hartree: H in Hartree
        - entropy_hartree_per_kelvin: S in Hartree/K
        - is_valid_minimum: True if no imaginary frequencies
        - imaginary_frequencies: List of imaginary freq if any
    """
    if not CCLIB_AVAILABLE:
        return {"error": "cclib not installed"}
    
    try:
        data = cclib.io.ccread(str(output_file))
        
        if data is None:
            return {"error": "cclib could not parse the file"}
        
        results = {}
        is_valid_minimum = True
        imaginary_freqs = []
        
        # Check for Imaginary Frequencies
        if hasattr(data, "vibfreqs"):
            frequencies = data.vibfreqs
            # The first 5-6 modes are translational/rotational (near zero)
            # We look for genuinely negative frequencies
            # A threshold of -50 cm^-1 accounts for numerical noise
            imaginary_freqs = [float(f) for f in frequencies if f < -50.0]
            
            if imaginary_freqs:
                is_valid_minimum = False
                results["imaginary_frequencies"] = imaginary_freqs
                results["warning"] = (
                    f"Found {len(imaginary_freqs)} imaginary frequency(ies). "
                    "This geometry is NOT a stable minimum."
                )
        
        results["is_valid_minimum"] = is_valid_minimum
        
        # Parse Thermochemical KPIs
        if hasattr(data, "freeenergy"):
            results["gibbs_free_energy_hartree"] = float(data.freeenergy)
        
        if hasattr(data, "enthalpy"):
            results["enthalpy_hartree"] = float(data.enthalpy)
        
        if hasattr(data, "entropy"):
            results["entropy_hartree_per_kelvin"] = float(data.entropy)
        
        # Also store temperature for reference
        if hasattr(data, "temperature"):
            results["temperature_kelvin"] = float(data.temperature)
        
        return results
        
    except Exception as e:
        logger.error(f"Error parsing thermochemistry: {e}")
        # Try JSON fallback
        json_results = parse_thermo_json(output_file)
        if json_results and "error" not in json_results:
             return json_results
        return {"error": str(e)}

def parse_thermo_json(output_file: Path) -> Dict[str, Any]:
    """Parse thermochemistry from job.property.json with enhanced xTB support"""
    try:
        job_dir = output_file.parent
        prop_path = job_dir / "job.property.json"
        
        if not prop_path.exists():
             return {"error": "job.property.json not found"}
             
        import json
        with open(prop_path, 'r') as f:
             prop = json.load(f)
             
        results = {}
        
        # Helper to find Component by type (case-insensitive)
        def find_component(data, type_name):
            components = data.get("Components", []) if isinstance(data.get("Components"), list) else []
            for comp in components:
                if isinstance(comp, dict) and type_name.lower() in comp.get("Type", "").lower():
                    return comp
            return None
            
        # Try standard thermodynamics first
        thermo = prop.get("Thermodynamics")
        if not thermo:
            thermo = find_component(prop, "Thermodynamics")
        
        # Try xTB-specific thermodynamics paths
        if not thermo:
            xtb_comp = find_component(prop, "xTB")
            if xtb_comp:
                thermo = xtb_comp.get("Thermodynamics")
            
        if thermo:
             # Typical keys: "Enthalpy", "Entropy", "GibbsFreeEnergy", "Temperature"
             # Values might be dictionaries with "Value" and "Unit"
             
             def get_val(key):
                 val = thermo.get(key)
                 if isinstance(val, dict):
                     return float(val.get("Value"))
                 if val is not None:
                     return float(val)
                 return None

             h = get_val("Enthalpy")
             if h is not None: results["enthalpy_hartree"] = h
             
             s = get_val("Entropy")
             if s is not None: results["entropy_hartree_per_kelvin"] = s
             
             g = get_val("GibbsFreeEnergy")
             if g is not None: results["gibbs_free_energy_hartree"] = g
             
             t = get_val("Temperature")
             if t is not None: results["temperature_kelvin"] = t
             
        # Imaginary frequencies check from job.json (VibrationalFrequencies)
        # This might be in job.json, not property.json
        json_path = job_dir / "job.json"
        if json_path.exists():
             with open(json_path, 'r') as f:
                 job = json.load(f)
             # Try to find frequencies
             # Usually in "VibrationalFrequencies" -> "Frequencies" (list)
             vib = job.get("VibrationalFrequencies")
             if not vib:
                  # Try scanning components
                  vib = find_component(job, "VibrationalFrequencies")
             
             if vib:
                  freqs = vib.get("Frequencies")
                  if freqs and isinstance(freqs, list):
                       # Look for negative (imaginary) frequencies
                       imag_freqs = [float(f) for f in freqs if float(f) < -50.0]
                       if imag_freqs:
                            results["is_valid_minimum"] = False
                            results["imaginary_frequencies"] = imag_freqs
                            results["warning"] = f"Found {len(imag_freqs)} imaginary frequencies"
                       else:
                            results["is_valid_minimum"] = True

        if not results:
             return {"error": "No thermochemistry data found in JSON"}
             
        return results

    except Exception as e:
         logger.warning(f"JSON thermo parse failed: {e}")
         return {"error": str(e)}


def parse_smd_solvation_energy(output_file: Path) -> Dict[str, Any]:
    """
    Parse SMD solvation free energy from ORCA output.
    
    The SMD (Solvation Model based on Density) provides ΔG_solv,
    which is critical for predicting:
    - Aqueous solubility (ADMET "A")
    - LogP partition coefficient (ADMET "D")
    
    SMD reports two components:
    1. G_ENP: Electrostatic + non-polar (from CPCM)
    2. G_CDS: Cavitation, dispersion, structure
    
    Total ΔG_solv = G_ENP + G_CDS
    
    NOTE: cclib does not parse these values, so we use regex.
    
    Args:
        output_file: Path to ORCA output file
        
    Returns:
        Dictionary containing:
        - delta_g_solv_kcal_mol: Total solvation energy
        - g_enp_hartree: Electrostatic component
        - g_cds_hartree: Non-electrostatic component
    """
    g_enp_hartree = None
    g_cds_hartree = None
    
    # Regex patterns for the two components
    enp_regex = re.compile(r"CPCM Dielectric\s*:\s*(-?\d+\.\d+)")
    cds_regex = re.compile(r"SMD CDS \(Gcds\)\s*:\s*(-?\d+\.\d+)")
    
    try:
        with open(output_file, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                if g_enp_hartree is None:
                    enp_match = enp_regex.search(line)
                    if enp_match:
                        g_enp_hartree = float(enp_match.group(1))
                
                if g_cds_hartree is None:
                    cds_match = cds_regex.search(line)
                    if cds_match:
                        g_cds_hartree = float(cds_match.group(1))
                
                # Early exit if both found
                if g_enp_hartree is not None and g_cds_hartree is not None:
                    break
        
        if g_enp_hartree is not None and g_cds_hartree is not None:
            # Sum the components
            total_delta_g_solv_hartree = g_enp_hartree + g_cds_hartree
            # Convert to kcal/mol (1 Hartree = 627.509 kcal/mol)
            total_delta_g_solv_kcal = total_delta_g_solv_hartree * 627.509
            
            return {
                "delta_g_solv_kcal_mol": round(total_delta_g_solv_kcal, 3),
                "g_enp_hartree": round(g_enp_hartree, 6),
                "g_cds_hartree": round(g_cds_hartree, 6)
            }
        else:
            return {"error": "Could not parse SMD solvation energy components"}
            
    except Exception as e:
        logger.error(f"Error parsing solvation energy: {e}")
        return {"error": str(e)}


def parse_ir_spectrum(output_file: Path) -> Dict[str, Any]:
    """
    Parse IR spectrum data from ORCA frequency calculation.
    
    Extracts vibrational frequencies and intensities for plotting.
    
    Args:
        output_file: Path to ORCA output file
        
    Returns:
        Dictionary containing:
        - frequencies: List of vibrational frequencies (cm^-1)
        - intensities: List of IR intensities (km/mol)
    """
    # Try cclib first
    if CCLIB_AVAILABLE:
        try:
            data = cclib.io.ccread(str(output_file))
            
            if data is not None and hasattr(data, "vibfreqs") and hasattr(data, "vibirs"):
                return {
                    "frequencies": data.vibfreqs.tolist(),
                    "intensities": data.vibirs.tolist()
                }
        except Exception as e:
            logger.warning(f"cclib failed to parse IR spectrum: {e}")
    
    # Try JSON fallback (job.json has VibrationalFrequencies)
    try:
        json_result = parse_ir_spectrum_json(output_file)
        if json_result and "error" not in json_result:
            return json_result
    except Exception as e:
        logger.warning(f"JSON IR spectrum parse failed: {e}")
    
    # Try regex fallback from .out file
    try:
        regex_result = parse_ir_spectrum_regex(output_file)
        if regex_result and "error" not in regex_result:
            return regex_result
    except Exception as e:
        logger.warning(f"Regex IR spectrum parse failed: {e}")
    
    return {"error": "No IR spectrum data found"}


def parse_ir_spectrum_json(output_file: Path) -> Dict[str, Any]:
    """Parse IR spectrum from ORCA JSON output files."""
    import json
    job_dir = output_file.parent
    
    # Try job.json first (ORCA 6 format)
    json_path = job_dir / "job.json"
    if json_path.exists():
        try:
            with open(json_path, 'r') as f:
                data = json.load(f)
            
            # Navigate to VibrationalFrequencies
            vib = data.get("VibrationalFrequencies")
            if vib:
                freqs = vib.get("Frequencies", [])
                irs = vib.get("IR_Intensities", [])
                
                if freqs and irs and len(freqs) == len(irs):
                    return {
                        "frequencies": [float(f) for f in freqs],
                        "intensities": [float(i) for i in irs]
                    }
                elif freqs:
                    # If we have frequencies but no intensities, return frequencies only
                    return {
                        "frequencies": [float(f) for f in freqs],
                        "intensities": [1.0] * len(freqs)  # Placeholder intensities
                    }
        except Exception as e:
            logger.warning(f"Failed to parse job.json for IR: {e}")
    
    # Try job.property.json
    prop_path = job_dir / "job.property.json"
    if prop_path.exists():
        try:
            with open(prop_path, 'r') as f:
                prop = json.load(f)
            
            # Look for vibrational data in components
            components = prop.get("Components", []) if isinstance(prop.get("Components"), list) else []
            for comp in components:
                if isinstance(comp, dict) and comp.get("Type") == "VibrationalFrequencies":
                    freqs = comp.get("Frequencies", [])
                    irs = comp.get("IR_Intensities", comp.get("Intensities", []))
                    
                    if freqs:
                        return {
                            "frequencies": [float(f) for f in freqs],
                            "intensities": [float(i) for i in irs] if irs else [1.0] * len(freqs)
                        }
        except Exception as e:
            logger.warning(f"Failed to parse job.property.json for IR: {e}")
    
    return {"error": "No IR data in JSON files"}


def parse_ir_spectrum_regex(output_file: Path) -> Dict[str, Any]:
    """
    Parse IR spectrum from ORCA output file using regex.
    
    Extracts full IR spectrum data including:
    - Mode numbers
    - Frequencies (cm^-1)
    - Molar absorption coefficients (eps, L/(mol*cm))
    - Integrated absorption (Int, km/mol)
    - Transition dipole squared (T**2, a.u.)
    - Transition dipole components (TX, TY, TZ)
    
    ORCA IR SPECTRUM format (after ORCA 4.2.1):
    -----------
    IR SPECTRUM
    -----------
    
     Mode   freq       eps      Int      T**2         TX        TY        TZ
           cm**-1   L/(mol*cm) km/mol    a.u.
    ----------------------------------------------------------------------------
      6:   1146.68   0.000341    1.73  0.000093  (-0.000000 -0.009640  0.000000)
    """
    result = {
        "modes": [],
        "frequencies": [],
        "eps": [],  # Molar absorption coefficient L/(mol*cm)
        "intensities": [],  # Integrated absorption km/mol (Int column)
        "t_squared": [],  # T**2 in a.u.
        "tx": [],
        "ty": [],
        "tz": []
    }
    
    try:
        with open(output_file, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        # Pattern 1: Look for full IR SPECTRUM table with all columns
        # ORCA 4.2.1+ format:
        # Mode   freq       eps      Int      T**2         TX        TY        TZ
        #       cm**-1   L/(mol*cm) km/mol    a.u.
        # ----------------------------------------------------------------------------
        #   6:   1146.68   0.000341    1.73  0.000093  (-0.000000 -0.009640  0.000000)
        
        ir_section = re.search(
            r'IR SPECTRUM\s*\n-+\s*\n\s*Mode\s+freq\s+eps\s+Int\s+T\*\*2.*?\n.*?cm\*\*-1.*?\n-+\s*\n(.*?)(?:\n\n|\nThe first|\n-{20,})',
            content,
            re.DOTALL | re.IGNORECASE
        )
        
        if ir_section:
            lines = ir_section.group(1).strip().split('\n')
            for line in lines:
                if not line.strip() or line.strip().startswith('-'):
                    continue
                # Pattern: "  6:   1146.68   0.000341    1.73  0.000093  (-0.000000 -0.009640  0.000000)"
                match = re.match(
                    r'\s*(\d+):\s+(-?\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)',
                    line
                )
                if match:
                    mode = int(match.group(1))
                    freq = float(match.group(2))
                    eps = float(match.group(3))
                    intensity = float(match.group(4))
                    t_sq = float(match.group(5))
                    tx = float(match.group(6))
                    ty = float(match.group(7))
                    tz = float(match.group(8))
                    
                    if freq > 0:  # Skip translational/rotational modes
                        result["modes"].append(mode)
                        result["frequencies"].append(freq)
                        result["eps"].append(eps)
                        result["intensities"].append(intensity)
                        result["t_squared"].append(t_sq)
                        result["tx"].append(tx)
                        result["ty"].append(ty)
                        result["tz"].append(tz)
        
        # Pattern 2: Simpler IR SPECTRUM format (older ORCA or different output)
        if not result["frequencies"]:
            ir_section = re.search(
                r'IR SPECTRUM\s*\n-+\s*\n.*?Mode.*?freq.*?\n(.*?)(?:\n\n|\n-{3,}|\nThe first)',
                content,
                re.DOTALL | re.IGNORECASE
            )
            
            if ir_section:
                lines = ir_section.group(1).strip().split('\n')
                for line in lines:
                    if not line.strip() or line.strip().startswith('-'):
                        continue
                    # Simpler pattern: "   6:      1234.56    0.123456  ..."
                    match = re.match(r'\s*(\d+):\s+(-?\d+\.?\d*)\s+(\d+\.?\d*)', line)
                    if match:
                        mode = int(match.group(1))
                        freq = float(match.group(2))
                        intensity = float(match.group(3))
                        if freq > 0:
                            result["modes"].append(mode)
                            result["frequencies"].append(freq)
                            result["intensities"].append(intensity)
        
        # Pattern 3: Look for VIBRATIONAL FREQUENCIES section
        if not result["frequencies"]:
            vib_section = re.search(
                r'VIBRATIONAL FREQUENCIES\s*\n-+\s*\n(.*?)(?:\n\n|\n-{3,}|\nNORMAL MODES)',
                content,
                re.DOTALL
            )
            
            if vib_section:
                lines = vib_section.group(1).strip().split('\n')
                for line in lines:
                    # Pattern: "   6:      1234.56 cm**-1"
                    match = re.match(r'\s*(\d+):\s+(-?\d+\.?\d*)\s*cm', line)
                    if match:
                        mode = int(match.group(1))
                        freq = float(match.group(2))
                        if freq > 50:  # Skip low-frequency modes
                            result["modes"].append(mode)
                            result["frequencies"].append(freq)
                            result["intensities"].append(1.0)  # Placeholder
        
        # Pattern 4: Fallback - find all frequency values
        if not result["frequencies"]:
            freq_matches = re.findall(r'(\d+\.?\d*)\s*cm\*?\*?-1', content)
            for i, fm in enumerate(freq_matches):
                freq = float(fm)
                if 100 < freq < 4500:  # Reasonable IR range
                    result["modes"].append(i)
                    result["frequencies"].append(freq)
                    result["intensities"].append(1.0)
        
        if result["frequencies"]:
            # Remove duplicates while preserving order
            seen = set()
            unique_result = {
                "modes": [],
                "frequencies": [],
                "eps": [],
                "intensities": [],
                "t_squared": [],
                "tx": [],
                "ty": [],
                "tz": []
            }
            
            for i, f in enumerate(result["frequencies"]):
                if f not in seen:
                    seen.add(f)
                    unique_result["modes"].append(result["modes"][i] if i < len(result["modes"]) else i)
                    unique_result["frequencies"].append(f)
                    unique_result["intensities"].append(result["intensities"][i] if i < len(result["intensities"]) else 1.0)
                    if result["eps"]:
                        unique_result["eps"].append(result["eps"][i] if i < len(result["eps"]) else 0.0)
                    if result["t_squared"]:
                        unique_result["t_squared"].append(result["t_squared"][i] if i < len(result["t_squared"]) else 0.0)
                    if result["tx"]:
                        unique_result["tx"].append(result["tx"][i] if i < len(result["tx"]) else 0.0)
                    if result["ty"]:
                        unique_result["ty"].append(result["ty"][i] if i < len(result["ty"]) else 0.0)
                    if result["tz"]:
                        unique_result["tz"].append(result["tz"][i] if i < len(result["tz"]) else 0.0)
            
            # Clean up empty arrays
            final_result = {
                "frequencies": unique_result["frequencies"],
                "intensities": unique_result["intensities"]
            }
            if unique_result["modes"]:
                final_result["modes"] = unique_result["modes"]
            if unique_result["eps"] and any(e > 0 for e in unique_result["eps"]):
                final_result["eps"] = unique_result["eps"]
            if unique_result["t_squared"] and any(t > 0 for t in unique_result["t_squared"]):
                final_result["t_squared"] = unique_result["t_squared"]
            if unique_result["tx"]:
                final_result["tx"] = unique_result["tx"]
            if unique_result["ty"]:
                final_result["ty"] = unique_result["ty"]
            if unique_result["tz"]:
                final_result["tz"] = unique_result["tz"]
            
            return final_result
        
    except Exception as e:
        logger.error(f"Error in regex IR parsing: {e}")
    
    return {"error": "Could not parse IR spectrum from output file"}


def parse_normal_modes(output_file: Path) -> Dict[str, Any]:
    """
    Parse normal mode data from ORCA output including displacement vectors.
    
    Extracts:
    - Vibrational frequencies (cm^-1)
    - IR intensities (km/mol)
    - Normal mode displacement vectors (for animation)
    - Equilibrium geometry coordinates
    
    Args:
        output_file: Path to ORCA output file
        
    Returns:
        Dictionary containing:
        - frequencies: List of vibrational frequencies (cm^-1)
        - intensities: List of IR intensities (km/mol)
        - displacements: 3D array [mode][atom][x,y,z] in Angstroms
        - equilibrium_geometry: 2D array [atom][x,y,z] in Angstroms
        - atom_symbols: List of element symbols
    """
    if not CCLIB_AVAILABLE:
        return {"error": "cclib not installed"}
    
    try:
        data = cclib.io.ccread(str(output_file))
        
        if data is None:
            return {"error": "cclib could not parse the file"}
        
        results = {}
        
        # Extract frequencies and intensities
        if hasattr(data, "vibfreqs") and hasattr(data, "vibirs"):
            frequencies = data.vibfreqs.tolist()
            intensities = data.vibirs.tolist()
            results["frequencies"] = frequencies
            results["intensities"] = intensities
        else:
            # Fallback to IR spectrum parser
            ir_data = parse_ir_spectrum(output_file)
            if "error" not in ir_data:
                results["frequencies"] = ir_data.get("frequencies", [])
                results["intensities"] = ir_data.get("intensities", [])
            else:
                return {"error": "No vibrational frequency data found"}
        
        # Extract normal mode displacement vectors
        if hasattr(data, "vibdisps"):
            # vibdisps is a 3D numpy array: [mode][atom][x,y,z]
            # Units are typically in Angstroms per sqrt(amu) or similar
            # Convert to list for JSON serialization
            displacements = data.vibdisps.tolist()
            results["displacements"] = displacements
        else:
            logger.warning("No displacement vectors found in output (vibdisps not available)")
            results["displacements"] = None
        
        # Extract equilibrium geometry
        if hasattr(data, "atomcoords") and len(data.atomcoords) > 0:
            # atomcoords is a 3D array [step][atom][x,y,z], use last step (optimized geometry)
            equilibrium_geometry = data.atomcoords[-1].tolist()
            results["equilibrium_geometry"] = equilibrium_geometry
        elif hasattr(data, "atomnos") and hasattr(data, "atomcoords"):
            # Try to get from first coordinate set
            if len(data.atomcoords) > 0:
                equilibrium_geometry = data.atomcoords[0].tolist()
                results["equilibrium_geometry"] = equilibrium_geometry
            else:
                logger.warning("No geometry coordinates found")
                results["equilibrium_geometry"] = None
        else:
            results["equilibrium_geometry"] = None
        
        # Extract atom symbols
        if hasattr(data, "atomnos"):
            periodic_table = PeriodicTable()
            atom_symbols = [periodic_table.element[atomic_num] for atomic_num in data.atomnos]
            results["atom_symbols"] = atom_symbols
        else:
            results["atom_symbols"] = None
        
        return results
        
    except Exception as e:
        logger.error(f"Error parsing normal modes: {e}", exc_info=True)
        # Try JSON fallback
        try:
            json_result = parse_normal_modes_json(output_file)
            if json_result and "error" not in json_result:
                return json_result
        except Exception as e2:
            logger.warning(f"JSON normal modes parse failed: {e2}")
        
        return {"error": f"Failed to parse normal modes: {str(e)}"}


def parse_normal_modes_json(output_file: Path) -> Dict[str, Any]:
    """Parse normal mode data from ORCA JSON output files."""
    import json
    job_dir = output_file.parent
    
    # Try job.json first (ORCA 6 format)
    json_path = job_dir / "job.json"
    if json_path.exists():
        try:
            with open(json_path, 'r') as f:
                data = json.load(f)
            
            # Navigate to VibrationalFrequencies
            vib = data.get("VibrationalFrequencies")
            if vib:
                freqs = vib.get("Frequencies", [])
                irs = vib.get("IR_Intensities", [])
                
                result = {
                    "frequencies": [float(f) for f in freqs] if freqs else [],
                    "intensities": [float(i) for i in irs] if irs else [1.0] * len(freqs) if freqs else [],
                    "displacements": None,  # JSON format may not have displacements
                    "equilibrium_geometry": None,
                    "atom_symbols": None
                }
                
                # Try to get geometry from other parts of JSON
                geometry = data.get("Geometry")
                if geometry:
                    coords = geometry.get("Coordinates", {})
                    if "Cartesians" in coords:
                        result["equilibrium_geometry"] = coords["Cartesians"]
                    if "Atoms" in geometry:
                        result["atom_symbols"] = geometry["Atoms"]
                
                return result
        except Exception as e:
            logger.warning(f"Failed to parse job.json for normal modes: {e}")
    
    return {"error": "No normal mode data in JSON files"}


def check_orca_termination(output_file: Path) -> Dict[str, Any]:
    """
    Check if ORCA calculation terminated normally.
    
    This is a critical first-level check before parsing any results.
    
    Args:
        output_file: Path to ORCA output file
        
    Returns:
        Dictionary with 'success' boolean and optional 'error' message
    """
    try:
        with open(output_file, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
            # Check for error termination
            if "ORCA finished by error termination" in content:
                return {
                    "success": False,
                    "error": "ORCA terminated with an error"
                }
            
            # Check for normal termination
            if "ORCA TERMINATED NORMALLY" in content:
                return {"success": True}
            
            # If neither found, job may have crashed or is incomplete
            return {
                "success": False,
                "error": "ORCA job did not complete (no termination message found)"
            }
            
    except Exception as e:
        logger.error(f"Error checking termination: {e}")
        return {"success": False, "error": str(e)}


def parse_final_energy(output_file: Path) -> Optional[float]:
    """
    Parse final SCF energy from ORCA output.
    Uses regex parsing first (most reliable for ORCA), falls back to cclib.
    
    Args:
        output_file: Path to ORCA output file
        
    Returns:
        Final energy in Hartree, or None if not found
    """
    # Try regex parsing first - most reliable for ORCA output
    try:
        with open(output_file, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
        # Look for "FINAL SINGLE POINT ENERGY" line (ORCA standard output)
        match = re.search(r'FINAL SINGLE POINT ENERGY\s+(-?\d+\.\d+)', content)
        if match:
            energy = float(match.group(1))
            logger.info(f"Extracted final energy from regex: {energy} Hartree")
            return energy
        
        # Alternative: Look for "Total Energy" in summary
        match = re.search(r'Total Energy\s*:\s*(-?\d+\.\d+)', content)
        if match:
            energy = float(match.group(1))
            logger.info(f"Extracted total energy from regex: {energy} Hartree")
            return energy
            
    except Exception as e:
        logger.debug(f"Regex parsing failed: {e}")
    
    # Fallback to cclib (may have issues with some ORCA versions)
    if CCLIB_AVAILABLE:
        try:
            # Suppress cclib's verbose output during parsing
            import logging as _logging
            cclib_logger = _logging.getLogger('cclib')
            original_level = cclib_logger.level
            cclib_logger.setLevel(_logging.CRITICAL)
            
            try:
                data = cclib.io.ccread(str(output_file), logging=False)
            finally:
                cclib_logger.setLevel(original_level)
            
            # Check that scfenergies exists AND is non-empty
            if data and hasattr(data, "scfenergies") and len(data.scfenergies) > 0:
                # cclib stores energies in eV, convert to Hartree
                energy_ev = float(data.scfenergies[-1])
                energy_hartree = energy_ev / 27.211386245988
                logger.info(f"Extracted final energy from cclib: {energy_hartree} Hartree")
                return energy_hartree
        except Exception as e:
            logger.debug(f"cclib failed to parse final energy: {e}")
    
    return None


def parse_all_kpis(output_file: Path) -> Dict[str, Any]:
    """
    Convenience function to parse all available KPIs from an ORCA output.
    
    Args:
        output_file: Path to ORCA output file
        
    Returns:
        Dictionary containing all parsed KPIs
    """
    results = {}
    
    # 1. Try orca-parser first (specialized for ORCA)
    if ORCA_PARSER_AVAILABLE:
        try:
            orca_results = parse_with_orca_parser(output_file)
            if orca_results.get("success", False):
                results.update(orca_results)
                # If we successfully parsed with orca-parser, we might still want to run others
                # as fallbacks or for additional data not covered by orca-parser
        except Exception as e:
            logger.error(f"orca-parser failed: {e}")

    # Check termination first (if not already done by orca-parser)
    if "termination_check" not in results:
        term_check = check_orca_termination(output_file)
        results["termination_check"] = term_check
    
    if not results.get("termination_check", {}).get("success"):
        results["status"] = "FAILED"
        results["error"] = results.get("termination_check", {}).get("error", "Unknown error")
        return results
    
    # Parse all KPIs using existing methods (filling in gaps)
    if "fmo_data" not in results:
        results["fmo_data"] = parse_fmo_data(output_file)
    if "electrostatics" not in results:
        results["electrostatics"] = parse_electrostatics(output_file)
    if "thermochemistry" not in results:
        results["thermochemistry"] = parse_thermo(output_file)
    if "solvation" not in results:
        results["solvation"] = parse_smd_solvation_energy(output_file)
    if "ir_spectrum" not in results:
        results["ir_spectrum"] = parse_ir_spectrum(output_file)
    if "final_energy" not in results:
        results["final_energy"] = parse_final_energy(output_file)
    
    results["status"] = "SUCCESS"
    return results


def parse_with_orca_parser(output_file: Path) -> Dict[str, Any]:
    """
    Parse ORCA output using the orca-parser library.
    
    Extracts:
    - Termination status
    - Run time
    - Input line
    - Frequencies (if available)
    - HOMO/LUMO/Gap (if available)
    
    Args:
        output_file: Path to ORCA output file
        
    Returns:
        Dictionary with parsed data
    """
    if not ORCA_PARSER_AVAILABLE:
        return {"success": False, "error": "orca-parser not installed"}
        
    results = {}
    try:
        # Initialize ORCAParse
        # Note: orca-parser expects a string path
        optimization = orca_parser.ORCAParse(str(output_file))
        
        # Basic run info
        results["termination_check"] = {
            "success": optimization.valid,
            "duration_seconds": optimization.seconds()
        }
        
        # Input line
        try:
            results["input_line"] = optimization.parse_input()
        except:
            pass
            
        # Coordinates
        try:
            optimization.parse_coords()
            if hasattr(optimization, "atoms") and hasattr(optimization, "coords"):
                results["atoms"] = optimization.atoms
                # Get final coordinates (last step)
                if len(optimization.coords) > 0:
                    results["final_coordinates"] = optimization.coords[-1]
        except Exception as e:
            logger.warning(f"orca-parser failed to parse coords: {e}")

        # Frequencies
        try:
            if hasattr(optimization, "parse_freqs"):
                optimization.parse_freqs()
                # Check for likely attribute names
                if hasattr(optimization, "frequencies"):
                    results["frequencies"] = optimization.frequencies
                elif hasattr(optimization, "freqs"):
                    results["frequencies"] = optimization.freqs
        except Exception as e:
            logger.warning(f"orca-parser failed to parse frequencies: {e}")

        # HOMO/LUMO
        try:
            if hasattr(optimization, "parse_HOMO_LUMO"):
                optimization.parse_HOMO_LUMO()
                # Check for likely attribute names
                if hasattr(optimization, "homo_lumo"):
                    # It might be a dict or list?
                    results["homo_lumo_raw"] = optimization.homo_lumo
                
                # Try to extract specific values if attributes exist
                fmo = {}
                if hasattr(optimization, "homo"):
                    fmo["homo_eV"] = float(optimization.homo)
                if hasattr(optimization, "lumo"):
                    fmo["lumo_eV"] = float(optimization.lumo)
                if hasattr(optimization, "gap"):
                    fmo["gap_eV"] = float(optimization.gap)
                
                if fmo:
                    results["fmo_data"] = fmo
        except Exception as e:
            logger.warning(f"orca-parser failed to parse HOMO/LUMO: {e}")

        # Free Energy / Thermodynamics
        try:
            if hasattr(optimization, "parse_free_energy"):
                optimization.parse_free_energy()
                thermo = {}
                if hasattr(optimization, "free_energy"):
                    thermo["gibbs_free_energy_hartree"] = float(optimization.free_energy)
                if hasattr(optimization, "enthalpy"):
                    thermo["enthalpy_hartree"] = float(optimization.enthalpy)
                if hasattr(optimization, "entropy"):
                    thermo["entropy_hartree_per_kelvin"] = float(optimization.entropy)
                
                if thermo:
                    results["thermochemistry"] = thermo
        except Exception as e:
            logger.warning(f"orca-parser failed to parse free energy: {e}")

        # Charges
        try:
            if hasattr(optimization, "parse_charges"):
                optimization.parse_charges()
                if hasattr(optimization, "charges"):
                    # Assuming it returns a list or dict of charges
                    results["charges"] = optimization.charges
                    # Try to map to chelpg/mulliken if possible (structure unknown)
                    # We'll store it as 'orca_charges' for now
        except Exception as e:
            logger.warning(f"orca-parser failed to parse charges: {e}")

        # Dipole
        try:
            if hasattr(optimization, "parse_dipole"):
                optimization.parse_dipole()
                if hasattr(optimization, "dipole"):
                    results["dipole_moment"] = optimization.dipole
        except Exception as e:
            logger.warning(f"orca-parser failed to parse dipole: {e}")

        results["success"] = True
        return results
        
    except Exception as e:
        logger.error(f"Error in parse_with_orca_parser: {e}")
        return {"success": False, "error": str(e)}
