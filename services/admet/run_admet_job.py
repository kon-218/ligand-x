#!/usr/bin/env python
"""
ADMET Prediction Service Entrypoint

This script runs ADMET prediction jobs in the biochem-admet environment.
It accepts JSON input and returns JSON output.

Usage:
    python run_admet_job.py < input.json > output.json
"""

import sys
import json
import argparse
from pathlib import Path
import contextlib
import pandas as pd

# Add parent directories to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from admet_ai import ADMETModel


def main():
    parser = argparse.ArgumentParser(description='Run ADMET prediction job')
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
        # Initialize predictor - redirect stdout to stderr during initialization
        # to prevent model loading messages from interfering with JSON output
        with contextlib.redirect_stdout(sys.stderr):
            predictor = ADMETModel()
        
        # Check for batch or single mode
        smiles_list = input_data.get('smiles_list')
        smiles = input_data.get('smiles')
        
        predictions = None
        
        # Run prediction - redirect stdout to stderr to prevent any output
        # from interfering with JSON output
        with contextlib.redirect_stdout(sys.stderr):
            if smiles_list:
                # Batch mode
                # predict returns a DataFrame where index is SMILES and columns are properties
                df_preds = predictor.predict(smiles=smiles_list)
                
                # Convert to list of dictionaries (one per molecule)
                # We need to make sure the order matches the input smiles_list
                # The DataFrame index is the SMILES string
                
                # Check if we got results for all SMILES
                results = []
                for s in smiles_list:
                    if s in df_preds.index:
                        # Convert Series to dict
                        results.append(df_preds.loc[s].to_dict())
                    else:
                        # Should not happen if valid SMILES, but handle just in case
                        results.append({})
                
                predictions = results
                
            elif smiles:
                # Single mode
                predictions = predictor.predict(smiles=smiles)
            else:
                raise ValueError("Either 'smiles' or 'smiles_list' is required in input")
        
        # Prepare output
        output = {
            'success': True,
            'result': predictions
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
