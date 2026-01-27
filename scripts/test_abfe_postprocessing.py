#!/usr/bin/env python3
"""
Test script to insert legacy ABFE data into PostgreSQL and test post-processing.

Usage:
    python scripts/test_abfe_postprocessing.py
"""

import os
import sys
import uuid
import json
import shutil
import asyncio
from pathlib import Path
from datetime import datetime

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# PostgreSQL connection details
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://ligandx:ligandx@localhost:5432/ligandx')

# Legacy ABFE data location
LEGACY_DATA_DIR = project_root / "data" / "abfe_outputs" / "abfe_job"
LEGACY_JOB_JSON = project_root / "data" / "abfe_outputs" / "jobs" / "abfe_job.json"

# Output directory for ABFE service
ABFE_OUTPUT_DIR = project_root / "data" / "abfe_outputs"

async def insert_test_job():
    """Insert a test ABFE job into PostgreSQL using legacy data."""
    
    try:
        import asyncpg
    except ImportError:
        print("ERROR: asyncpg not installed. Run: pip install asyncpg")
        return None
    
    # Generate a new UUID for this test job
    job_id = str(uuid.uuid4())
    print(f"Generated test job ID: {job_id}")
    
    # Load legacy job info
    if LEGACY_JOB_JSON.exists():
        with open(LEGACY_JOB_JSON, 'r') as f:
            legacy_info = json.load(f)
        print(f"Loaded legacy job info: {legacy_info}")
    else:
        legacy_info = {
            "ligand_id": "P30_A_1001",
            "protein_id": "4RT7_cleaned"
        }
        print(f"Using default job info: {legacy_info}")
    
    # Create job directory by copying/symlinking legacy data
    job_dir = ABFE_OUTPUT_DIR / job_id
    if not job_dir.exists():
        # Copy the legacy data to a new job directory
        print(f"Copying legacy data to: {job_dir}")
        shutil.copytree(LEGACY_DATA_DIR, job_dir)
        print(f"Copied legacy ABFE data to {job_dir}")
    else:
        print(f"Job directory already exists: {job_dir}")
    
    # Create job metadata file (for ABFE service file-based tracking)
    jobs_dir = ABFE_OUTPUT_DIR / "jobs"
    jobs_dir.mkdir(parents=True, exist_ok=True)
    
    job_metadata = {
        "status": "completed",
        "job_dir": str(job_dir),
        "error": None,
        "results": {
            "binding_free_energy_kcal_mol": None,  # Will be filled by post-processing
            "ligand_id": legacy_info.get("ligand_id", "P30_A_1001"),
            "protein_id": legacy_info.get("protein_id", "4RT7_cleaned"),
            "job_dir": str(job_dir)
        },
        "ligand_id": legacy_info.get("ligand_id", "P30_A_1001"),
        "protein_id": legacy_info.get("protein_id", "4RT7_cleaned"),
        "created_at": datetime.now().isoformat()
    }
    
    job_metadata_file = jobs_dir / f"{job_id}.json"
    with open(job_metadata_file, 'w') as f:
        json.dump(job_metadata, f, indent=2)
    print(f"Created job metadata file: {job_metadata_file}")
    
    # Insert into PostgreSQL
    try:
        conn = await asyncpg.connect(DATABASE_URL)
        print(f"Connected to PostgreSQL: {DATABASE_URL}")
        
        # Check if jobs table exists
        table_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'jobs'
            )
        """)
        
        if not table_exists:
            print("ERROR: 'jobs' table does not exist. Run migrations first.")
            await conn.close()
            return None
        
        # Prepare input params
        input_params = {
            "ligand_id": legacy_info.get("ligand_id", "P30_A_1001"),
            "protein_id": legacy_info.get("protein_id", "4RT7_cleaned"),
            "ligand_name": legacy_info.get("ligand_id", "P30_A_1001"),
        }
        
        # Insert job record
        await conn.execute("""
            INSERT INTO jobs (id, job_type, status, input_params, molecule_name, created_at, completed_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET
                status = EXCLUDED.status,
                completed_at = EXCLUDED.completed_at
        """,
            uuid.UUID(job_id),
            'abfe',
            'completed',
            json.dumps(input_params),
            legacy_info.get("ligand_id", "P30_A_1001")
        )
        
        print(f"Inserted job into PostgreSQL: {job_id}")
        
        # Verify insertion
        row = await conn.fetchrow("SELECT * FROM jobs WHERE id = $1", uuid.UUID(job_id))
        if row:
            print(f"Verified job in database:")
            print(f"  - ID: {row['id']}")
            print(f"  - Type: {row['job_type']}")
            print(f"  - Status: {row['status']}")
            print(f"  - Molecule: {row['molecule_name']}")
        
        await conn.close()
        return job_id
        
    except Exception as e:
        print(f"ERROR inserting into PostgreSQL: {e}")
        import traceback
        traceback.print_exc()
        return job_id  # Still return job_id so we can test file-based tracking


def test_abfe_service(job_id: str):
    """Test the ABFE service post-processing with the test job."""
    print(f"\n{'='*60}")
    print("Testing ABFE Service Post-Processing")
    print(f"{'='*60}")
    
    try:
        from services.abfe.service import ABFEService
        
        service = ABFEService(output_dir=str(ABFE_OUTPUT_DIR))
        
        # Test 1: Get job status
        print("\n1. Testing get_job_status()...")
        status = service.get_job_status(job_id)
        print(f"   Status: {status.get('status')}")
        print(f"   Error: {status.get('error')}")
        print(f"   Job Dir: {status.get('job_dir')}")
        
        # Test 2: Parse results from job
        print("\n2. Testing parse_results_from_job()...")
        parsed = service.parse_results_from_job(job_id)
        if parsed.get('error'):
            print(f"   ERROR: {parsed.get('error')}")
        else:
            print(f"   Ligands: {parsed.get('ligands')}")
            print(f"   DG Results: {parsed.get('dg_results')}")
            print(f"   DG Raw: {parsed.get('dg_raw')}")
        
        # Test 3: Get detailed analysis
        print("\n3. Testing get_detailed_analysis()...")
        analysis = service.get_detailed_analysis(job_id)
        if analysis.get('error'):
            print(f"   ERROR: {analysis.get('error')}")
        else:
            print(f"   Legs: {len(analysis.get('legs', []))}")
            for leg in analysis.get('legs', []):
                print(f"     - {leg.get('leg_type')}: {leg.get('status')}")
            print(f"   Thermodynamic Cycle: {analysis.get('thermodynamic_cycle')}")
            print(f"   Convergence Data: {analysis.get('convergence_data') is not None}")
            print(f"   Output Files: {list(analysis.get('output_files', {}).keys())}")
        
        return True
        
    except Exception as e:
        print(f"ERROR testing ABFE service: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_api_endpoints(job_id: str):
    """Test API endpoints via HTTP requests."""
    print(f"\n{'='*60}")
    print("Testing API Endpoints")
    print(f"{'='*60}")
    
    try:
        import requests
    except ImportError:
        print("WARNING: requests not installed. Skipping API tests.")
        return
    
    base_url = os.getenv('ABFE_API_URL', 'http://localhost:8007')
    
    endpoints = [
        f"/api/abfe/status/{job_id}",
        f"/api/abfe/parse-results/{job_id}",
        f"/api/abfe/detailed-analysis/{job_id}",
    ]
    
    for endpoint in endpoints:
        url = f"{base_url}{endpoint}"
        print(f"\nTesting: {url}")
        try:
            resp = requests.get(url, timeout=10)
            print(f"  Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                if 'error' in data and data['error']:
                    print(f"  Error: {data['error']}")
                else:
                    print(f"  Success: {list(data.keys())}")
            else:
                print(f"  Response: {resp.text[:200]}")
        except requests.exceptions.ConnectionError:
            print(f"  Connection error - service may not be running")
        except Exception as e:
            print(f"  Error: {e}")


async def main():
    print("="*60)
    print("ABFE Post-Processing Test Script")
    print("="*60)
    print(f"\nLegacy data directory: {LEGACY_DATA_DIR}")
    print(f"Legacy data exists: {LEGACY_DATA_DIR.exists()}")
    
    if not LEGACY_DATA_DIR.exists():
        print("ERROR: Legacy ABFE data not found!")
        return 1
    
    # List files in legacy directory
    print(f"\nLegacy directory contents:")
    for item in LEGACY_DATA_DIR.iterdir():
        if item.is_file():
            print(f"  - {item.name} ({item.stat().st_size} bytes)")
        else:
            print(f"  - {item.name}/ (dir)")
    
    # Insert test job into PostgreSQL
    job_id = await insert_test_job()
    
    if job_id:
        print(f"\n{'='*60}")
        print(f"TEST JOB ID: {job_id}")
        print(f"{'='*60}")
        
        # Test ABFE service
        test_abfe_service(job_id)
        
        # Test API endpoints (if service is running)
        test_api_endpoints(job_id)
        
        print(f"\n{'='*60}")
        print("TEST COMPLETE")
        print(f"{'='*60}")
        print(f"\nJob ID for frontend testing: {job_id}")
        print(f"You can view this job in the Results Browser")
        
        return 0
    else:
        print("Failed to create test job")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
