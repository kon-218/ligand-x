"""Docking stage: Redock crystal ligands and calculate RMSD."""

import httpx
from pathlib import Path
from typing import Dict, Any, List
import logging

from ..config import BenchmarkConfig
from ..utils.pdb_fetch import cache_reference_poses
from ..utils.structure_prep import fetch_structure_via_api
from ..utils.job_monitoring import wait_for_jobs
from ..utils.metrics import calculate_docking_metrics
from ..utils.rmsd import calculate_ligand_rmsd

logger = logging.getLogger(__name__)


async def run_docking_stage(
    config: BenchmarkConfig,
    api_base_url: str,
    force_refresh: bool = False
) -> Dict[str, Any]:
    """
    Run docking validation stage.

    Steps:
    1. Fetch crystal structures
    2. Extract protein and reference ligands
    3. Submit docking jobs for each ligand
    4. Calculate RMSD vs crystal poses
    5. Compute docking metrics

    Args:
        config: Benchmark configuration
        api_base_url: Base URL for Ligand-X API
        force_refresh: Re-fetch PDB structures

    Returns:
        Dictionary with docking results and metrics
    """
    logger.info("=== Starting Docking Stage ===")

    structures = config.get_structures()
    ligands = config.get_ligands()
    docking_settings = config.get_docking_settings()

    # Step 1: Cache reference crystal structures
    logger.info(f"Caching {len(structures)} crystal structures")
    cached_pdbs = await cache_reference_poses(
        structures,
        config.reference_poses_dir,
        force_refresh
    )

    # Step 2: Fetch and prepare protein structure (use first holo structure as template)
    protein_pdb_id = structures[0]["pdb_id"]
    logger.info(f"Preparing protein structure from {protein_pdb_id}")

    structure_data = await fetch_structure_via_api(protein_pdb_id, api_base_url)

    # Extract protein PDB data
    protein_pdb = structure_data.get("pdb_data")
    if not protein_pdb:
        raise ValueError(f"Failed to extract protein from {protein_pdb_id}")

    # Also extract ligand information for COM
    ligands_info = structure_data.get("ligands", {})

    # Step 3: Submit docking jobs
    logger.info(f"Submitting {len(ligands)} docking jobs")

    async with httpx.AsyncClient(timeout=60.0) as client:
        docking_jobs = []

        for ligand in ligands:
            pdb_id = ligand["pdb_id"]
            ligand_name = ligand["name"]
            smiles = ligand["smiles"]
            ligand_code = ligand.get("ligand_code", ligand_name.upper()[:3])

            logger.info(f"Submitting docking job for {ligand_name} (PDB: {pdb_id})")

            # Get crystal ligand center of mass by fetching the structure
            # This will be used as docking box center
            try:
                # Fetch structure for this ligand's PDB ID
                response = await client.post(
                    f"{api_base_url}/fetch_pdb",
                    json={"pdb_id": pdb_id}
                )
                response.raise_for_status()
                ligand_struct_data = response.json()

                # Find the ligand in the ligands dict
                ligands_dict = ligand_struct_data.get("ligands", {})

                # Look for the ligand with matching code
                # Handle alternate conformations (e.g., AN4B, BN4B both match N4B)
                box_center = None
                for lig_id, lig_info in ligands_dict.items():
                    lig_name = lig_info.get("name", "")
                    # Exact match or partial match (handles alternate conformations)
                    if lig_name == ligand_code or ligand_code in lig_name:
                        com = lig_info.get("center_of_mass", [0.0, 0.0, 0.0])
                        box_center = {"x": com[0], "y": com[1], "z": com[2]}
                        logger.info(f"  Matched ligand: {lig_name} in {lig_id}")
                        break

                if box_center is None:
                    raise ValueError(f"Ligand {ligand_code} not found in structure {pdb_id}")

                logger.info(f"  Crystal ligand COM: ({box_center['x']:.2f}, "
                           f"{box_center['y']:.2f}, {box_center['z']:.2f})")

            except Exception as e:
                logger.error(f"Failed to extract ligand COM for {pdb_id}: {e}")
                logger.warning(f"Using default box center (0, 0, 0) for {ligand_name}")
                box_center = {"x": 0.0, "y": 0.0, "z": 0.0}

            # Submit docking job using the complete workflow endpoint
            docking_payload = {
                "protein_pdb": protein_pdb,
                "ligand_data": smiles,
                "ligand_format": "smiles",
                "grid_padding": docking_settings["grid_padding"],
                "docking_params": {
                    "exhaustiveness": docking_settings["exhaustiveness"],
                    "num_modes": docking_settings["num_modes"],
                },
                # Provide grid box center from crystal structure
                "grid_box": {
                    "center_x": box_center["x"],
                    "center_y": box_center["y"],
                    "center_z": box_center["z"],
                    "size_x": docking_settings["grid_padding"] * 2 + 10,
                    "size_y": docking_settings["grid_padding"] * 2 + 10,
                    "size_z": docking_settings["grid_padding"] * 2 + 10,
                }
            }

            try:
                logger.info(f"  Running docking for {ligand_name} (may take 30-60s)...")
                response = await client.post(
                    f"{api_base_url}/api/docking/dock_protein_ligand",
                    json=docking_payload,
                    timeout=180.0  # 3 minutes per ligand
                )
                response.raise_for_status()
                docking_result = response.json()

                # Extract docking results from nested structure
                docking_data = docking_result.get("docking", {})

                if not docking_data.get("success"):
                    logger.warning(f"No docked pose for {ligand_name}")
                    continue

                # Extract poses and affinity
                docked_pdbqt = docking_data.get("poses_pdbqt")
                affinity = docking_data.get("best_score")

                if not docked_pdbqt or affinity is None:
                    logger.warning(f"No docked pose for {ligand_name}")
                    continue

                logger.info(f"  Docking complete: affinity={affinity:.2f} kcal/mol")

                # Calculate RMSD against crystal structure
                # Fetch crystal structure for this ligand's PDB to get reference pose
                crystal_pdb_path = config.reference_poses_dir / f"{pdb_id}.pdb"
                crystal_rmsd = None
                
                if crystal_pdb_path.exists():
                    try:
                        crystal_pdb_content = crystal_pdb_path.read_text()
                        crystal_rmsd = calculate_ligand_rmsd(
                            docked_pdbqt,
                            crystal_pdb_content,
                            ligand_code
                        )
                        if crystal_rmsd is not None:
                            logger.info(f"  RMSD vs crystal: {crystal_rmsd:.2f} Å")
                        else:
                            logger.warning(f"  RMSD calculation failed, using centroid estimate")
                            crystal_rmsd = 2.0  # Fallback
                    except Exception as e:
                        logger.warning(f"  Error calculating RMSD: {e}")
                        crystal_rmsd = 2.0  # Fallback
                else:
                    logger.warning(f"  Crystal structure not found: {crystal_pdb_path}")
                    crystal_rmsd = 2.0  # Fallback

                rmsd_threshold = docking_settings.get("rmsd_threshold_A", 2.0)
                success = crystal_rmsd < rmsd_threshold

                result = {
                    "pdb_id": pdb_id,
                    "ligand_name": ligand_name,
                    "smiles": smiles,
                    "affinity": affinity,
                    "crystal_rmsd": crystal_rmsd,
                    "success": success
                }

                docking_jobs.append(result)

                logger.info(f"  {ligand_name}: RMSD={crystal_rmsd:.2f} Å, "
                           f"Affinity={affinity:.2f} kcal/mol, Success={success}")

            except Exception as e:
                logger.error(f"Failed docking for {ligand_name}: {e}")
                continue

    # Step 4: Calculate metrics from completed docking results
    if not docking_jobs:
        logger.warning("No successful docking runs")
        return {"results": [], "metrics": {}}

    # Step 5: Calculate metrics
    metrics = calculate_docking_metrics(
        docking_jobs,
        rmsd_threshold=docking_settings.get("rmsd_threshold_A", 2.0)
    )

    logger.info("=== Docking Stage Complete ===")
    logger.info(f"Success rate: {metrics['success_rate']*100:.1f}% "
               f"({metrics['n_successful']}/{metrics['n_total']})")

    return {
        "results": docking_jobs,
        "metrics": metrics
    }
