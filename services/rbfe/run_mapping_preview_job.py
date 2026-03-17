#!/usr/bin/env python
"""
RBFE Atom Mapping Preview Service Entrypoint

Runs a lightweight atom mapping preview job: prepares ligands,
computes all pairwise atom mappings with highlight SVGs, and
returns the results as JSON.  No protein structure or simulation
is needed — this is purely ligand–ligand mapping.

Usage:
    python run_mapping_preview_job.py --input input.json
    python run_mapping_preview_job.py < input.json
"""

import sys
import json
import argparse
import logging
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stderr)],
)

from services.rbfe.service import RBFEService


def main() -> None:
    parser = argparse.ArgumentParser(description='Run RBFE atom mapping preview job')
    parser.add_argument('--input', type=str, help='Input JSON file path')
    parser.add_argument('--output', type=str, help='Output JSON file path')
    args = parser.parse_args()

    if args.input:
        with open(args.input, 'r') as f:
            input_data = json.load(f)
    else:
        input_data = json.load(sys.stdin)

    try:
        service = RBFEService()

        job_id = input_data.get('job_id', 'mapping_preview')
        ligands_data = input_data.get('ligands', [])
        atom_mapper = input_data.get('atom_mapper', 'kartograf')
        atom_map_hydrogens = input_data.get('atom_map_hydrogens', True)
        lomap_max3d = input_data.get('lomap_max3d', 1.0)
        charge_method = input_data.get('charge_method', 'am1bcc')

        result = service.run_mapping_preview(
            ligands_data=ligands_data,
            job_id=job_id,
            atom_mapper=atom_mapper,
            atom_map_hydrogens=atom_map_hydrogens,
            lomap_max3d=lomap_max3d,
            charge_method=charge_method,
        )

        output = {'success': True, 'result': result}

    except Exception as e:
        import traceback
        output = {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc(),
        }

    def make_serializable(obj):
        if isinstance(obj, dict):
            return {k: make_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [make_serializable(item) for item in obj]
        elif isinstance(obj, (str, int, float, bool, type(None))):
            return obj
        else:
            return str(obj)

    try:
        output_json = json.dumps(make_serializable(output), indent=2)
    except Exception as json_err:
        output_json = json.dumps({
            'success': False,
            'error': f'Failed to serialize output: {json_err}',
        })

    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)
    else:
        print(output_json, flush=True)


if __name__ == '__main__':
    main()
