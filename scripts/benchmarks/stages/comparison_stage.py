"""Comparison stage: Compare computational results to experimental data."""

from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)


async def run_comparison_stage(
    docking_results: Dict[str, Any],
    rbfe_results: Dict[str, Any],
    abfe_results: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Compare all computational results to experimental data.

    Generates summary comparison metrics and identifies
    areas of agreement/disagreement.

    Args:
        docking_results: Docking stage results
        rbfe_results: RBFE stage results
        abfe_results: ABFE stage results

    Returns:
        Dictionary with comparison summary
    """
    logger.info("=== Starting Comparison Stage ===")

    comparison = {
        "overall_summary": {},
        "docking_summary": {},
        "rbfe_summary": {},
        "abfe_summary": {}
    }

    # Docking summary
    if docking_results and docking_results.get("metrics"):
        metrics = docking_results["metrics"]
        comparison["docking_summary"] = {
            "success_rate": metrics.get("success_rate", 0),
            "mean_rmsd": metrics.get("rmsd_mean", 0),
            "n_successful": metrics.get("n_successful", 0),
            "n_total": metrics.get("n_total", 0),
            "assessment": "PASS" if metrics.get("success_rate", 0) >= 0.7 else "FAIL"
        }

        logger.info(f"Docking: {comparison['docking_summary']['assessment']} "
                   f"(success rate: {metrics.get('success_rate', 0)*100:.1f}%)")

    # RBFE summary
    if rbfe_results and rbfe_results.get("metrics"):
        metrics = rbfe_results["metrics"]
        comparison["rbfe_summary"] = {
            "pearson_r": metrics.get("pearson_r", 0),
            "rmse": metrics.get("rmse", 0),
            "mae": metrics.get("mae", 0),
            "n_transformations": metrics.get("n_comparable", 0),
            "assessment": "PASS" if (metrics.get("pearson_r", 0) >= 0.7 and
                                    metrics.get("rmse", 10) <= 2.0) else "FAIL"
        }

        logger.info(f"RBFE: {comparison['rbfe_summary']['assessment']} "
                   f"(r={metrics.get('pearson_r', 0):.2f}, "
                   f"RMSE={metrics.get('rmse', 0):.2f} kcal/mol)")

    # ABFE summary
    if abfe_results and abfe_results.get("metrics"):
        metrics = abfe_results["metrics"]
        comparison["abfe_summary"] = {
            "ligand": metrics.get("ligand", ""),
            "abs_error": metrics.get("abs_error", 0),
            "within_uncertainty": metrics.get("within_uncertainty", False),
            "assessment": "PASS" if metrics.get("abs_error", 10) <= 3.0 else "FAIL"
        }

        logger.info(f"ABFE: {comparison['abfe_summary']['assessment']} "
                   f"(error={metrics.get('abs_error', 0):.2f} kcal/mol)")

    # Overall assessment - only consider stages that were run
    stages_run = []
    stages_passed = []
    
    if comparison.get("docking_summary"):
        stages_run.append("docking")
        if comparison["docking_summary"].get("assessment") == "PASS":
            stages_passed.append("docking")
    
    if comparison.get("rbfe_summary"):
        stages_run.append("rbfe")
        if comparison["rbfe_summary"].get("assessment") == "PASS":
            stages_passed.append("rbfe")
    
    if comparison.get("abfe_summary"):
        stages_run.append("abfe")
        if comparison["abfe_summary"].get("assessment") == "PASS":
            stages_passed.append("abfe")
    
    # Pass if all run stages passed (empty stages_run means nothing ran)
    all_pass = len(stages_run) > 0 and len(stages_passed) == len(stages_run)

    comparison["overall_summary"] = {
        "overall_assessment": "PASS" if all_pass else "FAIL",
        "stages_run": stages_run,
        "stages_passed": stages_passed,
        "docking_passed": comparison.get("docking_summary", {}).get("assessment") == "PASS",
        "rbfe_passed": comparison.get("rbfe_summary", {}).get("assessment") == "PASS" if comparison.get("rbfe_summary") else None,
        "abfe_passed": comparison.get("abfe_summary", {}).get("assessment") == "PASS" if comparison.get("abfe_summary") else None
    }

    logger.info("=== Comparison Stage Complete ===")
    logger.info(f"Overall Assessment: {comparison['overall_summary']['overall_assessment']}")

    return comparison
