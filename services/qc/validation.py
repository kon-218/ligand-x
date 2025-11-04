"""
ORCA Method Validation Module

This module provides validation rules for ORCA quantum chemistry calculations
to prevent invalid method/basis/keyword combinations that would cause ORCA to fail.

Based on ORCA 6.x Manual Section 7.4 - Choice of Computational Model
"""

import logging
from typing import Dict, Any, List, Tuple, Optional

logger = logging.getLogger(__name__)


# =============================================================================
# METHOD CATEGORIES - Based on ORCA Manual Section 7.4
# =============================================================================

# Methods that don't use basis sets (have built-in basis or parameterization)
METHODS_WITHOUT_BASIS = {
    # External xTB methods (require otool_xtb)
    'XTB0', 'XTB1', 'XTB2', 'XTBFF',
    'GFN0-XTB', 'GFN-XTB', 'GFN1-XTB', 'GFN2-XTB', 'GFN-FF',
    # Native xTB methods (ORCA 6.x built-in)
    'NATIVE-GFN-XTB', 'NATIVE-GFN1-XTB', 'NATIVE-GFN2-XTB',
    'NATIVE-XTB', 'NATIVE-XTB1', 'NATIVE-XTB2',
    'NATIVE-SPGFN-XTB', 'NATIVE-SPGFN1-XTB', 'NATIVE-SPGFN2-XTB',
    'NATIVE-SPXTB', 'NATIVE-SPXTB1', 'NATIVE-SPXTB2',
    # NDO-based semiempirical methods (Section 7.4.3)
    'AM1', 'PM3', 'PM6', 'MNDO',
    'ZINDO/1', 'ZINDO/2', 'ZINDO/S', 'ZINDO_1', 'ZINDO_2', 'ZINDO_S',
    'ZNDDO/1', 'ZNDDO/2', 'ZNDDO_1', 'ZNDDO_2',
    'INDO/1', 'INDO/2', 'INDO/S', 'INDO_1', 'INDO_2', 'INDO_S',
    'CNDO/1', 'CNDO/2', 'CNDO/S', 'CNDO_1', 'CNDO_2', 'CNDO_S',
    'INDO', 'CNDO', 'NDDO',
    # Composite methods (Section 7.4.2.11-14) - have built-in basis sets
    'HF-3C', 'PBEH-3C', 'B97-3C', 'R2SCAN-3C', 'WB97X-3C',
}

# Hybrid functionals that benefit from RIJCOSX (Section 7.4.2.6)
HYBRID_FUNCTIONALS = {
    # GGA Hybrids (Section 7.4.2.1)
    'B1LYP', 'B1P', 'G1LYP', 'G1P',
    'B3LYP', 'B3LYP_TM', 'B3LYP_G', 'B3P', 'G3LYP', 'G3P',
    'PBE0', 'PWP1', 'MPW1PW', 'MPW1LYP', 'PW91_0',
    'O3LYP', 'X3LYP', 'B97', 'BHANDHLYP',
    # Meta-GGA Hybrids
    'TPSSH', 'TPSS0', 'PW6B95', 'M06', 'M062X',
    'R2SCANH', 'R2SCAN0', 'R2SCAN50',
    # Range-Separated Hybrids (Section 7.4.2.1)
    'WB97', 'WB97X', 'WB97X-D3', 'WB97X-D3BJ', 'WB97X-V', 'WB97X-D4',
    'WB97M-V', 'WB97M-D3BJ', 'WB97M-D4',
    'CAM-B3LYP', 'CAMB3LYP', 'LC-BLYP', 'LC_BLYP', 'LC-PBE', 'LC_PBE',
    'WR2SCAN',
}

# Pure GGA functionals (no HF exchange) - RIJCOSX not beneficial
PURE_GGA_FUNCTIONALS = {
    # Local functionals
    'HFS', 'LSD', 'VWN5', 'VWN3', 'PWLDA',
    # Pure GGA functionals (Section 7.4.2.1)
    'BNULL', 'BVWN', 'BP', 'BP86', 'PW91', 'MPWPW', 'MPWLYP',
    'BLYP', 'GP', 'GLYP', 'PBE', 'REVPBE', 'RPBE', 'PWP',
    'OLYP', 'OPBE', 'XLYP', 'B97D', 'B97-D', 'PW86PBE', 'RPW86PBE',
    # Meta-GGA functionals
    'M06L', 'M06-L', 'TPSS', 'REVTPSS', 'SCAN', 'SCANFUNC',
    'RSCAN', 'R2SCAN',
}

# Double-hybrid functionals - special handling required (Section 7.4.2.1)
# These CANNOT be called from %method block, only via simple input keywords
DOUBLE_HYBRID_FUNCTIONALS = {
    'B2PLYP', 'B2GP-PLYP', 'B2T-PLYP', 'MPW2PLYP',
    'DSD-BLYP', 'DSD-PBEP86', 'DSD-PBEPBE', 'DSD-PBEB95',
    'PWPB95', 'B2PLYP-D3', 'B2PLYP-D4',
    'PR2SCAN50', 'KPR2SCAN50', 'PR2SCAN69', 'WPR2SCAN50',
}

# Wavefunction methods
WAVEFUNCTION_METHODS = {
    'HF', 'RHF', 'UHF', 'ROHF',
    'MP2', 'RI-MP2', 'DLPNO-MP2', 'SCS-MP2', 'OO-RI-MP2',
    'MP3', 'MP4',
    'CCSD', 'CCSD(T)', 'DLPNO-CCSD', 'DLPNO-CCSD(T)', 'DLPNO-CCSD(T1)',
    'CCSD-F12', 'CCSD(T)-F12',
    'QCISD', 'QCISD(T)',
    'CEPA', 'NCEPA', 'CEPA/1', 'CEPA/2', 'CEPA/3',
}

# Coupled cluster methods (canonical) — need large basis, expensive scaling
CANONICAL_CC_METHODS = {
    'CCSD', 'CCSD(T)',
    'CCSD-F12', 'CCSD(T)-F12',
    'QCISD', 'QCISD(T)',
    'CEPA', 'NCEPA', 'CEPA/1', 'CEPA/2', 'CEPA/3',
}

# DLPNO coupled cluster methods — local correlation, require /C auxiliary basis
DLPNO_CC_METHODS = {
    'DLPNO-CCSD', 'DLPNO-CCSD(T)', 'DLPNO-CCSD(T1)',
    'DLPNO-MP2',
}

# All coupled cluster methods (canonical + DLPNO)
COUPLED_CLUSTER_METHODS = CANONICAL_CC_METHODS | DLPNO_CC_METHODS

# Map from primary basis to matching /C auxiliary basis for CC/DLPNO calculations
CC_AUX_BASIS_MAP = {
    'cc-pVDZ': 'cc-pVDZ/C',
    'cc-pVTZ': 'cc-pVTZ/C',
    'cc-pVQZ': 'cc-pVQZ/C',
    'aug-cc-pVDZ': 'aug-cc-pVDZ/C',
    'aug-cc-pVTZ': 'aug-cc-pVTZ/C',
    'aug-cc-pVQZ': 'aug-cc-pVQZ/C',
    'def2-SVP': 'def2-SVP/C',
    'def2-TZVP': 'def2-TZVP/C',
    'def2-TZVPP': 'def2-TZVPP/C',
    'def2-QZVP': 'def2-QZVP/C',
    'def2-QZVPP': 'def2-QZVPP/C',
}

# Functionals that already include dispersion correction
FUNCTIONALS_WITH_BUILTIN_DISPERSION = {
    'B97-D', 'B97D', 'B97-D3', 'B97-D4',
    'B97M-V', 'B97M-D3BJ', 'B97M-D4',
    'WB97X-D3', 'WB97X-D3BJ', 'WB97X-V', 'WB97X-D4',
    'WB97M-V', 'WB97M-D3BJ', 'WB97M-D4',
    # Composite methods include dispersion
    'HF-3C', 'PBEH-3C', 'B97-3C', 'R2SCAN-3C', 'WB97X-3C',
    # Double-hybrids with dispersion
    'B2PLYP-D3', 'B2PLYP-D4', 'DSD-PBEP86-D3', 'DSD-PBEP86-D4',
}

# Methods that don't support analytical frequencies
METHODS_NO_ANALYTICAL_FREQ = {
    # xTB methods - only numerical frequencies
    'XTB0', 'XTB1', 'XTB2', 'XTBFF',
    'GFN0-XTB', 'GFN-XTB', 'GFN1-XTB', 'GFN2-XTB', 'GFN-FF',
    'NATIVE-GFN-XTB', 'NATIVE-GFN1-XTB', 'NATIVE-GFN2-XTB',
    # Canonical coupled cluster — no analytical frequencies (use NumFreq if needed)
    'MP3', 'MP4', 'CCSD', 'CCSD(T)', 'QCISD', 'QCISD(T)',
    'CCSD-F12', 'CCSD(T)-F12',
    # DLPNO-CC — no analytical frequencies
    'DLPNO-CCSD', 'DLPNO-CCSD(T)', 'DLPNO-CCSD(T1)',
}

# Semiempirical methods (Section 7.4.3)
SEMIEMPIRICAL_METHODS = {
    # Dewar-type NDDO methods
    'MNDO', 'AM1', 'PM3', 'PM6',
    # CNDO/INDO methods
    'CNDO', 'CNDO/1', 'CNDO/2', 'CNDO/S', 'CNDO_1', 'CNDO_2', 'CNDO_S',
    'INDO', 'INDO/1', 'INDO/2', 'INDO/S', 'INDO_1', 'INDO_2', 'INDO_S',
    'NDDO',
    # ZINDO methods (good for transition metals)
    'ZINDO/1', 'ZINDO/2', 'ZINDO/S', 'ZINDO_1', 'ZINDO_2', 'ZINDO_S',
    'ZNDDO/1', 'ZNDDO/2', 'ZNDDO_1', 'ZNDDO_2',
}

# xTB methods (Section 7.4.3.1)
XTB_METHODS = {
    # External xTB (requires otool_xtb binary)
    'XTB0', 'XTB1', 'XTB2', 'XTBFF',
    'GFN0-XTB', 'GFN-XTB', 'GFN1-XTB', 'GFN2-XTB', 'GFN-FF',
    # Native ORCA xTB implementation
    'NATIVE-GFN-XTB', 'NATIVE-GFN1-XTB', 'NATIVE-GFN2-XTB',
    'NATIVE-XTB', 'NATIVE-XTB1', 'NATIVE-XTB2',
    'NATIVE-SPGFN-XTB', 'NATIVE-SPGFN1-XTB', 'NATIVE-SPGFN2-XTB',
    'NATIVE-SPXTB', 'NATIVE-SPXTB1', 'NATIVE-SPXTB2',
}

# Composite methods (Section 7.4.2.11-14)
COMPOSITE_METHODS = {
    'HF-3C',      # Section 7.4.2.11 - MINIX basis
    'PBEH-3C',    # Section 7.4.2.12 - def2-mSVP basis
    'B97-3C',     # Section 7.4.2.12 - def2-mTZVP basis
    'R2SCAN-3C',  # Section 7.4.2.13 - def2-mTZVPP basis
    'WB97X-3C',   # Section 7.4.2.14 - vDZP basis
}


# =============================================================================
# VALIDATION FUNCTIONS
# =============================================================================

def normalize_method_name(method: str) -> str:
    """
    Normalize method name to ORCA-compatible format.
    
    Handles common variations and typos in method names.
    """
    method = method.upper().strip()
    
    # Common corrections
    corrections = {
        # Hyphen vs underscore normalization
        'M06-L': 'M06L',
        'M06-2X': 'M062X',
        'M06-HF': 'M06HF',
        'M08-HX': 'M08HX',
        'M08-SO': 'M08SO',
        'M11-L': 'M11L',
        # Range-separated hybrids
        'WB97X-D': 'WB97X-D3',  # D alone is ambiguous
        'ΩB97X': 'WB97X',
        'ΩB97': 'WB97',
        'ΩB97M-V': 'WB97M-V',
        # Composite methods
        'HF3C': 'HF-3C',
        'PBEH3C': 'PBEH-3C',
        'B973C': 'B97-3C',
        'R2SCAN3C': 'R2SCAN-3C',
        'WB97X3C': 'WB97X-3C',
        # xTB aliases
        'GFN-XTB': 'GFN1-XTB',  # GFN-xTB is GFN1-xTB
        'XTB': 'XTB2',  # Default xTB is GFN2
        # CAM-B3LYP variations
        'CAMB3LYP': 'CAM-B3LYP',
        # LC functionals
        'LCBLYP': 'LC-BLYP',
        'LCPBE': 'LC-PBE',
    }
    
    return corrections.get(method, method)


def validate_method_basis_combination(method: str, basis: str) -> Tuple[bool, str]:
    """
    Validate that method and basis set combination is valid.
    
    Returns:
        Tuple of (is_valid, message)
    """
    method_upper = normalize_method_name(method)
    
    # Methods that don't use basis sets
    if method_upper in METHODS_WITHOUT_BASIS:
        if basis and basis.strip():
            return False, f"Method '{method}' has a built-in basis set. Remove the basis set specification."
        return True, ""
    
    # All other methods require a basis set
    if not basis or not basis.strip():
        return False, f"Method '{method}' requires a basis set specification."
    
    return True, ""


def validate_dispersion_correction(method: str, dispersion: str) -> Tuple[bool, str, Optional[str]]:
    """
    Validate dispersion correction for the given method.
    
    Returns:
        Tuple of (is_valid, message, suggested_correction)
    """
    method_upper = normalize_method_name(method)
    dispersion_upper = dispersion.upper() if dispersion else ''
    
    # Methods that already include dispersion
    if method_upper in FUNCTIONALS_WITH_BUILTIN_DISPERSION:
        if dispersion_upper and dispersion_upper != 'NONE':
            return False, f"Method '{method}' already includes dispersion correction. Remove the dispersion keyword.", None
        return True, "", None
    
    # xTB and semiempirical methods don't use DFT-D corrections
    if method_upper in XTB_METHODS or method_upper in SEMIEMPIRICAL_METHODS:
        if dispersion_upper and dispersion_upper != 'NONE':
            return False, f"Method '{method}' does not use DFT-D dispersion corrections.", None
        return True, "", None
    
    # Composite methods include dispersion
    if method_upper in COMPOSITE_METHODS:
        if dispersion_upper and dispersion_upper != 'NONE':
            return False, f"Composite method '{method}' already includes dispersion correction.", None
        return True, "", None
    
    # Validate dispersion type
    valid_dispersion = {'', 'NONE', 'D3', 'D3BJ', 'D3ZERO', 'D4', 'NL', 'SCNL'}
    if dispersion_upper and dispersion_upper not in valid_dispersion:
        return False, f"Invalid dispersion correction '{dispersion}'. Valid options: D3BJ, D3ZERO, D4, NL", 'D3BJ'
    
    # D3 alone is ambiguous - suggest D3BJ
    if dispersion_upper == 'D3':
        return True, "Note: 'D3' defaults to D3BJ (Becke-Johnson damping).", None
    
    return True, "", None


def validate_rijcosx(method: str, use_rijcosx: bool) -> Tuple[bool, str]:
    """
    Validate RIJCOSX usage for the given method.
    
    RIJCOSX is beneficial for hybrid functionals and HF, but not for
    pure GGA, semiempirical, or xTB methods.
    """
    if not use_rijcosx:
        return True, ""
    
    method_upper = normalize_method_name(method)
    
    # RIJCOSX not applicable to these methods
    if method_upper in XTB_METHODS:
        return False, f"RIJCOSX is not applicable to xTB methods."
    
    if method_upper in SEMIEMPIRICAL_METHODS:
        return False, f"RIJCOSX is not applicable to semiempirical methods."
    
    if method_upper in COMPOSITE_METHODS:
        return False, f"RIJCOSX is not applicable to composite methods (they have optimized settings)."
    
    # RIJCOSX is beneficial for hybrids, less so for pure GGA
    if method_upper in PURE_GGA_FUNCTIONALS:
        return True, "Note: RIJCOSX provides limited benefit for pure GGA functionals. Consider using RI-J instead."
    
    return True, ""


def validate_frequency_calculation(method: str, job_type: str) -> Tuple[bool, str]:
    """
    Validate that frequency calculations are supported for the method.
    """
    method_upper = normalize_method_name(method)
    job_type_upper = job_type.upper() if job_type else ''
    
    if 'FREQ' not in job_type_upper:
        return True, ""
    
    # xTB only supports numerical frequencies
    if method_upper in XTB_METHODS:
        return True, "Note: xTB methods use numerical frequencies (NumFreq). This may be slower."
    
    # Some post-HF methods have limited frequency support
    if method_upper in {'MP3', 'MP4', 'CCSD', 'CCSD(T)', 'QCISD', 'QCISD(T)'}:
        return True, f"Warning: Analytical frequencies may not be available for {method}. Numerical frequencies will be used."
    
    # ZINDO/S is for excited states, not geometry/frequencies
    if method_upper in {'ZINDO/S', 'ZINDO_S'}:
        return False, "ZINDO/S is designed for excited state calculations, not geometry optimization or frequencies."
    
    return True, ""


def validate_job_parameters(params: Dict[str, Any]) -> Tuple[bool, List[str], List[str]]:
    """
    Comprehensive validation of job parameters.
    
    Returns:
        Tuple of (is_valid, errors, warnings)
    """
    errors = []
    warnings = []
    
    method = params.get('method', 'B3LYP')
    basis = params.get('basis_set') or params.get('basis', '')
    dispersion = params.get('dispersion', '')
    use_rijcosx = params.get('use_rijcosx', False)
    job_type = params.get('job_type', 'OPT')
    
    # Normalize method name
    normalized_method = normalize_method_name(method)
    if normalized_method != method.upper():
        warnings.append(f"Method name '{method}' normalized to '{normalized_method}'")
    
    # Validate method-basis combination
    valid, msg = validate_method_basis_combination(normalized_method, basis)
    if not valid:
        errors.append(msg)
    elif msg:
        warnings.append(msg)
    
    # Validate dispersion correction
    valid, msg, suggestion = validate_dispersion_correction(normalized_method, dispersion)
    if not valid:
        errors.append(msg)
    elif msg:
        warnings.append(msg)
    
    # Validate RIJCOSX
    valid, msg = validate_rijcosx(normalized_method, use_rijcosx)
    if not valid:
        errors.append(msg)
    elif msg:
        warnings.append(msg)
    
    # Validate frequency calculation
    valid, msg = validate_frequency_calculation(normalized_method, job_type)
    if not valid:
        errors.append(msg)
    elif msg:
        warnings.append(msg)
    
    # Double-hybrid warning
    if normalized_method in DOUBLE_HYBRID_FUNCTIONALS:
        warnings.append(f"Double-hybrid functional '{method}' requires significant computational resources.")

    # Coupled cluster validations
    if normalized_method in COUPLED_CLUSTER_METHODS:
        # RIJCOSX only applicable to the HF step in DLPNO; not for canonical CC
        if normalized_method in CANONICAL_CC_METHODS and use_rijcosx:
            errors.append(f"RIJCOSX is not applicable to canonical coupled cluster method '{method}'. Remove RIJCOSX.")

        # DLPNO-CC requires a /C auxiliary basis
        if normalized_method in DLPNO_CC_METHODS:
            has_aux_basis = False
            extra_kws = params.get('extra_keywords', '') or ''
            if '/C' in extra_kws or 'C' in extra_kws.split():
                has_aux_basis = True
            # Also check the auto-mapped aux basis
            if basis and basis in CC_AUX_BASIS_MAP:
                has_aux_basis = True  # Will be auto-added
            if not has_aux_basis and basis:
                warnings.append(
                    f"DLPNO method '{method}' requires a /C auxiliary basis for RI (e.g., '{basis}/C'). "
                    f"Add '{basis}/C' to extra keywords or it will be added automatically."
                )

        # CC calculations are single-point by nature (OPT is expensive but technically valid)
        if 'FREQ' in job_type.upper():
            warnings.append(
                f"Frequency calculations with coupled cluster methods are very expensive. "
                f"Consider using numerical frequencies (NumFreq) or a cheaper method for frequencies."
            )

        # Memory warning for canonical CC
        if normalized_method in CANONICAL_CC_METHODS:
            warnings.append(
                f"Canonical CCSD(T) scales as O(N^7) and is very memory/CPU intensive. "
                f"Consider DLPNO-CCSD(T) for larger systems (>10 heavy atoms)."
            )

    is_valid = len(errors) == 0
    return is_valid, errors, warnings


def get_method_category(method: str) -> str:
    """
    Get the category of a computational method.
    
    Returns one of: 'hybrid_dft', 'pure_gga', 'double_hybrid', 'wavefunction',
                    'semiempirical', 'xtb', 'composite', 'unknown'
    """
    method_upper = normalize_method_name(method)
    
    if method_upper in HYBRID_FUNCTIONALS:
        return 'hybrid_dft'
    if method_upper in PURE_GGA_FUNCTIONALS:
        return 'pure_gga'
    if method_upper in DOUBLE_HYBRID_FUNCTIONALS:
        return 'double_hybrid'
    if method_upper in WAVEFUNCTION_METHODS:
        return 'wavefunction'
    if method_upper in SEMIEMPIRICAL_METHODS:
        return 'semiempirical'
    if method_upper in XTB_METHODS:
        return 'xtb'
    if method_upper in COMPOSITE_METHODS:
        return 'composite'
    
    return 'unknown'


def get_recommended_settings(method: str) -> Dict[str, Any]:
    """
    Get recommended settings for a given method.
    
    Returns dictionary with recommended dispersion, RIJCOSX, grid, etc.
    """
    method_upper = normalize_method_name(method)
    category = get_method_category(method_upper)
    
    settings = {
        'use_rijcosx': False,
        'dispersion': 'none',
        'integration_grid': 'DefGrid2',
        'scf_convergence': 'Normal',
        'aux_basis': None,
    }
    
    if category == 'hybrid_dft':
        settings['use_rijcosx'] = True
        settings['aux_basis'] = 'def2/J'
        # Recommend dispersion for common functionals
        if method_upper in {'B3LYP', 'PBE0', 'TPSSH', 'M06', 'M062X'}:
            settings['dispersion'] = 'D3BJ'
    
    elif category == 'pure_gga':
        # RI-J is default for pure GGA
        settings['dispersion'] = 'D3BJ'
    
    elif category == 'double_hybrid':
        settings['use_rijcosx'] = True
        settings['aux_basis'] = 'def2/J def2-TZVPP/C'
        # Double-hybrids often have their own dispersion parameters
    
    elif category == 'wavefunction':
        if method_upper in {'MP2', 'RI-MP2', 'DLPNO-MP2'}:
            settings['aux_basis'] = 'def2-TZVPP/C'
        elif method_upper in DLPNO_CC_METHODS:
            settings['aux_basis'] = 'cc-pVTZ/C'
            settings['scf_convergence'] = 'Tight'
            settings['use_rijcosx'] = True  # RIJCOSX valid for HF step in DLPNO
        elif method_upper in CANONICAL_CC_METHODS:
            settings['scf_convergence'] = 'Tight'
            settings['use_rijcosx'] = False  # Not applicable to canonical CC
        elif 'DLPNO' in method_upper or 'CCSD' in method_upper:
            settings['aux_basis'] = 'def2-TZVPP/C'
            settings['scf_convergence'] = 'Tight'
    
    elif category in {'semiempirical', 'xtb', 'composite'}:
        # These methods have their own optimized settings
        pass
    
    return settings


# =============================================================================
# VALID METHOD LISTS FOR FRONTEND
# =============================================================================

def get_valid_methods_list() -> Dict[str, List[str]]:
    """
    Get categorized list of valid methods for frontend display.
    """
    return {
        'Hybrid GGA Functionals': [
            'B3LYP', 'PBE0', 'B3PW91', 'B3P86', 'X3LYP', 'O3LYP',
            'B97', 'BHANDHLYP', 'B1LYP', 'B1P',
        ],
        'Pure GGA Functionals': [
            'PBE', 'BLYP', 'BP86', 'PW91', 'RPBE', 'revPBE', 'OPBE', 'OLYP',
        ],
        'Meta-GGA Functionals': [
            'TPSS', 'M06L', 'SCAN', 'r2SCAN', 'revTPSS',
        ],
        'Hybrid Meta-GGA Functionals': [
            'TPSSh', 'TPSS0', 'M06', 'M062X', 'PW6B95',
            'r2SCANh', 'r2SCAN0', 'r2SCAN50',
        ],
        'Range-Separated Hybrids': [
            'wB97', 'wB97X', 'wB97X-D3', 'wB97X-V', 'wB97X-D4',
            'wB97M-V', 'wB97M-D3BJ', 'wB97M-D4',
            'CAM-B3LYP', 'LC-BLYP', 'LC-PBE',
        ],
        'Double-Hybrid Functionals': [
            'B2PLYP', 'B2GP-PLYP', 'DSD-PBEP86', 'PWPB95',
        ],
        'Wavefunction Methods': [
            'HF', 'MP2', 'RI-MP2', 'DLPNO-MP2',
        ],
        'Coupled Cluster Methods': [
            'CCSD', 'CCSD(T)',
            'CCSD-F12', 'CCSD(T)-F12',
            'DLPNO-CCSD', 'DLPNO-CCSD(T)', 'DLPNO-CCSD(T1)',
            'QCISD', 'QCISD(T)',
        ],
        'Semiempirical Methods': [
            'PM3', 'AM1', 'MNDO',
            'ZINDO/1', 'ZINDO/S',
        ],
        'xTB Methods': [
            'GFN2-xTB', 'GFN-xTB', 'GFN0-xTB', 'GFN-FF',
            'Native-GFN2-xTB', 'Native-GFN-xTB',
        ],
        'Composite Methods': [
            'r2SCAN-3c', 'B97-3c', 'PBEh-3c', 'HF-3c', 'wB97X-3c',
        ],
    }
