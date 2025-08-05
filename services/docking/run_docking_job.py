#!/usr/bin/env python
"""
Docking Service Entrypoint

This script runs docking jobs in the biochem-docking environment.
It accepts JSON input and returns JSON output.

Usage:
    python run_docking_job.py < input.json > output.json
"""

import sys
import json
import argparse
from pathlib import Path

# Add parent directories to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from services.docking.service import DockingService


def main():
    parser = argparse.ArgumentParser(description='Run docking job')
    parser.add_argument('--input', type=str, help='Input JSON file')
    parser.add_argument('--output', type=str, help='Output JSON file')
    args = parser.parse_args()
    
    # Read input
    if args.input:
        with open(args.input, 'r') as f:
            input_data = json.load(f)
    else:
        input_data = json.load(sys.stdin)
    
    try:
        # Initialize service
        service = DockingService()
        
        # Extract parameters
        receptor_pdbqt = input_data.get('receptor_pdbqt')
        ligand_pdbqt = input_data.get('ligand_pdbqt')
        grid_box = input_data.get('grid_box')
        docking_params = input_data.get('docking_params', {})
        use_api = input_data.get('use_api', None)
        
        # Original ligand data for SDF bond preservation
        original_ligand_data = input_data.get('original_ligand_data')
        original_ligand_format = input_data.get('original_ligand_format', 'pdb')
        
        if not receptor_pdbqt or not ligand_pdbqt or not grid_box:
            raise ValueError("'receptor_pdbqt', 'ligand_pdbqt', and 'grid_box' are required")
        
        # Run docking
        result = service.dock(
            receptor_pdbqt=receptor_pdbqt,
            ligand_pdbqt=ligand_pdbqt,
            grid_box=grid_box,
            docking_params=docking_params,
            use_api=use_api
        )
        
        # Convert PDBQT poses to SDF and PDB formats using OpenBabel
        # OpenBabel properly handles PDBQT format and generates correct bond orders
        poses_sdf = ''
        poses_pdb = ''
        if result.get('success', False):
            poses_pdbqt = result.get('poses_pdbqt', '')
            if poses_pdbqt:
                # Convert to SDF using OpenBabel (properly handles PDBQT atom types and bonds)
                print(f"[Docking] Converting PDBQT poses to SDF using OpenBabel")
                poses_sdf = service.convert_pdbqt_poses_to_sdf_obabel(poses_pdbqt)
                
                # Convert to PDB using OpenBabel (for visualization in frontend)
                print(f"[Docking] Converting PDBQT poses to PDB using OpenBabel")
                poses_pdb = service.convert_pdbqt_poses_to_pdb(poses_pdbqt)
        
        # Add converted formats to result
        result['poses_sdf'] = poses_sdf
        result['poses_pdb'] = poses_pdb
        
        # Prepare output
        output = {
            'success': True,
            'result': result
        }
        
    except Exception as e:
        import traceback
        output = {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }
    
    # Write output
    output_json = json.dumps(output, indent=2)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)
    else:
        print(output_json)


if __name__ == '__main__':
    main()



