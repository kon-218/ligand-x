#!/usr/bin/env python3
"""
Ligand-X Benchmark Runner

Execute computational chemistry benchmarks to validate Ligand-X protocols
against experimental data.

Usage:
    python run_benchmark.py --benchmark t4l99a_benzene
    python run_benchmark.py --benchmark t4l99a_benzene --skip-docking --skip-abfe
    python run_benchmark.py --list-benchmarks
"""

import asyncio
import argparse
import logging
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from scripts.benchmarks.config import (
    BenchmarkConfig,
    API_BASE_URL,
    list_available_benchmarks
)
from scripts.benchmarks.stages import (
    run_docking_stage,
    run_rbfe_stage,
    run_abfe_stage,
    run_comparison_stage
)
from scripts.benchmarks.utils import generate_reports

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('benchmark_run.log')
    ]
)

logger = logging.getLogger(__name__)


async def run_benchmark(
    benchmark_name: str,
    run_name: Optional[str] = None,
    api_base_url: str = API_BASE_URL,
    skip_docking: bool = False,
    skip_rbfe: bool = False,
    skip_abfe: bool = False,
    output_formats: List[str] = None,
    force_refresh: bool = False
):
    """
    Execute complete benchmark suite.

    Args:
        benchmark_name: Name of benchmark to run (e.g., "t4l99a_benzene")
        run_name: Optional custom name for this run
        api_base_url: Base URL for Ligand-X API
        skip_docking: Skip docking validation stage
        skip_rbfe: Skip RBFE validation stage
        skip_abfe: Skip ABFE validation stage
        output_formats: List of report formats ("json", "html", "pdf")
        force_refresh: Re-fetch all PDB structures
    """
    if output_formats is None:
        output_formats = ["json", "html"]

    # Generate run ID
    run_id = run_name or f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    logger.info("=" * 80)
    logger.info(f"Ligand-X Benchmark: {benchmark_name}")
    logger.info(f"Run ID: {run_id}")
    logger.info(f"API: {api_base_url}")
    logger.info("=" * 80)

    # Load benchmark configuration
    try:
        config = BenchmarkConfig(benchmark_name)
    except Exception as e:
        logger.error(f"Failed to load benchmark configuration: {e}")
        return

    # Initialize results storage
    results = {
        "benchmark_name": benchmark_name,
        "run_id": run_id,
        "timestamp": datetime.now().isoformat(),
        "settings": {
            "docking": config.get_docking_settings(),
            "rbfe": config.get_rbfe_settings(),
            "abfe": config.get_abfe_settings()
        }
    }

    # Run docking stage
    docking_results = None
    if not skip_docking:
        try:
            docking_results = await run_docking_stage(
                config,
                api_base_url,
                force_refresh=force_refresh
            )
            results["docking"] = docking_results
        except Exception as e:
            logger.error(f"Docking stage failed: {e}", exc_info=True)
            results["docking"] = {"error": str(e)}

    # Run RBFE stage
    rbfe_results = None
    if not skip_rbfe:
        try:
            rbfe_results = await run_rbfe_stage(
                config,
                api_base_url,
                docking_results=docking_results.get("results") if docking_results else None
            )
            results["rbfe"] = rbfe_results
        except Exception as e:
            logger.error(f"RBFE stage failed: {e}", exc_info=True)
            results["rbfe"] = {"error": str(e)}

    # Run ABFE stage
    abfe_results = None
    if not skip_abfe:
        try:
            # Determine best ligand from RBFE or experimental data
            best_ligand = None
            if rbfe_results and rbfe_results.get("transformations"):
                # Find ligand with best predicted ΔΔG
                transformations = rbfe_results["transformations"]
                if transformations:
                    best_trans = min(transformations, key=lambda x: x["predicted_ddG"])
                    best_ligand = best_trans["ligand_b"]

            abfe_results = await run_abfe_stage(
                config,
                api_base_url,
                best_ligand=best_ligand,
                docking_results=docking_results.get("results") if docking_results else None
            )
            results["abfe"] = abfe_results
        except Exception as e:
            logger.error(f"ABFE stage failed: {e}", exc_info=True)
            results["abfe"] = {"error": str(e)}

    # Run comparison stage
    try:
        comparison = await run_comparison_stage(
            docking_results or {},
            rbfe_results or {},
            abfe_results or {}
        )
        results["comparison"] = comparison
    except Exception as e:
        logger.error(f"Comparison stage failed: {e}", exc_info=True)
        results["comparison"] = {"error": str(e)}

    # Generate reports
    logger.info("=" * 80)
    logger.info("Generating reports")
    logger.info("=" * 80)

    try:
        generated_reports = generate_reports(
            benchmark_name,
            run_id,
            config.output_dir,
            results,
            formats=output_formats
        )

        logger.info("Reports generated:")
        for format_type, filepath in generated_reports.items():
            logger.info(f"  {format_type.upper()}: {filepath}")

    except Exception as e:
        logger.error(f"Report generation failed: {e}", exc_info=True)

    # Print summary
    logger.info("=" * 80)
    logger.info("BENCHMARK SUMMARY")
    logger.info("=" * 80)

    if results.get("docking") and not results["docking"].get("error"):
        metrics = results["docking"].get("metrics", {})
        if metrics.get("n_total", 0) > 0:
            logger.info(f"Docking: {metrics['n_successful']}/{metrics['n_total']} successful "
                       f"({metrics['success_rate']*100:.1f}%)")

    if results.get("rbfe") and not results["rbfe"].get("error"):
        metrics = results["rbfe"]["metrics"]
        logger.info(f"RBFE: r={metrics.get('pearson_r', 0):.3f}, "
                   f"RMSE={metrics.get('rmse', 0):.2f} kcal/mol")

    if results.get("abfe") and not results["abfe"].get("error"):
        metrics = results["abfe"]["metrics"]
        logger.info(f"ABFE: error={metrics.get('abs_error', 0):.2f} kcal/mol")

    if results.get("comparison"):
        comp = results["comparison"]
        if not comp.get("error"):
            overall = comp["overall_summary"]
            logger.info(f"\nOverall Assessment: {overall['overall_assessment']}")

    logger.info("=" * 80)
    logger.info("Benchmark complete!")
    logger.info("=" * 80)


def main():
    """Main entry point for benchmark runner."""
    parser = argparse.ArgumentParser(
        description="Run Ligand-X computational chemistry benchmarks",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run full T4L99A benchmark
  python run_benchmark.py --benchmark t4l99a_benzene

  # Run only RBFE validation
  python run_benchmark.py --benchmark t4l99a_benzene --skip-docking --skip-abfe

  # Custom run name and formats
  python run_benchmark.py --benchmark t4l99a_benzene --run-name "test_v1" --formats json html

  # List available benchmarks
  python run_benchmark.py --list-benchmarks
        """
    )

    parser.add_argument(
        "--benchmark",
        type=str,
        help="Benchmark name to run (e.g., t4l99a_benzene)"
    )

    parser.add_argument(
        "--run-name",
        type=str,
        help="Custom name for this run (default: auto-generated)"
    )

    parser.add_argument(
        "--api-url",
        type=str,
        default=API_BASE_URL,
        help=f"Ligand-X API base URL (default: {API_BASE_URL})"
    )

    parser.add_argument(
        "--skip-docking",
        action="store_true",
        help="Skip docking validation stage"
    )

    parser.add_argument(
        "--skip-rbfe",
        action="store_true",
        help="Skip RBFE validation stage"
    )

    parser.add_argument(
        "--skip-abfe",
        action="store_true",
        help="Skip ABFE validation stage"
    )

    parser.add_argument(
        "--formats",
        nargs="+",
        choices=["json", "html", "pdf"],
        default=["json", "html"],
        help="Report formats to generate (default: json html)"
    )

    parser.add_argument(
        "--force-refresh",
        action="store_true",
        help="Re-fetch all PDB structures even if cached"
    )

    parser.add_argument(
        "--list-benchmarks",
        action="store_true",
        help="List available benchmark systems"
    )

    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging"
    )

    args = parser.parse_args()

    # Configure logging level
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # List benchmarks if requested
    if args.list_benchmarks:
        list_available_benchmarks()
        return

    # Validate benchmark name
    if not args.benchmark:
        parser.error("--benchmark is required (or use --list-benchmarks)")

    # Run benchmark
    asyncio.run(run_benchmark(
        benchmark_name=args.benchmark,
        run_name=args.run_name,
        api_base_url=args.api_url,
        skip_docking=args.skip_docking,
        skip_rbfe=args.skip_rbfe,
        skip_abfe=args.skip_abfe,
        output_formats=args.formats,
        force_refresh=args.force_refresh
    ))


if __name__ == "__main__":
    main()
