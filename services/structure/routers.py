"""FastAPI routers for Structure Service."""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import FileResponse, StreamingResponse
from typing import Optional, Dict, Any, List
import os
import logging
import traceback
import subprocess
import shutil
import tempfile
import re
from io import StringIO
from rdkit import Chem

# Conditional Bio import
try:
    from Bio.PDB import PDBParser, PDBIO, Select
    BIO_AVAILABLE = True
except ImportError:
    BIO_AVAILABLE = False
    PDBParser = None
    PDBIO = None
    Select = None
from rdkit.Chem import AllChem, Draw
import base64
from io import BytesIO

from services.structure.service import StructureService
from services.structure.models import (
    SMILESRequest, SMILES3DResponse, SMILESMolResponse,
    UploadSMILESRequest, FetchPDBRequest, ProcessPDBRequest,
    DownloadSDFRequest, MoleculeModel, SaveMoleculeRequest,
    SaveStructureRequest, ExtractLigandRequest,
    GetLigandStructureRequest, SaveEditedMoleculeRequest,
    CombineProteinLigandRequest, CleanProteinStagedRequest,
    CleanProteinStagedResponse, FetchHETIDRequest, ExtractLigandByHETIDRequest
)
from services.structure.processor import StructureProcessor, sanitize_pdb_for_rdkit
from services.structure.pdb_service import PDBService
from lib.structure.validator import validate_structure_for_service, detect_structure_type, get_service_requirements
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["Structure"])
structure_router = APIRouter(prefix="/api/structure", tags=["Structure"])

# Initialize service
structure_service = StructureService()
structure_processor = StructureProcessor()
pdb_service = PDBService()


def _get_compatible_services(structure_type: str) -> list:
    """Get list of services compatible with the given structure type."""
    compatible = []
    if structure_type == 'small_molecule':
        compatible = ['qc', 'admet']
    elif structure_type in ['protein', 'complex']:
        compatible = ['docking', 'md', 'boltz2', 'boltz', 'protein_cleaning']
    return compatible


@structure_router.post("/smiles_to_3d", response_model=SMILES3DResponse)
async def smiles_to_3d(request: SMILESRequest):
    """Convert SMILES to 3D structure."""
    try:
        result = structure_service.smiles_to_3d(request.smiles)
        return SMILES3DResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@structure_router.post("/smiles_to_mol", response_model=SMILESMolResponse)
async def smiles_to_mol(request: SMILESRequest):
    """Convert SMILES to Molfile."""
    try:
        result = structure_service.smiles_to_mol(request.smiles)
        return SMILESMolResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@structure_router.post("/upload_smiles")
async def upload_smiles(request: UploadSMILESRequest):
    """Upload and process SMILES string."""
    try:
        result = structure_service.upload_smiles(request.smiles, request.name)
        
        # SMILES are always small molecules
        result['structure_type'] = 'small_molecule'
        result['compatible_services'] = _get_compatible_services('small_molecule')
        
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@structure_router.post("/fetch_pdb")
async def fetch_pdb(request: FetchPDBRequest):
    """Fetch structure from PDB."""
    try:
        result = structure_service.fetch_pdb(request.pdb_id)
        result['compatible_services'] = _get_compatible_services(result.get('structure_type', 'protein'))
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@structure_router.post("/fetch_hetid")
async def fetch_hetid(request: FetchHETIDRequest):
    """Fetch structure from PDB database containing a specific HET ID."""
    try:
        result = structure_service.fetch_hetid(request.het_id)
        result['compatible_services'] = _get_compatible_services(result.get('structure_type', 'protein'))
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@structure_router.post("/upload_structure")
async def upload_structure(
    file: UploadFile = File(...),
    format: Optional[str] = Form(None)
):
    """Upload structure file."""
    try:
        content = await file.read()
        file_content = content.decode('utf-8')
        
        result = structure_service.upload_structure_file(file_content, file.filename)
        result['compatible_services'] = _get_compatible_services(result.get('structure_type', 'unknown'))
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@structure_router.post("/process_pdb")
async def process_pdb(request: ProcessPDBRequest):
    """Process PDB structure with ligand extraction."""
    try:
        result = structure_service.process_pdb_with_ligands(
            pdb_id=request.pdb_id,
            pdb_data=request.pdb_data,
            structure_id=request.structure_id,
            clean_protein=request.clean_protein,
            include_2d_images=request.include_2d_images
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@structure_router.post("/download_sdf")
async def download_sdf(request: DownloadSDFRequest):
    """Convert PDB to SDF."""
    try:
        result = structure_service.download_sdf(
            request.pdb_data,
            generate_conformers=request.generate_conformers,
            num_conformers=request.num_conformers
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@structure_router.post("/combine_protein_ligand")
async def combine_protein_ligand(request: CombineProteinLigandRequest):
    """Combine protein and ligand into a single PDB."""
    try:
        result = structure_service.combine_protein_ligand(request.protein_pdb, request.ligand_pdb)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@structure_router.post("/clean_protein_staged", response_model=CleanProteinStagedResponse)
async def clean_protein_staged(request: CleanProteinStagedRequest):
    """Clean protein with staged options."""
    try:
        result = structure_service.clean_protein_staged(
            pdb_data=request.pdb_data,
            remove_heterogens=request.remove_heterogens,
            remove_water=request.remove_water,
            add_missing_residues=request.add_missing_residues,
            add_missing_atoms=request.add_missing_atoms,
            add_missing_hydrogens=request.add_missing_hydrogens,
            ph=request.ph,
            add_solvation=request.add_solvation,
            solvation_box_size=request.solvation_box_size,
            solvation_box_shape=request.solvation_box_shape,
            keep_ligands=request.keep_ligands
        )
        return CleanProteinStagedResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@structure_router.post("/extract_ligand_by_hetid")
async def extract_ligand_by_hetid(request: ExtractLigandByHETIDRequest):
    """Extract a specific ligand by HET ID from protein structure."""
    try:
        result = structure_service.extract_ligand_by_hetid(
            pdb_data=request.pdb_data,
            het_id=request.het_id,
            ligand_name=request.ligand_name
        )
        result['compatible_services'] = _get_compatible_services('small_molecule')
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


class ExtractHETATMRequest(BaseModel):
    pdb_data: str


@structure_router.post("/extract_hetatm")
async def extract_hetatm(request: ExtractHETATMRequest):
    """Extract HETATM ligand residues from a PDB structure.

    Returns unique non-water HETATM residues with their PDB coordinate blocks.
    Used by the RBFE reference pose setup to offer co-crystal ligand choices.
    """
    WATER_RESIDUES = {'HOH', 'WAT', 'DOD', 'TIP', 'TP3', 'SOL'}
    pdb_data = request.pdb_data
    if not pdb_data:
        raise HTTPException(status_code=400, detail="PDB data is required")

    # Group HETATM lines by (residue_name, chain_id)
    residue_lines: dict[tuple[str, str], list[str]] = {}
    for line in pdb_data.split('\n'):
        if line.startswith('HETATM'):
            res_name = line[17:20].strip()
            chain_id = line[21:22].strip() or 'A'
            if res_name in WATER_RESIDUES:
                continue
            key = (res_name, chain_id)
            residue_lines.setdefault(key, []).append(line)

    residues = []
    for (res_name, chain_id), lines in residue_lines.items():
        pdb_string = '\n'.join(lines) + '\nEND\n'
        residues.append({
            'residue_name': res_name,
            'chain_id': chain_id,
            'pdb_string': pdb_string,
        })

    return {'residues': residues}


class ValidateStructureRequest(BaseModel):
    service_name: str
    structure_data: str
    format: Optional[str] = None


@structure_router.post("/validate_structure")
async def validate_structure(request: ValidateStructureRequest):
    """Validate that a structure is compatible with a specific service."""
    try:
        validation_result = validate_structure_for_service(
            request.service_name,
            request.structure_data,
            format=request.format
        )
        
        return {
            'valid': validation_result['valid'],
            'structure_type': validation_result.get('structure_type'),
            'detected_format': validation_result.get('detected_format'),
            'errors': validation_result.get('errors', []),
            'warnings': validation_result.get('warnings', []),
            'service_requirements': get_service_requirements(request.service_name)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Validation error: {str(e)}")


# Molecule Library Routes

@router.get("/api/molecules")
async def get_molecules():
    """Get all molecules from library."""
    return structure_service.get_molecules()


@router.get("/api/molecules/{molecule_id}")
async def get_molecule(molecule_id: int):
    """Get molecule by ID."""
    molecule = structure_service.get_molecule(molecule_id)
    if not molecule:
        raise HTTPException(status_code=404, detail="Molecule not found")
    return molecule


@router.post("/api/molecules")
async def save_molecule(request: SaveMoleculeRequest):
    """Save molecule to library."""
    try:
        result = structure_service._save_molecule_to_library(
            name=request.name,
            smiles=request.smiles,
            molfile=request.molfile,
            source=request.source,
            canonical_smiles=request.canonical_smiles
        )
        
        if result.get('error'):
            status_code = result.get('error_code', 400)
            raise HTTPException(status_code=status_code, detail=result['error'])
            
        if result.get('already_exists'):
            return {
                'success': True,
                'message': 'Molecule already exists',
                'molecule': structure_service.get_molecule(result['molecule_id']),
                'already_exists': True
            }
            
        return {
            'success': True,
            'message': 'Molecule saved',
            'molecule': structure_service.get_molecule(result['molecule_id'])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/library/save-molecule")
async def save_molecule_to_library(request: SaveMoleculeRequest):
    """Save molecule to library (alternative endpoint for /api/library/save-molecule)."""
    try:
        result = structure_service._save_molecule_to_library(
            name=request.name,
            smiles=request.smiles,
            molfile=request.molfile,
            source=request.source,
            canonical_smiles=request.canonical_smiles
        )
        
        if result.get('error'):
            status_code = result.get('error_code', 400)
            raise HTTPException(status_code=status_code, detail=result['error'])
            
        if result.get('already_exists'):
            saved_molecule = structure_service.get_molecule(result['molecule_id'])
            # Add inchi if provided
            if saved_molecule and request.inchi:
                structure_service.molecules[result['molecule_id']]['inchi'] = request.inchi
                saved_molecule['inchi'] = request.inchi
            return {
                'success': True,
                'message': 'Molecule already exists',
                'molecule': saved_molecule,
                'already_exists': True
            }
        
        # Get the saved molecule and include inchi if provided
        saved_molecule = structure_service.get_molecule(result['molecule_id'])
        if not saved_molecule:
            raise HTTPException(status_code=500, detail="Failed to retrieve saved molecule")
        
        # Store inchi if provided
        if request.inchi:
            structure_service.molecules[result['molecule_id']]['inchi'] = request.inchi
            saved_molecule['inchi'] = request.inchi
            
        return {
            'success': True,
            'message': 'Molecule saved',
            'molecule': saved_molecule
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/molecules/{molecule_id}")
async def delete_molecule(molecule_id: int):
    """Delete molecule."""
    try:
        structure_service.delete_molecule(molecule_id)
        return {'success': True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/api/molecules/{molecule_id}")
async def update_molecule(molecule_id: int, request: dict):
    """Update molecule."""
    try:
        molecule = structure_service.update_molecule(
            molecule_id,
            name=request.get('name'),
            molfile=request.get('molfile')
        )
        return molecule
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/api/molecules/save_structure")
async def save_structure_to_library(request: SaveStructureRequest):
    """Save structure (PDB) to library as molecule."""
    try:
        # Convert PDB to molecule using RDKit
        mol = Chem.MolFromPDBBlock(request.pdb_data)
        if mol is None:
            raise HTTPException(status_code=400, detail="Could not parse PDB data")
        
        molfile = Chem.MolToMolBlock(mol)
        smiles = Chem.MolToSmiles(mol)
        
        result = structure_service._save_molecule_to_library(
            name=request.name,
            smiles=smiles,
            molfile=molfile,
            source="structure_save"
        )
        
        if result.get('error'):
            raise HTTPException(status_code=400, detail=result['error'])
            
        return {
            'success': True,
            'message': 'Structure saved to library',
            'molecule': structure_service.get_molecule(result['molecule_id'])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@structure_router.post("/save_edited_molecule")
async def save_edited_molecule(request: SaveEditedMoleculeRequest):
    """Save edited molecule and generate visualization."""
    try:
        mol = Chem.MolFromMolBlock(request.molfile)
        if mol is None:
            raise HTTPException(status_code=400, detail="Invalid molecule structure")
        
        from rdkit.Chem import Descriptors
        molecular_weight = Descriptors.MolWt(mol)
        logp = Descriptors.MolLogP(mol)
        
        # Calculate canonical SMILES for consistency
        canonical_smiles = Chem.MolToSmiles(mol, canonical=True)
        smiles = canonical_smiles # Use canonical version
        
        # Check for duplicate molecules by canonical SMILES
        for m in structure_service.molecules.values():
            if m.get('canonical_smiles') == canonical_smiles:
                # Return existing molecule but with a message
                # We still need to generate ligand_entry for the editor
                pass # Continue to generate ligand_entry below but don't add to self.molecules
                
                # Wait, if it exists, we skip the adding part
                existing_m = m
                break
        else:
            existing_m = None

        # Check for duplicate names
        name = request.name.strip()
        for m in structure_service.molecules.values():
            if str(m.get('name', '')).strip().lower() == name.lower():
                # If it's the SAME molecule, it's fine
                if existing_m and m['id'] == existing_m['id']:
                    continue
                raise HTTPException(status_code=409, detail=f"A molecule named '{name}' already exists")
        
        if not existing_m:
            structure_service.molecule_counter += 1
            new_molecule = {
                'id': structure_service.molecule_counter,
                'name': name,
                'molfile': request.molfile,
                'smiles': smiles,
                'canonical_smiles': canonical_smiles,
                'molecular_weight': molecular_weight,
                'logp': logp,
                'original_ligand_id': request.original_ligand_id,
                'structure_id': request.structure_id,
                'created_from_editor': True
            }
            structure_service.molecules[structure_service.molecule_counter] = new_molecule
            saved_molecule = new_molecule
        else:
            saved_molecule = existing_m
        
        # Generate 3D coordinates
        mol_with_h = Chem.AddHs(mol)
        try:
            AllChem.EmbedMolecule(mol_with_h, randomSeed=42)
            AllChem.MMFFOptimizeMolecule(mol_with_h)
        except Exception as e:
            logger.debug("EmbedMolecule/MMFFOptimizeMolecule failed: %s", e)
        pdb_data = Chem.MolToPDBBlock(mol_with_h)
        
        # Generate 2D image
        image_data = None
        try:
            mol_2d = Chem.RemoveHs(mol)
            AllChem.Compute2DCoords(mol_2d)
            img = Draw.MolToImage(mol_2d, size=(200, 200))
            buffered = BytesIO()
            img.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode()
            image_data = f"data:image/png;base64,{img_str}"
        except Exception as e:
            logger.debug("2D coordinate/image generation failed: %s", e)
        
        chain_id = 'A'
        residue_number = 1
        if request.original_ligand_id:
            parts = request.original_ligand_id.split('_')
            if len(parts) >= 3:
                chain_id = parts[-2]
                try:
                    residue_number = int(parts[-1])
                except ValueError as e:
                    logger.debug("Residue number parsing failed: %s", e)
                    residue_number = 1
        
        new_ligand_id = f"{name.upper()}_{chain_id}_{residue_number}"
        ligand_entry = {
            'name': name.upper(),
            'chain': chain_id,
            'residue_number': residue_number,
            'pdb_data': pdb_data,
            'resname': name.upper()[:3] if len(name) >= 3 else name.upper(),
            'image_data': image_data,
            'is_edited': True,
            'original_ligand_id': request.original_ligand_id
        }
        
        return {
            'message': 'Molecule saved successfully' if not existing_m else 'Molecule already exists in library',
            'molecule': saved_molecule,
            'ligand_id': new_ligand_id,
            'ligand_data': ligand_entry,
            'already_exists': existing_m is not None
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@structure_router.get("/get_ligands")
async def get_ligands():
    """Get all ligands."""
    try:
        ligands = []
        for mol in structure_service.molecules.values():
            if mol.get('created_from_editor'):
                ligands.append({
                    'id': mol['id'],
                    'name': mol['name'],
                    'ligand_id': f"{mol['name'].upper()}_A_1"
                })
        return ligands
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TautomerRequest(BaseModel):
    smiles: str
    max_tautomers: int = 20


@structure_router.post("/enumerate-tautomers")
async def enumerate_tautomers(request: TautomerRequest):
    """Enumerate tautomers for a given SMILES string."""
    from rdkit.Chem.MolStandardize import rdMolStandardize
    mol = Chem.MolFromSmiles(request.smiles)
    if mol is None:
        raise HTTPException(status_code=400, detail="Invalid SMILES")

    enumerator = rdMolStandardize.TautomerEnumerator()
    enumerator.SetMaxTautomers(request.max_tautomers)
    canon = enumerator.Canonicalize(mol)
    canonical_smiles = Chem.MolToSmiles(canon, canonical=True)

    results = []
    for t in enumerator.Enumerate(mol):
        t_smiles = Chem.MolToSmiles(t, canonical=True)
        results.append({
            "smiles": t_smiles,
            "score": round(enumerator.ScoreTautomer(t), 4),
            "is_canonical": t_smiles == canonical_smiles
        })
    results.sort(key=lambda x: (-int(x["is_canonical"]), -x["score"]))
    return {"canonical_smiles": canonical_smiles, "tautomers": results, "count": len(results)}


class FindPocketsRequest(BaseModel):
    pdb_data: str
    top_n: int = 5


def _parse_fpocket_output(out_dir: str, top_n: int) -> list:
    """Parse fpocket output directory and return pocket data."""
    pockets = []
    info_file = os.path.join(out_dir, os.path.basename(out_dir).replace('_out', '_info.txt'))
    # fpocket names the info file after the input pdb
    # Try common naming patterns
    for fname in os.listdir(out_dir) if os.path.exists(out_dir) else []:
        if fname.endswith('_info.txt'):
            info_file = os.path.join(out_dir, fname)
            break

    pocket_scores: dict = {}
    if os.path.exists(info_file):
        with open(info_file) as f:
            content = f.read()
        pocket_blocks = re.split(r'Pocket\s+(\d+)\s*:', content)
        for i in range(1, len(pocket_blocks), 2):
            pocket_num = int(pocket_blocks[i])
            block = pocket_blocks[i + 1]
            score_match = re.search(r'Score\s*:\s*([\d.]+)', block)
            drug_match = re.search(r'Druggability Score\s*:\s*([\d.]+)', block)
            vol_match = re.search(r'Volume\s*:\s*([\d.]+)', block)
            pocket_scores[pocket_num] = {
                'score': float(score_match.group(1)) if score_match else 0.0,
                'druggability': float(drug_match.group(1)) if drug_match else 0.0,
                'volume': float(vol_match.group(1)) if vol_match else 0.0,
            }

    pockets_dir = os.path.join(out_dir, 'pockets')
    if not os.path.exists(pockets_dir):
        return []

    for pocket_file in sorted(os.listdir(pockets_dir)):
        if not pocket_file.endswith('_atm.pdb'):
            continue
        num_match = re.search(r'pocket(\d+)_atm\.pdb', pocket_file)
        if not num_match:
            continue
        pocket_num = int(num_match.group(1))
        pdb_path = os.path.join(pockets_dir, pocket_file)

        xs, ys, zs = [], [], []
        residues = set()
        with open(pdb_path) as f:
            for line in f:
                if line.startswith(('ATOM', 'HETATM')):
                    try:
                        xs.append(float(line[30:38]))
                        ys.append(float(line[38:46]))
                        zs.append(float(line[46:54]))
                        resname = line[17:20].strip()
                        chain = line[21].strip()
                        resnum = line[22:26].strip()
                        residues.add(f"{resname}_{chain}_{resnum}")
                    except (ValueError, IndexError):
                        pass

        if not xs:
            continue

        cx = sum(xs) / len(xs)
        cy = sum(ys) / len(ys)
        cz = sum(zs) / len(zs)
        scores = pocket_scores.get(pocket_num, {'score': 0.0, 'druggability': 0.0, 'volume': 100.0})
        volume = scores['volume'] if scores['volume'] > 0 else 100.0
        size = max(10.0, volume ** (1 / 3) * 1.5)

        pockets.append({
            'pocket_id': pocket_num,
            'center': {'x': round(cx, 3), 'y': round(cy, 3), 'z': round(cz, 3)},
            'size': round(size, 1),
            'score': scores['score'],
            'druggability': scores['druggability'],
            'volume': scores['volume'],
            'residues': sorted(residues),
        })

    pockets.sort(key=lambda p: -p['score'])
    return pockets[:top_n]


@structure_router.post("/find-pockets")
async def find_pockets(request: FindPocketsRequest):
    """Detect binding pockets using fpocket."""
    work_dir = tempfile.mkdtemp()
    try:
        pdb_path = os.path.join(work_dir, "protein.pdb")
        with open(pdb_path, 'w') as f:
            f.write(request.pdb_data)

        result = subprocess.run(
            ['fpocket', '-f', pdb_path],
            capture_output=True, text=True, timeout=60, cwd=work_dir
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"fpocket failed: {result.stderr[:500]}")

        out_dir = os.path.join(work_dir, "protein_out")
        pockets = _parse_fpocket_output(out_dir, request.top_n)
        return {"pockets": pockets, "count": len(pockets)}
    except HTTPException:
        raise
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="fpocket binary not found. Pocket detection is not available.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pocket detection failed: {str(e)}")
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@structure_router.get("/render_smiles")
async def render_smiles(smiles: str, width: int = 300, height: int = 300):
    """Render 2D image from SMILES."""
    try:
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            # Return empty/error image or raise error
            raise HTTPException(status_code=400, detail="Invalid SMILES")
        
        # Compute 2D coords
        try:
            AllChem.Compute2DCoords(mol)
        except Exception as e:
            logger.debug("Compute2DCoords failed: %s", e)
        
        img = Draw.MolToImage(mol, size=(width, height))
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        buffered.seek(0)
        
        return StreamingResponse(buffered, media_type="image/png")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
