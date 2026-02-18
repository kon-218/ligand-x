"""ABFE stage: Run absolute binding free energy calculation."""

import httpx
from typing import Dict, Any, List
import logging

from ..config import BenchmarkConfig
from ..utils.job_monitoring import wait_for_jobs
from ..utils.metrics import calculate_abfe_metrics

logger = logging.getLogger(__name__)


async def run_abfe_stage(
    config: BenchmarkConfig,
    api_base_url: str,
    best_ligand: str = None,
    docking_results: List[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Run ABFE validation stage on best-ranked ligand.

    Steps:
    1. Identify best ligand (from RBFE or experimental data)
    2. Prepare ligand structure
    3. Submit ABFE calculation
    4. Wait for completion
    5. Extract ΔG
    6. Calculate error vs experimental

    Args:
        config: Benchmark configuration
        api_base_url: Base URL for Ligand-X API
        best_ligand: Optional ligand name to run ABFE on
        docking_results: Optional docking results with ligand poses

    Returns:
        Dictionary with ABFE result and metrics
    """
    logger.info("=== Starting ABFE Stage ===")

    ligands = config.get_ligands()
    abfe_settings = config.get_abfe_settings()

    # Step 1: Identify best ligand
    if not best_ligand:
        # Find ligand with best (most negative) experimental ΔG
        best_ligand = min(
            ligands,
            key=lambda x: x.get("experimental_dG_kcal_mol", 0)
        )["name"]

    logger.info(f"Running ABFE on best ligand: {best_ligand}")

    # Find ligand data
    ligand_data = None
    for ligand in ligands:
        if ligand["name"] == best_ligand:
            ligand_data = ligand
            break

    if not ligand_data:
        logger.error(f"Ligand {best_ligand} not found in benchmark data")
        return {"result": {}, "metrics": {}}

    # Step 2: Prepare ligand structure
    ligand_smiles = ligand_data["smiles"]
    
    # Step 3: Get protein PDB data
    structures = config.get_structures()
    protein_pdb_id = structures[0]["pdb_id"]
    
    async with httpx.AsyncClient(timeout=300.0) as client:
        # Fetch protein structure
        try:
            response = await client.post(
                f"{api_base_url}/fetch_pdb",
                json={"pdb_id": protein_pdb_id}
            )
            response.raise_for_status()
            structure_data = response.json()
            protein_pdb_data = structure_data.get("pdb_data", "")
            
            if not protein_pdb_data:
                logger.error("Failed to fetch protein PDB data")
                return {"result": {}, "metrics": {}}
                
        except Exception as e:
            logger.error(f"Failed to fetch protein: {e}")
            return {"result": {}, "metrics": {}}
        
        # Convert SMILES to SDF using RDKit
        try:
            from rdkit import Chem
            from rdkit.Chem import AllChem
            
            mol = Chem.MolFromSmiles(ligand_smiles)
            if mol is None:
                logger.error(f"Failed to parse SMILES: {ligand_smiles}")
                return {"result": {}, "metrics": {}}
            
            mol = Chem.AddHs(mol)
            AllChem.EmbedMolecule(mol, randomSeed=42)
            AllChem.MMFFOptimizeMolecule(mol)
            
            ligand_sdf_data = Chem.MolToMolBlock(mol)
            logger.info(f"Converted SMILES to SDF for {best_ligand}")
            
        except ImportError:
            logger.error("RDKit not available for SMILES to SDF conversion")
            return {"result": {}, "metrics": {}}
        except Exception as e:
            logger.error(f"Failed to convert SMILES to SDF: {e}")
            return {"result": {}, "metrics": {}}

        # Step 4: Submit ABFE calculation
        logger.info(f"Submitting ABFE calculation for {best_ligand}")
        
        abfe_payload = {
            "protein_pdb_data": protein_pdb_data,
            "ligand_sdf_data": ligand_sdf_data,
            "ligand_id": best_ligand,
            "protein_id": protein_pdb_id,
            "simulation_settings": {
                "equilibration_ns": abfe_settings["equilibration_ns"],
                "production_ns": abfe_settings["production_ns"],
                "lambda_windows": abfe_settings["lambda_windows"],
                "temperature_K": abfe_settings["temperature_K"],
                "pressure_bar": abfe_settings["pressure_bar"]
            }
        }

        try:
            response = await client.post(
                f"{api_base_url}/api/abfe/submit_async",
                json=abfe_payload,
                timeout=60.0
            )
            response.raise_for_status()
            job_data = response.json()

            job_id = job_data["job_id"]
            logger.info(f"ABFE job submitted: {job_id}")

        except Exception as e:
            logger.error(f"Failed to submit ABFE job: {e}")
            return {"result": {}, "metrics": {}}

    # Step 4: Wait for job to complete
    logger.info(f"Waiting for ABFE job to complete")

    completed_jobs = await wait_for_jobs(
        [job_id],
        api_base_url,
        check_interval=30,
        timeout=86400,  # 24 hours
        job_names={job_id: f"ABFE_{best_ligand}"},
        job_type="abfe"
    )

    job_status = completed_jobs.get(job_id)

    if not job_status:
        logger.error("ABFE job did not complete")
        return {"result": {}, "metrics": {}}

    # Step 5: Extract ΔG
    result = job_status.get("result", {})
    predicted_dg = result.get("binding_dG_kcal_mol", 0.0)
    uncertainty = result.get("uncertainty_kcal_mol", 0.0)

    abfe_result = {
        "job_id": job_id,
        "ligand": best_ligand,
        "predicted_dG": predicted_dg,
        "uncertainty": uncertainty
    }

    logger.info(f"ABFE result: ΔG={predicted_dg:.2f}±{uncertainty:.2f} kcal/mol")

    # Step 6: Calculate metrics
    metrics = calculate_abfe_metrics(abfe_result, ligands)

    logger.info("=== ABFE Stage Complete ===")
    logger.info(f"Predicted: {predicted_dg:.2f} kcal/mol, "
               f"Experimental: {metrics.get('experimental_dG', 0):.2f} kcal/mol, "
               f"Error: {metrics.get('error', 0):.2f} kcal/mol")

    return {
        "result": abfe_result,
        "metrics": metrics,
        "job_id": job_id
    }
