#!/usr/bin/env python
"""
Boltz2 Binding Affinity Prediction Service Entrypoint

This script runs Boltz2 prediction jobs in the biochem-boltz2 environment.
It accepts JSON input and returns JSON output.

Usage:
    python run_boltz2_job.py < input.json > output.json
"""

import sys
import json
import argparse
import logging
import os
from pathlib import Path

# Configure logging to stderr so runner.py can capture it
# This is critical for visibility when running as a subprocess
logging.basicConfig(
    level=logging.DEBUG if os.getenv('DEBUG') else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stderr)],
    force=True  # Override any existing configuration
)
logger = logging.getLogger(__name__)

# Add parent directories to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from services.boltz2.service import Boltz2Service


def main():
    parser = argparse.ArgumentParser(description='Run Boltz2 binding affinity prediction job')
    parser.add_argument('--input', type=str, help='Input JSON file')
    parser.add_argument('--output', type=str, help='Output JSON file')
    args = parser.parse_args()
    
    logger.info("Boltz2 job script starting...")
    
    # Read input
    if args.input:
        logger.info(f"Reading input from file: {args.input}")
        with open(args.input, 'r') as f:
            input_data = json.load(f)
    else:
        logger.info("Reading input from stdin")
        input_data = json.load(sys.stdin)
    
    try:
        logger.info("Initializing Boltz2 service...")
        # Initialize service
        service = Boltz2Service()
        
        # Extract parameters
        protein_data = input_data.get('protein_data')
        ligand_data = input_data.get('ligand_data')
        prediction_params = input_data.get('prediction_params', {})
        num_poses = input_data.get('num_poses', 5)
        msa_path = input_data.get('msa_path')  # Optional pre-computed MSA path
        alignment_options = input_data.get('alignment_options') # Optional alignment settings

        logger.info(f"Prediction parameters: num_poses={num_poses}")
        logger.info(f"Protein data length: {len(protein_data) if protein_data else 0} chars")
        logger.info(f"Ligand data length: {len(ligand_data) if ligand_data else 0} chars")
        if msa_path:
            logger.info(f"Using pre-computed MSA: {msa_path}")
        
        if not protein_data or not ligand_data:
            raise ValueError("'protein_data' and 'ligand_data' are required")
        
        # Run prediction
        logger.info("Starting binding affinity prediction...")
        result = service.predict_binding_affinity(
            protein_data=protein_data,
            ligand_data=ligand_data,
            prediction_params=prediction_params,
            num_poses=num_poses,
            msa_path=msa_path,
            alignment_options=alignment_options
        )
        
        logger.info(f"Prediction completed with success={result.get('success', False)}")
        
        # Prepare output
        output = {
            'success': True,
            'result': result
        }
        
    except Exception as e:
        import traceback
        error_msg = str(e)
        tb = traceback.format_exc()
        logger.error(f"Prediction failed: {error_msg}")
        logger.error(f"Traceback: {tb}")
        output = {
            'success': False,
            'error': error_msg,
            'traceback': tb
        }
    
    # Write output
    output_json = json.dumps(output, indent=2)
    
    if args.output:
        logger.info(f"Writing output to file: {args.output}")
        with open(args.output, 'w') as f:
            f.write(output_json)
    else:
        logger.info("Writing output to stdout")
        print(output_json)
    
    logger.info("Boltz2 job script completed")


if __name__ == '__main__':
    main()



