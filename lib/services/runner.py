"""
Service Runner Utility

This utility helps execute Python code in the appropriate conda environment
for each service. Since Python cannot import from multiple conda environments
at runtime, services can be run as subprocesses in their respective environments.

Usage:
    from lib.services.runner import run_in_env
    
    result = run_in_env('biochem-md', 'python', '-c', 'import openmm; print("OK")')
"""

import subprocess
import os
import sys
import threading
import logging
from pathlib import Path
from typing import List, Optional, Dict, Any
import json

logger = logging.getLogger(__name__)


# Map service names to environment names
SERVICE_ENVIRONMENTS = {
    'md': 'biochem-md',
    'admet': 'biochem-admet',
    'abfe': 'biochem-md',
    'rbfe': 'biochem-md',
    'rbfe_mapping_preview': 'biochem-md',
    'boltz2': 'biochem-boltz2',
    'docking': 'biochem-docking',
    'qc': 'biochem-qc',
    'base': 'biochem-base',
}


def get_conda_base() -> str:
    """Get the conda base directory."""
    try:
        result = subprocess.run(
            ['conda', 'info', '--base'],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        raise RuntimeError("conda not found. Please install Miniconda or Anaconda.")


def get_env_python(env_name: str) -> str:
    """Get the Python executable path for a conda environment."""
    conda_base = get_conda_base()
    if sys.platform == 'win32':
        python_path = Path(conda_base) / 'envs' / env_name / 'python.exe'
    else:
        python_path = Path(conda_base) / 'envs' / env_name / 'bin' / 'python'
    
    if not python_path.exists():
        raise RuntimeError(f"Environment '{env_name}' not found. Please install it first.")
    
    return str(python_path)


def _get_cuda_home_for_env(env_name: str) -> Optional[str]:
    """Get CUDA_HOME path for a conda environment by finding nvcc."""
    try:
        conda_base = get_conda_base()
        env_path = Path(conda_base) / 'envs' / env_name
        nvcc_path = env_path / 'bin' / 'nvcc'
        
        if nvcc_path.exists():
            # CUDA_HOME should be the parent of bin (i.e., the environment root)
            # But we need to check if headers exist
            # For conda, CUDA headers might be in targets/x86_64-linux/include
            targets_include = env_path / 'targets' / 'x86_64-linux' / 'include'
            if targets_include.exists():
                # Return the targets directory as CUDA_HOME
                return str(env_path / 'targets' / 'x86_64-linux')
            # Fallback: return environment root
            return str(env_path)
    except Exception as e:
        logger.debug("CUDA detection failed: %s", e)
    return None



def run_service_script(
    service: str,
    script_path: str,
    args: Optional[List[str]] = None,
    timeout: Optional[int] = None,
    **kwargs: Any
) -> Dict[str, Any]:
    """
    Run a service entrypoint script in the appropriate environment.
    
    This is the recommended way to call services. Each service should have
    an entrypoint script that accepts JSON input and returns JSON output.
    
    Args:
        service: Service name (md, admet, boltz2, docking, qc)
        script_path: Path to service entrypoint script (relative to project root)
        args: Arguments to pass to the script
        timeout: Timeout in seconds (None for no timeout)
        **kwargs: Additional subprocess.run arguments
    
    Returns:
        Dictionary with service results
    
    Example:
        result = run_service_script(
            'md',
            'services/md/run_md_job.py',
            ['--input', 'input.json']
        )
    """
    if service not in SERVICE_ENVIRONMENTS:
        raise ValueError(f"Unknown service: {service}. Available: {list(SERVICE_ENVIRONMENTS.keys())}")
    
    env_name = SERVICE_ENVIRONMENTS[service]
    
    # Check if environment exists
    if not check_env_exists(env_name):
        raise RuntimeError(
            f"Environment '{env_name}' not found. "
            f"In Docker, ensure the service container is running. "
            f"For local development, use: docker-compose up -d {service}"
        )
    
    # Resolve script path relative to project root
    project_root = Path(__file__).parent.parent.parent
    full_script_path = project_root / script_path
    
    if not full_script_path.exists():
        raise FileNotFoundError(f"Service script not found: {full_script_path}")
    
    # Run the script with real-time stderr streaming
    import logging
    
    logger = logging.getLogger(__name__)
    logger.info(f"Running service script: {script_path} in environment: {env_name}")
    logger.debug(f"Script arguments: {args}")
    logger.debug(f"Timeout: {timeout} seconds")
    
    # Use Popen to stream stderr in real-time while capturing stdout for JSON
    cmd = ['conda', 'run', '-n', env_name, '--no-capture-output', 'python', str(full_script_path)]
    if args:
        cmd.extend(args)
    
    # Get project root for cwd
    project_root = Path(__file__).parent.parent.parent
    
    # Prepare environment (reuse logic from run_in_env)
    process_env = os.environ.copy()
    if env_name in ['biochem-boltz2']:
        cuda_home = _get_cuda_home_for_env(env_name)
        if cuda_home and (not process_env.get('CUDA_HOME') or process_env.get('CUDA_HOME') == '/usr/bin/cuda'):
            process_env['CUDA_HOME'] = cuda_home
    
    # Start process with Popen to stream stderr
    process = subprocess.Popen(
        cmd,
        cwd=str(project_root),
        env=process_env,
        stdout=subprocess.PIPE,  # Capture stdout for JSON
        stderr=subprocess.PIPE,  # Capture stderr but stream it
        text=True,
        encoding='utf-8',  # Explicitly use UTF-8 to handle special characters (e.g. checkmarks)
        errors='replace',  # Replace invalid characters instead of crashing
        bufsize=1,  # Line buffered
        **kwargs
    )
    
    # Capture stdout for JSON parsing
    stdout_lines = []
    stderr_lines = []
    
    def read_stdout():
        """Read stdout line by line and store for JSON parsing."""
        for line in process.stdout:
            stdout_lines.append(line)
    
    def read_stderr():
        """Read stderr line by line and log in real-time."""
        for line in process.stderr:
            stderr_lines.append(line)
            # Extract just the message part to avoid double timestamp formatting
            # MD service logs format: "TIMESTAMP - LOGGER - LEVEL - MESSAGE"
            line_stripped = line.rstrip('\n\r')
            if line_stripped:  # Only log non-empty lines
                # Try to extract message part (everything after the level)
                # Format: "YYYY-MM-DD HH:MM:SS,mmm - logger.name - LEVEL - message"
                parts = line_stripped.split(' - ', 3)
                if len(parts) >= 4:
                    # Extract just the message part
                    message = parts[3]
                    logger.info(f"[{service} service] {message}")
                else:
                    # Fallback: log the whole line if format is unexpected
                    logger.info(f"[{service} service] {line_stripped}")
    
    # Start threads to read stdout and stderr
    stdout_thread = threading.Thread(target=read_stdout, daemon=True)
    stderr_thread = threading.Thread(target=read_stderr, daemon=True)
    stdout_thread.start()
    stderr_thread.start()
    
    # Wait for process to complete
    try:
        returncode = process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
        logger.error(f"Service script timed out after {timeout} seconds")
        raise TimeoutError(f"Service script timed out after {timeout} seconds")
    
    # Wait for threads to finish reading
    stdout_thread.join(timeout=1)
    stderr_thread.join(timeout=1)
    
    # Combine captured output
    stdout = ''.join(stdout_lines)
    stderr = ''.join(stderr_lines)
    
    # Create CompletedProcess-like result
    result = subprocess.CompletedProcess(
        args=cmd,
        returncode=returncode,
        stdout=stdout,
        stderr=stderr
    )
    
    logger.info(f"Service script completed with return code: {result.returncode}")
    if result.returncode != 0 and result.stderr:
        logger.error(f"Service script failed. Last 500 chars of stderr: {result.stderr[-500:]}")
    
    # Parse JSON output from stdout
    if result.returncode != 0:
        error_msg = result.stderr if result.stderr else "Unknown error"
        stdout_msg = result.stdout if result.stdout else ""
        
        # Try to parse error as JSON first
        try:
            error_data = json.loads(error_msg)
            error_detail = error_data.get('error', error_msg)
            traceback_detail = error_data.get('traceback', '')
            full_error = f"Service error: {error_detail}"
            if traceback_detail:
                full_error += f"\n\nFull traceback:\n{traceback_detail}"
            raise RuntimeError(full_error)
        except json.JSONDecodeError:
            # If not JSON, include both stdout and stderr for debugging
            full_error = f"Service failed with exit code {result.returncode}"
            if error_msg:
                full_error += f"\n\nSTDERR:\n{error_msg}"
            if stdout_msg:
                full_error += f"\n\nSTDOUT:\n{stdout_msg[:2000]}"  # Show more output
            raise RuntimeError(full_error)
    
    # Parse JSON result
    try:
        # Try to parse the entire output first
        output_data = json.loads(result.stdout)
    except json.JSONDecodeError:
        # If that fails, try to find JSON object in the output
        # This handles cases where there's debug output before the JSON
        stdout = result.stdout
        
        # Find the LAST top-level JSON object by searching for the last '{"success"'
        # which is the expected format from service scripts
        json_start = stdout.rfind('{\n  "success"')
        if json_start == -1:
            json_start = stdout.rfind('{"success"')
        if json_start == -1:
            # Fall back to finding the last '{' that starts a line (likely JSON output)
            # Look for newline followed by '{' to find top-level JSON
            last_newline_brace = stdout.rfind('\n{')
            if last_newline_brace != -1:
                json_start = last_newline_brace + 1
            else:
                json_start = stdout.rfind('{')
        
        if json_start == -1:
            raise RuntimeError(
                f"Failed to parse service output as JSON: No JSON object found\n"
                f"STDOUT (first 2000 chars):\n{stdout[:2000]}\n"
                f"STDERR (first 2000 chars):\n{result.stderr[:2000] if result.stderr else 'None'}"
            )
        
        # Find the matching closing brace by counting braces
        brace_count = 0
        json_end = json_start
        in_string = False
        escape_next = False
        
        for i, char in enumerate(stdout[json_start:], start=json_start):
            if escape_next:
                escape_next = False
                continue
            if char == '\\' and in_string:
                escape_next = True
                continue
            if char == '"' and not escape_next:
                in_string = not in_string
                continue
            if in_string:
                continue
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    json_end = i + 1
                    break
        
        json_str = stdout[json_start:json_end]
        
        try:
            output_data = json.loads(json_str)
        except json.JSONDecodeError as e:
            raise RuntimeError(
                f"Failed to parse service output as JSON: {e}\n"
                f"STDOUT (first 2000 chars):\n{stdout[:2000]}\n"
                f"STDERR (first 2000 chars):\n{result.stderr[:2000] if result.stderr else 'None'}"
            )
    
    if not output_data.get('success', True):
        error_detail = output_data.get('error', 'Unknown error')
        traceback_detail = output_data.get('traceback', '')
        full_error = f"Service error: {error_detail}"
        if traceback_detail:
            full_error += f"\n\nFull traceback:\n{traceback_detail}"
        raise RuntimeError(full_error)
    return output_data


def check_env_exists(env_name: str) -> bool:
    """Check if a conda environment exists."""
    try:
        result = subprocess.run(
            ['conda', 'env', 'list'],
            capture_output=True,
            text=True,
            check=True
        )
        return env_name in result.stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False



def call_service(
    service: str,
    input_data: Dict[str, Any],
    timeout: Optional[int] = None
) -> Dict[str, Any]:
    """
    High-level function to call a service with JSON input data.
    
    This is the main function Flask routes should use. It handles:
    - Creating temporary input file
    - Running the service script
    - Parsing JSON output
    - Error handling
    
    Args:
        service: Service name (md, admet, boltz2, docking, qc)
        input_data: Dictionary with input parameters
        timeout: Timeout in seconds (None for no timeout)
    
    Returns:
        Dictionary with service results
    
    Example:
        result = call_service('md', {
            'protein_pdb_data': '...',
            'ligand_smiles': 'CCO',
            'system_id': 'test'
        })
    """
    import tempfile
    import logging
    
    logger = logging.getLogger(__name__)
    logger.info(f"=== CALLING SERVICE: {service} ===")
    logger.info(f"Input data keys: {list(input_data.keys())}")
    if 'system_id' in input_data:
        logger.info(f"System ID: {input_data['system_id']}")
    logger.info(f"Timeout: {timeout} seconds")
    
    # Map service names to script paths
    service_scripts = {
        'md': 'services/md/run_md_job.py',
        'admet': 'services/admet/run_admet_job.py',
        'abfe': 'services/abfe/run_abfe_job.py',
        'rbfe': 'services/rbfe/run_rbfe_job.py',
        'rbfe_mapping_preview': 'services/rbfe/run_mapping_preview_job.py',
        'boltz2': 'services/boltz2/run_boltz2_job.py',
        'docking': 'services/docking/run_docking_job.py',
    }

    if service not in service_scripts:
        raise ValueError(f"Unknown service: {service}. Available: {list(service_scripts.keys())}")

    script_path = service_scripts[service]

    # Create temporary input file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(input_data, f)
        input_file = f.name
    logger.debug(f"Created temporary input file: {input_file}")
    
    try:
        # Run the service script
        logger.info(f"Executing service script: {script_path}")
        result = run_service_script(
            service=service,
            script_path=script_path,
            args=['--input', input_file],
            timeout=timeout
        )
        logger.info(f"Service {service} execution completed successfully")
        return result
    except Exception as e:
        logger.error(f"Service {service} execution failed: {str(e)}")
        raise
    finally:
        # Clean up temp file
        try:
            os.unlink(input_file)
            logger.debug(f"Cleaned up temporary input file: {input_file}")
        except Exception as e:
            logger.warning(f"Failed to clean up temp file {input_file}: {e}")


def call_service_with_progress(
    service: str,
    input_data: Dict[str, Any],
    timeout: Optional[int] = None
):
    """
    Generator function to call a service and yield progress updates.
    
    This function yields progress updates as they are emitted by the service,
    and finally yields the result when the service completes.
    
    Progress updates are identified by the MD_PROGRESS: prefix in stderr.
    
    Args:
        service: Service name (md, admet, boltz2, docking, qc)
        input_data: Dictionary with input parameters
        timeout: Timeout in seconds (None for no timeout)
    
    Yields:
        Dict with either:
        - {"type": "progress", "data": {...}} for progress updates
        - {"type": "result", "data": {...}} for final result
        - {"type": "error", "data": {...}} for errors
    
    Example:
        for update in call_service_with_progress('md', input_data):
            if update['type'] == 'progress':
                print(f"Progress: {update['data']['progress']}%")
            elif update['type'] == 'result':
                print(f"Done: {update['data']}")
    """
    import tempfile
    import queue
    import logging
    
    logger = logging.getLogger(__name__)
    logger.info(f"=== CALLING SERVICE WITH PROGRESS: {service} ===")
    
    # Map service names to script paths
    service_scripts = {
        'md': 'services/md/run_md_job.py',
        'admet': 'services/admet/run_admet_job.py',
        'abfe': 'services/abfe/run_abfe_job.py',
        'rbfe': 'services/rbfe/run_rbfe_job.py',
        'rbfe_mapping_preview': 'services/rbfe/run_mapping_preview_job.py',
        'boltz2': 'services/boltz2/run_boltz2_job.py',
        'docking': 'services/docking/run_docking_job.py',
    }

    if service not in service_scripts:
        yield {"type": "error", "data": {"error": f"Unknown service: {service}"}}
        return
    
    env_name = SERVICE_ENVIRONMENTS[service]
    if not check_env_exists(env_name):
        yield {"type": "error", "data": {"error": f"Environment '{env_name}' not found"}}
        return
    
    script_path = service_scripts[service]
    project_root = Path(__file__).parent.parent.parent
    full_script_path = project_root / script_path
    
    if not full_script_path.exists():
        yield {"type": "error", "data": {"error": f"Service script not found: {full_script_path}"}}
        return
    
    # Create temporary input file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(input_data, f)
        input_file = f.name
    
    # Build command
    cmd = ['conda', 'run', '-n', env_name, '--no-capture-output', 'python', str(full_script_path), '--input', input_file]
    
    # Prepare environment
    process_env = os.environ.copy()
    
    # Queue for progress updates
    progress_queue = queue.Queue()
    stdout_lines = []
    stderr_lines = []
    
    try:
        # Start process
        process = subprocess.Popen(
            cmd,
            cwd=str(project_root),
            env=process_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            errors='replace',
            bufsize=1,
        )
        
        def read_stdout():
            for line in process.stdout:
                stdout_lines.append(line)
        
        def read_stderr():
            import re
            
            # Track ABFE progress state
            # ABFE workflow: OpenFE runs Solvent leg FIRST, then Complex leg.
            # Per leg:
            #   1. Partial Charges (AM1-BCC) - ~2% of leg
            #   2. MD Optimization (minimization, NPT, NVT) - ~10% of leg
            #   3. Equilibration HREX - ~20% of leg
            #   4. Production HREX - ~66% of leg
            # Total: Solvent (Leg 1) = 0-50%, Complex (Leg 2) = 50-100%
            abfe_state = {
                'current_leg': None,  # 'solvent' or 'complex'
                'leg_count': 0,       # How many legs have started (0, 1, or 2)
                'phase': 'setup',     # 'setup', 'charges', 'minimization', 'npt', 'nvt', 'equil_hrex', 'prod_hrex'
                'current_iteration': 0,
                'total_iterations': 0,
                'estimated_time': None,
                'last_progress': 0,
            }
            
            # Progress allocation per leg (each leg = 50% of total)
            # Leg 1 (Solvent): 0-49%, Leg 2 (Complex): 50-99%
            # Within each leg:
            #   - Setup/Charges: 0-4% of leg
            #   - MD Optimization (minimization, NPT, NVT): 4-14% of leg
            #   - Equilibration HREX: 14-34% of leg (20% of leg)
            #   - Production HREX: 34-100% of leg (66% of leg)
            def calc_progress(leg_num, phase, phase_progress=0):
                """Calculate overall progress given leg number and phase progress."""
                leg_base = (leg_num - 1) * 50  # Leg 1 (Solvent): 0-49%, Leg 2 (Complex): 50-99%
                
                if phase == 'setup':
                    raw = leg_base + 1
                elif phase == 'charges':
                    raw = leg_base + 2 + phase_progress * 2  # 2-4%
                elif phase in ('minimization', 'npt', 'nvt', 'md_optimization'):
                    raw = leg_base + 4 + phase_progress * 10  # 4-14%
                elif phase == 'equil_hrex':
                    raw = leg_base + 14 + phase_progress * 20  # 14-34%
                elif phase == 'prod_hrex':
                    raw = leg_base + 34 + phase_progress * 65  # 34-99%
                else:
                    raw = leg_base
                return min(int(raw), 99)  # Clamp to 99%; 100% set on completion
            
            for line in process.stderr:
                stderr_lines.append(line)
                line_stripped = line.rstrip('\n\r')
                if line_stripped:
                    # Check for explicit progress update (MD_PROGRESS: prefix)
                    if line_stripped.startswith('MD_PROGRESS:'):
                        try:
                            progress_json = line_stripped[len('MD_PROGRESS:'):]
                            progress_data = json.loads(progress_json)
                            progress_queue.put({"type": "progress", "data": progress_data})
                        except json.JSONDecodeError:
                            pass
                    # Parse ABFE-specific progress from log messages
                    elif service == 'abfe':
                        # Extract message part from log format
                        parts = line_stripped.split(' - ', 3)
                        message = parts[3] if len(parts) >= 4 else line_stripped
                        message_lower = message.lower()
                        
                        # Detect which leg we're on (Solvent runs first, then Complex)
                        if 'absolutebindingsolventunit' in message_lower or ('solvent' in message_lower and 'leg' not in message_lower):
                            if abfe_state['current_leg'] != 'solvent':
                                abfe_state['current_leg'] = 'solvent'
                                abfe_state['leg_count'] = 1
                                abfe_state['phase'] = 'setup'
                                logger.info(f"[ABFE] Starting Solvent leg (Leg 1/2)")
                        elif 'absolutebindingcomplexunit' in message_lower or 'complex' in message_lower:
                            if abfe_state['current_leg'] != 'complex':
                                abfe_state['current_leg'] = 'complex'
                                abfe_state['leg_count'] = 2
                                abfe_state['phase'] = 'setup'
                                logger.info(f"[ABFE] Starting Complex leg (Leg 2/2)")
                        
                        leg_num = abfe_state['leg_count'] if abfe_state['leg_count'] > 0 else 1
                        leg_name = abfe_state['current_leg'] or 'solvent'
                        leg_display = f"{'Complex' if leg_name == 'complex' else 'Solvent'} ({leg_num}/2)"
                        
                        # Detect partial charge assignment
                        if 'assign' in message_lower and 'charge' in message_lower:
                            abfe_state['phase'] = 'charges'
                            progress = calc_progress(leg_num, 'charges', 0.5)
                            abfe_state['last_progress'] = progress
                            progress_queue.put({"type": "progress", "data": {
                                "progress": progress,
                                "status": f"{leg_display}: Assigning partial charges",
                                "phase": "charges",
                                "leg": leg_name,
                                "leg_num": leg_num,
                            }})
                        
                        # Detect MD Optimization (minimization, NPT, NVT combined)
                        elif 'minimi' in message_lower or \
                             ('npt' in message_lower and ('equil' in message_lower or 'running' in message_lower)) or \
                             ('nvt' in message_lower and ('equil' in message_lower or 'running' in message_lower)):
                            abfe_state['phase'] = 'md_optimization'
                            progress = calc_progress(leg_num, 'md_optimization', 0.5)
                            abfe_state['last_progress'] = progress
                            
                            # Determine which MD step
                            md_step = 'MD Optimization'
                            if 'minimi' in message_lower:
                                md_step = 'Minimization'
                            elif 'npt' in message_lower:
                                md_step = 'NPT Equilibration'
                            elif 'nvt' in message_lower:
                                md_step = 'NVT Equilibration'
                            
                            progress_queue.put({"type": "progress", "data": {
                                "progress": progress,
                                "status": f"{leg_display}: {md_step}",
                                "phase": "md_optimization",
                                "leg": leg_name,
                                "leg_num": leg_num,
                            }})
                        
                        # Parse equilibration HREX iterations: "Equilibration iteration 5/40"
                        eq_match = re.search(r'[Ee]quilibration\s+iteration\s+(\d+)/(\d+)', message)
                        if eq_match:
                            current = int(eq_match.group(1))
                            total = int(eq_match.group(2))
                            abfe_state['phase'] = 'equil_hrex'
                            abfe_state['current_iteration'] = current
                            abfe_state['total_iterations'] = total
                            phase_progress = current / total if total > 0 else 0
                            progress = calc_progress(leg_num, 'equil_hrex', phase_progress)
                            abfe_state['last_progress'] = progress
                            progress_queue.put({"type": "progress", "data": {
                                "progress": progress,
                                "status": f"{leg_display}: Equilibration HREX {current}/{total}",
                                "phase": "equil_hrex",
                                "leg": leg_name,
                                "leg_num": leg_num,
                                "current_iteration": current,
                                "total_iterations": total,
                            }})
                        
                        # Parse production HREX iterations: "Iteration 50/200" or "Production iteration 50/200"
                        # Must not match equilibration iterations
                        prod_match = re.search(r'(?<!equilibration\s)(?:production\s+)?[Ii]teration\s+(\d+)/(\d+)', message)
                        if prod_match and 'equilibration' not in message_lower:
                            current = int(prod_match.group(1))
                            total = int(prod_match.group(2))
                            abfe_state['phase'] = 'prod_hrex'
                            abfe_state['current_iteration'] = current
                            abfe_state['total_iterations'] = total
                            phase_progress = current / total if total > 0 else 0
                            progress = calc_progress(leg_num, 'prod_hrex', phase_progress)
                            abfe_state['last_progress'] = progress
                            progress_queue.put({"type": "progress", "data": {
                                "progress": progress,
                                "status": f"{leg_display}: Production HREX {current}/{total}",
                                "phase": "prod_hrex",
                                "leg": leg_name,
                                "leg_num": leg_num,
                                "current_iteration": current,
                                "total_iterations": total,
                            }})
                        
                        # Parse estimated time: "Estimated completion in 0:15:30" or similar
                        time_match = re.search(r'[Ee]stimated.*?(\d+:\d+:\d+)', message)
                        if time_match:
                            abfe_state['estimated_time'] = time_match.group(1)
                            # Update progress with estimated time
                            progress_queue.put({"type": "progress", "data": {
                                "progress": abfe_state['last_progress'],
                                "status": f"{leg_display}: ETA {abfe_state['estimated_time']}",
                                "phase": abfe_state['phase'],
                                "leg": leg_name,
                                "leg_num": leg_num,
                                "estimated_time": abfe_state['estimated_time'],
                            }})
                        
                        # Detect setup phase messages (only if we haven't started a specific phase)
                        setup_keywords = ['parameteriz', 'creating', 'loading', 'preparing', 'setting up', 'building']
                        if any(kw in message_lower for kw in setup_keywords) and abfe_state['phase'] == 'setup':
                            progress = calc_progress(leg_num, 'setup')
                            abfe_state['last_progress'] = progress
                            progress_queue.put({"type": "progress", "data": {
                                "progress": progress,
                                "status": f"{leg_display}: {message[:80]}",
                                "phase": "setup",
                                "leg": leg_name,
                                "leg_num": leg_num,
                            }})
                        
                        # Log the message
                        logger.info(f"[{service} service] {message}")
                    else:
                        # Log non-progress messages for other services
                        parts = line_stripped.split(' - ', 3)
                        if len(parts) >= 4:
                            logger.info(f"[{service} service] {parts[3]}")
                        else:
                            logger.info(f"[{service} service] {line_stripped}")
        
        # Start reader threads
        stdout_thread = threading.Thread(target=read_stdout, daemon=True)
        stderr_thread = threading.Thread(target=read_stderr, daemon=True)
        stdout_thread.start()
        stderr_thread.start()
        
        # Poll for progress updates while process runs
        while process.poll() is None:
            try:
                update = progress_queue.get(timeout=0.1)
                yield update
            except queue.Empty:
                pass
        
        # Process finished, drain remaining progress updates
        while not progress_queue.empty():
            try:
                update = progress_queue.get_nowait()
                yield update
            except queue.Empty:
                break
        
        # Wait for threads to finish - use longer timeout for large outputs
        # ABFE calculations can produce large JSON outputs that take time to drain
        stdout_thread.join(timeout=30)
        stderr_thread.join(timeout=30)
        
        # If threads are still alive, force read any remaining data
        if stdout_thread.is_alive():
            logger.warning(f"Stdout thread still alive after 30s timeout for {service}")
        if stderr_thread.is_alive():
            logger.warning(f"Stderr thread still alive after 30s timeout for {service}")
        
        # Get result
        stdout = ''.join(stdout_lines)
        stderr = ''.join(stderr_lines)
        
        if process.returncode != 0:
            error_msg = stderr if stderr else "Unknown error"
            yield {"type": "error", "data": {"success": False, "error": error_msg}}
            return
        
        # Parse JSON result
        if not stdout.strip():
            # stdout is empty - log what we have and try to diagnose
            logger.error(f"Service {service} produced empty stdout. Process returncode: {process.returncode}")
            logger.error(f"Stderr length: {len(stderr)} chars")
            logger.error(f"Last 500 chars of stderr: {stderr[-500:] if stderr else 'empty'}")
            
            # Check if stderr contains the result (some scripts might write there by mistake)
            # Also check if we can extract any useful info
            yield {"type": "error", "data": {
                "success": False, 
                "error": f"Service produced empty output (stdout empty). Check worker logs for details.",
                "stderr_tail": stderr[-1000:] if stderr else None
            }}
        else:
            try:
                output_data = json.loads(stdout)
                yield {"type": "result", "data": output_data}
            except json.JSONDecodeError as e:
                # Try to find JSON in stdout (might have extra output before it)
                json_start = stdout.rfind('{\n  "success"')
                if json_start == -1:
                    json_start = stdout.rfind('{"success"')
                if json_start == -1:
                    json_start = stdout.rfind('\n{')
                    if json_start != -1:
                        json_start += 1
                    else:
                        json_start = stdout.rfind('{')
                
                if json_start >= 0:
                    # Try to parse from this position
                    try:
                        output_data = json.loads(stdout[json_start:])
                        yield {"type": "result", "data": output_data}
                    except json.JSONDecodeError:
                        logger.error(f"Failed to parse JSON from stdout[{json_start}:]. First 200 chars: {stdout[json_start:json_start+200]}")
                        yield {"type": "error", "data": {"success": False, "error": f"Failed to parse service output: {e}"}}
                else:
                    logger.error(f"Failed to find JSON in stdout. First 500 chars: {stdout[:500]}")
                    yield {"type": "error", "data": {"success": False, "error": f"Failed to parse service output: {e}"}}
    
    except Exception as e:
        import traceback
        yield {"type": "error", "data": {"success": False, "error": str(e), "traceback": traceback.format_exc()}}
    
    finally:
        # Clean up temp file
        try:
            os.unlink(input_file)
        except Exception:
            pass

