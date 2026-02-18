"""PDB structure fetching and caching utilities."""

import httpx
from pathlib import Path
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)


async def fetch_pdb_from_rcsb(pdb_id: str) -> str:
    """
    Fetch PDB file from RCSB PDB.

    Args:
        pdb_id: 4-character PDB ID

    Returns:
        PDB file contents as string
    """
    url = f"https://files.rcsb.org/download/{pdb_id.upper()}.pdb"
    logger.info(f"Fetching {pdb_id} from RCSB: {url}")

    async with httpx.AsyncClient() as client:
        response = await client.get(url, follow_redirects=True)
        response.raise_for_status()
        return response.text


async def fetch_pdb_structures(
    pdb_ids: List[str],
    cache_dir: Path,
    force_refresh: bool = False
) -> Dict[str, Path]:
    """
    Fetch multiple PDB structures and cache locally.

    Args:
        pdb_ids: List of PDB IDs to fetch
        cache_dir: Directory to cache PDB files
        force_refresh: If True, re-download even if cached

    Returns:
        Dictionary mapping pdb_id -> cached file path
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    cached_files = {}

    for pdb_id in pdb_ids:
        pdb_file = cache_dir / f"{pdb_id}.pdb"

        if pdb_file.exists() and not force_refresh:
            logger.info(f"Using cached PDB: {pdb_file}")
            cached_files[pdb_id] = pdb_file
            continue

        try:
            pdb_content = await fetch_pdb_from_rcsb(pdb_id)
            pdb_file.write_text(pdb_content)
            logger.info(f"Cached PDB to: {pdb_file}")
            cached_files[pdb_id] = pdb_file
        except Exception as e:
            logger.error(f"Failed to fetch {pdb_id}: {e}")
            raise

    return cached_files


async def cache_reference_poses(
    structures: List[Dict],
    cache_dir: Path,
    force_refresh: bool = False
) -> Dict[str, Path]:
    """
    Cache reference crystal structure poses for RMSD comparison.

    Args:
        structures: List of structure metadata dicts with 'pdb_id'
        cache_dir: Directory to cache reference poses
        force_refresh: If True, re-download even if cached

    Returns:
        Dictionary mapping pdb_id -> cached PDB path
    """
    pdb_ids = [s["pdb_id"] for s in structures if s.get("ligand_name")]
    return await fetch_pdb_structures(pdb_ids, cache_dir, force_refresh)
