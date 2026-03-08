"""ADMET service routers."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from lib.services.runner import call_service
from lib.structure.validator import validate_structure_for_service, StructureValidationError
from rdkit import Chem
from lib.chemistry import get_ligand_preparer
import datetime
import os
import json
import logging

router = APIRouter(prefix="", tags=["ADMET"])
logger = logging.getLogger(__name__)

# PostgreSQL connection for caching
_db_pool = None


async def get_db_pool():
    """Get or create PostgreSQL connection pool."""
    global _db_pool
    if _db_pool is None:
        try:
            import asyncpg
            database_url = os.getenv(
                'DATABASE_URL',
                'postgresql://ligandx:ligandx@postgres:5432/ligandx'
            )
            _db_pool = await asyncpg.create_pool(
                database_url,
                min_size=1,
                max_size=5,
                command_timeout=30
            )
            # Ensure table exists
            async with _db_pool.acquire() as conn:
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS admet_results (
                        id SERIAL PRIMARY KEY,
                        canonical_smiles TEXT UNIQUE NOT NULL,
                        input_smiles TEXT,
                        molecule_name VARCHAR(255),
                        results JSONB NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_admet_results_canonical_smiles 
                    ON admet_results(canonical_smiles)
                """)
            logger.info("Connected to PostgreSQL for ADMET caching")
        except Exception as e:
            logger.warning(f"Failed to connect to PostgreSQL: {e}. Using in-memory cache.")
            _db_pool = None
    return _db_pool


async def get_cached_result(canonical_smiles: str) -> Optional[Dict]:
    """Check PostgreSQL for cached ADMET result."""
    pool = await get_db_pool()
    if pool is None:
        return None

    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT results, molecule_name, created_at FROM admet_results WHERE canonical_smiles = $1",
                canonical_smiles
            )
            if row:
                results = row['results']
                if isinstance(results, str):
                    results = json.loads(results)
                logger.info(f"Found cached ADMET result for {canonical_smiles[:30]}...")
                return {
                    'results': results,
                    'molecule_name': row['molecule_name'],
                    'created_at': row['created_at'].isoformat() if row['created_at'] else None
                }
    except Exception as e:
        logger.warning(f"Error checking cache: {e}")
    return None


async def get_all_cached_canonical_smiles() -> set:
    """Get all canonical SMILES currently in PostgreSQL cache."""
    pool = await get_db_pool()
    if pool is None:
        return set()

    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT DISTINCT canonical_smiles FROM admet_results"
            )
            cached_set = {row['canonical_smiles'] for row in rows}
            logger.info(f"Loaded {len(cached_set)} cached SMILES from PostgreSQL")
            return cached_set
    except Exception as e:
        logger.warning(f"Error fetching cached SMILES set: {e}")
        return set()


async def cache_result(canonical_smiles: str, input_smiles: str, molecule_name: str, results: Dict):
    """Store ADMET result in PostgreSQL cache."""
    pool = await get_db_pool()
    if pool is None:
        return
    
    try:
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO admet_results (canonical_smiles, input_smiles, molecule_name, results)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (canonical_smiles) DO UPDATE SET
                    results = $4,
                    updated_at = NOW()
            """, canonical_smiles, input_smiles, molecule_name, json.dumps(results))
            logger.info(f"Cached ADMET result for {canonical_smiles[:30]}...")
    except Exception as e:
        logger.warning(f"Error caching result: {e}")


class PredictADMETRequest(BaseModel):
    smiles: Optional[str] = None
    smiles_list: Optional[List[str]] = None
    pdb_data: Optional[str] = None
    molecule_name: Optional[str] = None
    molecule_names: Optional[List[str]] = None  # parallel list for batch mode


def format_admet_results(mol, preds, canonical_smiles, molecule_name, input_smiles, cached=False):
    """Format ADMET results into standard response structure."""
    
    # Calculate physicochemical properties
    ligand_preparer = get_ligand_preparer()
    props = ligand_preparer.calculate_properties(mol)
    
    physicochemical_props = {
        "Molecular Weight": f"{props['molecular_weight']:.2f}",
        "LogP": f"{props['logp']:.2f}",
        "Hydrogen Bond Acceptors": props['hydrogen_bond_acceptors'],
        "Hydrogen Bond Donors": props['hydrogen_bond_donors'],
        "Lipinski Rule of 5 Violations": props['lipinski_violations'],
        "Quantitative Estimate of Druglikeness (QED)": f"{props['qed']:.2f}",
        "Stereo Centers": props['stereo_centers'],
        "Topological Polar Surface Area (TPSA)": f"{props['tpsa']:.2f}"
    }
    
    absorption = {
        "Human Intestinal Absorption": f"{preds.get('HIA_Hou', 0.0):.2f} (Prob.)",
        "Oral Bioavailability": f"{preds.get('Bioavailability_Ma', 0.0):.2f} (Prob.)",
        "Aqueous Solubility": f"{preds.get('Solubility_AqSolDB', 0.0):.2f} (logS)",
        "Lipophilicity": f"{preds.get('Lipophilicity_AstraZeneca', 0.0):.2f} (logD7.4)",
        "Cell Effective Permeability": f"{preds.get('Caco2_Wang', 0.0):.2f} (logPapp)",
        "P-glycoprotein Inhibition": f"{preds.get('Pgp_Broccatelli', 0.0):.2f} (Prob.)"
    }
    
    distribution = {
        "Blood-Brain Barrier Penetration": f"{preds.get('BBB_Martins', 0.0):.2f} (Prob.)",
    }
    
    metabolism = {
        "CYP1A2 Inhibition": f"{preds.get('CYP1A2_Veith', 0.0):.2f} (Prob.)",
        "CYP2C19 Inhibition": f"{preds.get('CYP2C19_Veith', 0.0):.2f} (Prob.)",
        "CYP2C9 Inhibition": f"{preds.get('CYP2C9_Veith', 0.0):.2f} (Prob.)",
        "CYP2D6 Inhibition": f"{preds.get('CYP2D6_Veith', 0.0):.2f} (Prob.)",
        "CYP3A4 Inhibition": f"{preds.get('CYP3A4_Veith', 0.0):.2f} (Prob.)",
        "CYP2C9 Substrate": f"{preds.get('CYP2C9_Substrate_CarbonMangels', 0.0):.2f} (Prob.)",
        "CYP2D6 Substrate": f"{preds.get('CYP2D6_Substrate_CarbonMangels', 0.0):.2f} (Prob.)",
        "CYP3A4 Substrate": f"{preds.get('CYP3A4_Substrate_CarbonMangels', 0.0):.2f} (Prob.)"
    }
    
    toxicity = {
        "hERG Blocking": f"{preds.get('hERG', 0.0):.2f} (Prob.)",
        "Clinical Toxicity": f"{preds.get('ClinTox', 0.0):.2f} (Prob.)",
        "Mutagenicity (AMES)": f"{preds.get('AMES', 0.0):.2f} (Prob.)",
        "Drug-Induced Liver Injury": f"{preds.get('DILI', 0.0):.2f} (Prob.)",
        "Carcinogenicity": f"{preds.get('Carcinogens_Lagunin', 0.0):.2f} (Prob.)",
        "Acute Toxicity LD50": f"{preds.get('LD50_Zhu', 0.0):.2f} (log(mol/kg))"
    }
    
    final_response = {
        "Physicochemical": physicochemical_props,
        "Absorption": absorption,
        "Distribution": distribution,
        "Metabolism": metabolism,
        "Toxicity": toxicity
    }
    
    if not cached:
        # We don't need to add metadata for caching purposes, but we can add it for the response
        final_response['_metadata'] = {
            'canonical_smiles': canonical_smiles,
            'molecule_name': molecule_name,
            'cached': False
        }
    
    return final_response


@router.post("/api/admet/predict")
async def predict_admet(request: PredictADMETRequest):
    """Predict ADMET properties."""
    try:
        # Handle batch mode
        if request.smiles_list:
            logger.info(f"Processing batch ADMET prediction for {len(request.smiles_list)} molecules")

            # Get all cached SMILES upfront for deduplication
            cached_smiles_set = await get_all_cached_canonical_smiles()

            results = []
            uncached_indices = []
            uncached_smiles = []
            seen_canonical = {}  # Track canonical SMILES to detect duplicates

            duplicates_removed = 0
            already_cached_count = 0
            invalid_smiles_list = []

            # First pass: validate, canonicalize, deduplicate
            for i, smiles in enumerate(request.smiles_list):
                try:
                    # Validate SMILES
                    mol = Chem.MolFromSmiles(smiles)
                    if mol is None:
                        # Track invalid SMILES
                        invalid_smiles_list.append({
                            'smiles': smiles,
                            'error': 'Invalid SMILES string'
                        })
                        results.append({
                            'smiles': smiles,
                            'error': 'Invalid SMILES string',
                            'valid': False
                        })
                        continue

                    # Get canonical form
                    canonical_smiles = Chem.MolToSmiles(mol, canonical=True)
                    provided_name = (request.molecule_names[i] if request.molecule_names and i < len(request.molecule_names) else None)
                    molecule_name = provided_name or f"Molecule_{canonical_smiles[:15]}"

                    # Check for duplicate within current batch
                    if canonical_smiles in seen_canonical:
                        duplicates_removed += 1
                        logger.info(f"Skipping duplicate SMILES in batch: {canonical_smiles[:30]}...")
                        results.append({
                            'smiles': smiles,
                            'canonical_smiles': canonical_smiles,
                            'molecule_name': molecule_name,
                            'error': 'Duplicate SMILES in batch',
                            'valid': False
                        })
                        continue

                    seen_canonical[canonical_smiles] = smiles

                    # Check if already cached
                    if canonical_smiles in cached_smiles_set:
                        already_cached_count += 1
                        # Get full cached result
                        cached = await get_cached_result(canonical_smiles)
                        if cached:
                            result_data = cached['results']
                            result_data['_metadata'] = {
                                'canonical_smiles': canonical_smiles,
                                'molecule_name': cached['molecule_name'] or molecule_name,
                                'cached': True,
                                'cached_at': cached['created_at']
                            }
                            results.append({
                                'smiles': smiles,
                                'canonical_smiles': canonical_smiles,
                                'molecule_name': cached['molecule_name'] or molecule_name,
                                'result': result_data,
                                'cached': True,
                                'valid': True
                            })
                        else:
                            # Should be in set but not retrievable - treat as error
                            results.append({
                                'smiles': smiles,
                                'canonical_smiles': canonical_smiles,
                                'error': 'Cached result not found',
                                'valid': False
                            })
                    else:
                        # Mark for prediction
                        results.append(None)  # Placeholder
                        uncached_indices.append(i)
                        uncached_smiles.append(smiles)

                except Exception as e:
                    logger.error(f"Error processing SMILES {smiles}: {e}")
                    invalid_smiles_list.append({
                        'smiles': smiles,
                        'error': str(e)
                    })
                    results.append({
                        'smiles': smiles,
                        'error': str(e),
                        'valid': False
                    })

            # Run batch prediction for uncached molecules
            if uncached_smiles:
                logger.info(f"Running batch prediction for {len(uncached_smiles)} uncached molecules")
                service_result = call_service('admet', {'smiles_list': uncached_smiles})

                if not service_result.get('success'):
                    logger.error(f"Batch prediction failed: {service_result.get('error')}")
                    for idx in uncached_indices:
                        results[idx] = {
                            'smiles': request.smiles_list[idx],
                            'error': 'Prediction service failed',
                            'valid': False
                        }
                else:
                    batch_predictions = service_result.get('result', [])

                    if len(batch_predictions) != len(uncached_smiles):
                        logger.error(f"Mismatch in batch results: sent {len(uncached_smiles)}, got {len(batch_predictions)}")

                    # Process results
                    for i, (smiles, preds) in enumerate(zip(uncached_smiles, batch_predictions)):
                        try:
                            mol = Chem.MolFromSmiles(smiles)
                            canonical_smiles = Chem.MolToSmiles(mol, canonical=True)
                            original_idx = uncached_indices[i]
                            provided_name = (request.molecule_names[original_idx] if request.molecule_names and original_idx < len(request.molecule_names) else None)
                            molecule_name = provided_name or f"Molecule_{canonical_smiles[:15]}"

                            formatted_result = format_admet_results(
                                mol, preds, canonical_smiles, molecule_name, smiles, cached=False
                            )

                            # Cache result
                            await cache_result(canonical_smiles, smiles, molecule_name, formatted_result)

                            # Update results list at correct index
                            results[original_idx] = {
                                'smiles': smiles,
                                'canonical_smiles': canonical_smiles,
                                'molecule_name': molecule_name,
                                'result': formatted_result,
                                'cached': False,
                                'valid': True
                            }
                        except Exception as e:
                            logger.error(f"Error processing result for {smiles}: {e}")
                            original_idx = uncached_indices[i]
                            results[original_idx] = {
                                'smiles': smiles,
                                'error': str(e),
                                'valid': False
                            }

            # Count stats
            total = len(request.smiles_list)
            valid = sum(1 for r in results if r and r.get('valid'))
            cached_count = sum(1 for r in results if r and r.get('cached'))
            predicted = valid - cached_count
            invalid_count = len(invalid_smiles_list)

            return {
                'success': True,
                'batch': True,
                'total': total,
                'valid': valid,
                'cached': cached_count,
                'predicted': predicted,
                'duplicates_removed': duplicates_removed,
                'already_cached': already_cached_count,
                'invalid_count': invalid_count,
                'invalid_smiles': invalid_smiles_list if invalid_smiles_list else None,
                'results': results
            }

        # Single molecule mode (backward compatibility)
        if not request.smiles and not request.pdb_data:
            raise HTTPException(status_code=400, detail="Either 'pdb_data', 'smiles', or 'smiles_list' must be provided")
        
        # Validate structure type for ADMET service (requires small molecule)
        structure_data = request.smiles if request.smiles else request.pdb_data
        format_hint = 'smiles' if request.smiles else 'pdb'
        
        try:
            validation_result = validate_structure_for_service(
                'admet',
                structure_data,
                format=format_hint
            )
            if not validation_result['valid']:
                error_msg = '; '.join(validation_result['errors'])
                raise HTTPException(status_code=400, detail=error_msg)
        except StructureValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.warning(f"Structure validation error (continuing): {e}")
        
        if not request.smiles:
            mol = Chem.MolFromPDBBlock(request.pdb_data, removeHs=False)
            if mol is None:
                raise HTTPException(status_code=400, detail="Could not parse PDB data")
            smiles = Chem.MolToSmiles(mol)
        else:
            mol = Chem.MolFromSmiles(request.smiles)
            if mol is None:
                raise HTTPException(status_code=400, detail="Invalid SMILES string")
            smiles = request.smiles
        
        # Get canonical SMILES for cache lookup
        canonical_smiles = Chem.MolToSmiles(mol, canonical=True)
        molecule_name = request.molecule_name or f"Molecule_{canonical_smiles[:15]}"
        
        # Check PostgreSQL cache first
        cached = await get_cached_result(canonical_smiles)
        if cached:
            logger.info(f"Returning cached ADMET result for {canonical_smiles[:30]}...")
            final_response = cached['results']
            final_response['_metadata'] = {
                'canonical_smiles': canonical_smiles,
                'molecule_name': cached['molecule_name'] or molecule_name,
                'cached': True,
                'cached_at': cached['created_at']
            }
            return final_response
        
        # Not cached - run prediction
        logger.info(f"Running ADMET prediction for {canonical_smiles[:30]}...")
        service_result = call_service('admet', {'smiles': smiles})
        if not service_result.get('success'):
            raise HTTPException(status_code=500, detail=service_result.get('error', 'ADMET prediction failed'))
        
        preds = service_result.get('result', {})
        
        # Format results using helper function
        final_response = format_admet_results(
            mol, preds, canonical_smiles, molecule_name, smiles, cached=False
        )
        
        # Cache result in PostgreSQL
        await cache_result(canonical_smiles, smiles, molecule_name, final_response)
        
        final_response['_metadata'] = {
            'canonical_smiles': canonical_smiles,
            'molecule_name': molecule_name,
            'cached': False
        }
        
        return final_response
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"Error in predict_admet: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/admet/results")
async def get_admet_results():
    """Get all ADMET results from PostgreSQL."""
    try:
        pool = await get_db_pool()
        if pool is None:
            return {'success': True, 'count': 0, 'results': [], 'message': 'Database not available'}
        
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT id, canonical_smiles, input_smiles, molecule_name, created_at, results
                FROM admet_results
                ORDER BY created_at DESC
                LIMIT 100
            """)
            
            results_list = []
            for row in rows:
                results_list.append({
                    'id': row['id'],
                    'canonical_smiles': row['canonical_smiles'],
                    'smiles': row['input_smiles'] or row['canonical_smiles'],
                    'molecule_name': row['molecule_name'],
                    'timestamp': row['created_at'].isoformat() if row['created_at'] else None,
                    'has_results': row['results'] is not None
                })
            
            return {'success': True, 'count': len(results_list), 'results': results_list}
    except Exception as e:
        logger.error(f"Error fetching ADMET results: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/admet/results/{smiles:path}")
async def get_admet_result_by_smiles(smiles: str):
    """Get ADMET result by SMILES from PostgreSQL."""
    try:
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            raise HTTPException(status_code=400, detail="Invalid SMILES string")
        canonical_smiles = Chem.MolToSmiles(mol, canonical=True)
        
        cached = await get_cached_result(canonical_smiles)
        if cached:
            return {
                'success': True,
                'found': True,
                'canonical_smiles': canonical_smiles,
                'molecule_name': cached['molecule_name'],
                'timestamp': cached['created_at'],
                'results': cached['results']
            }
        else:
            return {'success': True, 'found': False, 'canonical_smiles': canonical_smiles, 'message': 'No cached results found'}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/admet/results/{result_id}")
async def delete_admet_result(result_id: int):
    """Delete ADMET result from PostgreSQL."""
    try:
        pool = await get_db_pool()
        if pool is None:
            raise HTTPException(status_code=503, detail="Database not available")
        
        async with pool.acquire() as conn:
            # Get molecule name before deleting
            row = await conn.fetchrow(
                "SELECT molecule_name FROM admet_results WHERE id = $1",
                result_id
            )
            if not row:
                raise HTTPException(status_code=404, detail="Result not found")
            
            molecule_name = row['molecule_name']
            await conn.execute("DELETE FROM admet_results WHERE id = $1", result_id)
            
            return {'success': True, 'message': f"Deleted ADMET result for '{molecule_name}'"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
