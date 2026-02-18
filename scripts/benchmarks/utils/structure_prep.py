"""Structure preparation utilities."""

import httpx
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


async def prepare_protein_structure(
    pdb_id: str,
    api_base_url: str,
    chain: Optional[str] = None
) -> Dict[str, Any]:
    """
    Prepare protein structure using Ligand-X structure service.

    Args:
        pdb_id: PDB ID to fetch
        api_base_url: Base URL for Ligand-X API
        chain: Optional chain ID to extract

    Returns:
        Structure data from structure service
    """
    url = f"{api_base_url}/fetch_pdb"
    payload = {"pdb_id": pdb_id}

    if chain:
        payload["chain"] = chain

    logger.info(f"Preparing protein structure: {pdb_id} (chain={chain})")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()

    logger.info(f"Structure prepared: {data.get('components', {})}")
    return data


async def extract_ligand_from_pdb(
    pdb_path: Path,
    ligand_name: str,
    api_base_url: str,
    output_format: str = "sdf"
) -> Tuple[str, Dict[str, float]]:
    """
    Extract ligand from PDB file.

    Args:
        pdb_path: Path to PDB file
        ligand_name: Ligand residue name
        api_base_url: Base URL for Ligand-X API
        output_format: Output format (sdf, mol2, pdb)

    Returns:
        Tuple of (ligand_content, center_of_mass)
    """
    url = f"{api_base_url}/api/structure/extract_ligand"

    logger.info(f"Extracting ligand {ligand_name} from {pdb_path}")

    # Read PDB file
    pdb_content = pdb_path.read_text()

    # Make API request
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            url,
            json={
                "pdb_content": pdb_content,
                "ligand_name": ligand_name,
                "output_format": output_format
            }
        )
        response.raise_for_status()
        data = response.json()

    ligand_content = data.get("ligand_content")
    center_of_mass = data.get("center_of_mass", {"x": 0, "y": 0, "z": 0})

    logger.info(f"Ligand extracted, COM: {center_of_mass}")

    return ligand_content, center_of_mass


async def fetch_structure_via_api(
    pdb_id: str,
    api_base_url: str
) -> Dict[str, Any]:
    """
    Fetch and process structure using Ligand-X API.

    Args:
        pdb_id: PDB ID
        api_base_url: Base URL for API

    Returns:
        Processed structure data
    """
    url = f"{api_base_url}/fetch_pdb"

    logger.info(f"Fetching structure via API: {pdb_id}")

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(url, json={"pdb_id": pdb_id})
        response.raise_for_status()
        return response.json()
