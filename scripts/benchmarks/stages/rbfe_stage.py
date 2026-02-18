"""RBFE stage: Run relative binding free energy calculations."""

import httpx
from typing import Dict, Any, List
import logging

from ..config import BenchmarkConfig
from ..utils.job_monitoring import wait_for_jobs
from ..utils.metrics import calculate_rbfe_metrics

logger = logging.getLogger(__name__)


async def run_rbfe_stage(
    config: BenchmarkConfig,
    api_base_url: str,
    docking_results: List[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Run RBFE validation stage.

    Steps:
    1. Prepare ligand structures (from docking or SMILES)
    2. Submit RBFE network planning
    3. Submit transformation jobs
    4. Wait for completion
    5. Extract ΔΔG values
    6. Calculate correlation metrics

    Args:
        config: Benchmark configuration
        api_base_url: Base URL for Ligand-X API
        docking_results: Optional docking results with ligand poses

    Returns:
        Dictionary with RBFE results and metrics
    """
    logger.info("=== Starting RBFE Stage ===")

    ligands = config.get_ligands()
    rbfe_settings = config.get_rbfe_settings()
    reference_ligand = config.get_reference_ligand()

    logger.info(f"Reference ligand: {reference_ligand['name']}")
    logger.info(f"RBFE settings: mapper={rbfe_settings['atom_mapper']}, "
               f"production_ns={rbfe_settings['simulation_settings']['production_ns']}")

    # Step 1: Prepare ligand list for RBFE
    # Convert SMILES to SDF format (RBFE service requires 3D structure data)
    ligand_structures = []
    
    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem
    except ImportError:
        logger.error("RDKit not available for SMILES to SDF conversion")
        return {"network": {}, "transformations": [], "metrics": {}}

    for ligand in ligands:
        ligand_name = ligand["name"]
        smiles = ligand["smiles"]
        
        try:
            mol = Chem.MolFromSmiles(smiles)
            if mol is None:
                logger.warning(f"Failed to parse SMILES for {ligand_name}: {smiles}")
                continue
            
            mol = Chem.AddHs(mol)
            AllChem.EmbedMolecule(mol, randomSeed=42)
            AllChem.MMFFOptimizeMolecule(mol)
            
            sdf_data = Chem.MolToMolBlock(mol)
            
            ligand_data = {
                "id": ligand_name,
                "data": sdf_data,
                "format": "sdf",
                "has_docked_pose": False
            }
            ligand_structures.append(ligand_data)
            logger.info(f"  Prepared ligand: {ligand_name}")
            
        except Exception as e:
            logger.warning(f"Failed to prepare ligand {ligand_name}: {e}")
            continue
    
    if len(ligand_structures) < 2:
        logger.error(f"Need at least 2 ligands, only {len(ligand_structures)} prepared")
        return {"network": {}, "transformations": [], "metrics": {}}

    # Step 2: Get protein PDB data
    # Fetch protein from first structure
    structures = config.get_structures()
    protein_pdb_id = structures[0]["pdb_id"]
    
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            # Fetch protein structure
            response = await client.post(
                f"{api_base_url}/fetch_pdb",
                json={"pdb_id": protein_pdb_id}
            )
            response.raise_for_status()
            structure_data = response.json()
            protein_pdb_data = structure_data.get("pdb_data", "")
            
            if not protein_pdb_data:
                logger.error("Failed to fetch protein PDB data")
                return {"network": {}, "transformations": [], "metrics": {}}
                
        except Exception as e:
            logger.error(f"Failed to fetch protein: {e}")
            return {"network": {}, "transformations": [], "metrics": {}}

        # Step 3: Submit RBFE calculation using submit_async endpoint
        logger.info(f"Submitting RBFE calculation with {len(ligand_structures)} ligands")
        
        rbfe_payload = {
            "protein_pdb_data": protein_pdb_data,
            "ligands": ligand_structures,
            "protein_id": protein_pdb_id,
            "network_topology": rbfe_settings.get("network_topology", "mst"),
            "central_ligand": reference_ligand["name"],
            "atom_mapper": rbfe_settings.get("atom_mapper", "kartograf"),
            "atom_map_hydrogens": True,
            "simulation_settings": rbfe_settings.get("simulation_settings", {})
        }

        try:
            logger.info("Submitting RBFE job to async queue")
            response = await client.post(
                f"{api_base_url}/api/rbfe/submit_async",
                json=rbfe_payload,
                timeout=60.0
            )
            response.raise_for_status()
            job_data = response.json()
            
            job_id = job_data["job_id"]
            logger.info(f"RBFE job submitted: {job_id}")
            
            transformation_jobs = [{
                "job_id": job_id,
                "ligand_a": reference_ligand["name"],
                "ligand_b": "network",
                "quality_score": 1.0
            }]

        except Exception as e:
            logger.error(f"Failed to submit RBFE job: {e}")
            return {"network": {}, "transformations": [], "metrics": {}}

    # Step 4: Wait for jobs to complete
    if not transformation_jobs:
        logger.warning("No RBFE jobs were submitted")
        return {"network": {}, "transformations": [], "metrics": {}}

    logger.info(f"Waiting for {len(transformation_jobs)} RBFE jobs to complete")

    job_ids = [job["job_id"] for job in transformation_jobs]
    job_names = {job["job_id"]: f"{job['ligand_a']}->{job['ligand_b']}"
                for job in transformation_jobs}

    completed_jobs = await wait_for_jobs(
        job_ids,
        api_base_url,
        check_interval=30,
        timeout=86400,  # 24 hours for RBFE
        job_names=job_names,
        job_type="rbfe"
    )

    # Step 5: Extract ΔΔG values
    logger.info("Processing RBFE results")

    transformations = []

    for job in transformation_jobs:
        job_id = job["job_id"]
        job_status = completed_jobs.get(job_id)

        if not job_status:
            logger.warning(f"No status for job {job_id}")
            continue

        result = job_status.get("result", {})
        ddg = result.get("ddG_kcal_mol", 0.0)
        uncertainty = result.get("uncertainty_kcal_mol", 0.0)

        # Find experimental ΔΔG for ligand_b
        ligand_b = job["ligand_b"]
        experimental_ddg = None

        for ligand in ligands:
            if ligand["name"] == ligand_b:
                experimental_ddg = ligand.get("experimental_ddG_kcal_mol")
                break

        transformation = {
            "job_id": job_id,
            "transformation": f"{job['ligand_a']} -> {job['ligand_b']}",
            "ligand_a": job["ligand_a"],
            "ligand_b": job["ligand_b"],
            "predicted_ddG": ddg,
            "experimental_ddG": experimental_ddg,
            "uncertainty": uncertainty,
            "quality_score": job["quality_score"]
        }

        transformations.append(transformation)

        logger.info(f"  {transformation['transformation']}: "
                   f"ΔΔG={ddg:.2f}±{uncertainty:.2f} kcal/mol "
                   f"(exp={experimental_ddg:.2f if experimental_ddg else 'N/A'})")

    # Step 6: Calculate metrics
    metrics = calculate_rbfe_metrics(transformations, ligands)

    logger.info("=== RBFE Stage Complete ===")
    logger.info(f"Pearson r={metrics.get('pearson_r', 0):.3f}, "
               f"RMSE={metrics.get('rmse', 0):.2f} kcal/mol")

    return {
        "network": {"ligands": [l["id"] for l in ligand_structures], "protein_id": protein_pdb_id},
        "transformations": transformations,
        "metrics": metrics,
        "job_ids": job_ids
    }
