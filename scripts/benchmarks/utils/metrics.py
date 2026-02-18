"""Metrics calculation for benchmark validation."""

import numpy as np
from scipy import stats
from typing import List, Dict, Any, Tuple
import logging

logger = logging.getLogger(__name__)


def calculate_docking_metrics(
    docking_results: List[Dict[str, Any]],
    rmsd_threshold: float = 2.0
) -> Dict[str, Any]:
    """
    Calculate docking validation metrics.

    Args:
        docking_results: List of docking results with 'crystal_rmsd' field
        rmsd_threshold: Success threshold in Angstroms

    Returns:
        Dictionary of metrics
    """
    rmsds = [r["crystal_rmsd"] for r in docking_results if "crystal_rmsd" in r]

    if not rmsds:
        return {
            "rmsd_mean": None,
            "rmsd_std": None,
            "rmsd_min": None,
            "rmsd_max": None,
            "success_rate": None,
            "n_successful": 0,
            "n_total": 0
        }

    rmsds_array = np.array(rmsds)
    n_successful = np.sum(rmsds_array < rmsd_threshold)

    metrics = {
        "rmsd_mean": float(np.mean(rmsds_array)),
        "rmsd_std": float(np.std(rmsds_array)),
        "rmsd_min": float(np.min(rmsds_array)),
        "rmsd_max": float(np.max(rmsds_array)),
        "rmsd_median": float(np.median(rmsds_array)),
        "success_rate": float(n_successful / len(rmsds)),
        "n_successful": int(n_successful),
        "n_total": len(rmsds),
        "rmsd_threshold": rmsd_threshold
    }

    logger.info(f"Docking metrics: {metrics['n_successful']}/{metrics['n_total']} "
                f"successful (RMSD < {rmsd_threshold} Å)")
    logger.info(f"RMSD: mean={metrics['rmsd_mean']:.2f} ± {metrics['rmsd_std']:.2f} Å")

    return metrics


def calculate_rbfe_metrics(
    transformations: List[Dict[str, Any]],
    experimental_data: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Calculate RBFE validation metrics.

    Args:
        transformations: List of transformation results with predicted ΔΔG
        experimental_data: List of ligands with experimental ΔΔG

    Returns:
        Dictionary of correlation and error metrics
    """
    # Build experimental ΔΔG lookup
    exp_ddg_map = {}
    for ligand in experimental_data:
        if "experimental_ddG_kcal_mol" in ligand:
            exp_ddg_map[ligand["name"]] = ligand["experimental_ddG_kcal_mol"]

    # Extract predicted and experimental values
    predicted = []
    experimental = []

    for trans in transformations:
        # Try to extract ligand names from transformation string
        # Format: "ligand_a -> ligand_b"
        if "transformation" in trans:
            ligand_b = trans.get("ligand_b") or trans["transformation"].split("->")[-1].strip()

            if ligand_b in exp_ddg_map:
                predicted.append(trans["predicted_ddG"])
                experimental.append(exp_ddg_map[ligand_b])

    if len(predicted) < 2:
        logger.warning("Insufficient data for correlation analysis")
        return {
            "n_transformations": len(transformations),
            "n_comparable": len(predicted),
            "pearson_r": None,
            "pearson_p": None,
            "spearman_rho": None,
            "spearman_p": None,
            "kendall_tau": None,
            "kendall_p": None,
            "rmse": None,
            "mae": None,
            "max_error": None
        }

    predicted = np.array(predicted)
    experimental = np.array(experimental)

    # Calculate correlations
    pearson_r, pearson_p = stats.pearsonr(predicted, experimental)
    spearman_rho, spearman_p = stats.spearmanr(predicted, experimental)
    kendall_tau, kendall_p = stats.kendalltau(predicted, experimental)

    # Calculate errors
    errors = predicted - experimental
    rmse = float(np.sqrt(np.mean(errors**2)))
    mae = float(np.mean(np.abs(errors)))
    max_error = float(np.max(np.abs(errors)))

    metrics = {
        "n_transformations": len(transformations),
        "n_comparable": len(predicted),
        "pearson_r": float(pearson_r),
        "pearson_p": float(pearson_p),
        "spearman_rho": float(spearman_rho),
        "spearman_p": float(spearman_p),
        "kendall_tau": float(kendall_tau),
        "kendall_p": float(kendall_p),
        "rmse": rmse,
        "mae": mae,
        "max_error": max_error,
        "predicted_values": predicted.tolist(),
        "experimental_values": experimental.tolist(),
        "errors": errors.tolist()
    }

    logger.info(f"RBFE metrics: n={len(predicted)}")
    logger.info(f"  Pearson r={pearson_r:.3f} (p={pearson_p:.4f})")
    logger.info(f"  Spearman ρ={spearman_rho:.3f} (p={spearman_p:.4f})")
    logger.info(f"  RMSE={rmse:.2f} kcal/mol, MAE={mae:.2f} kcal/mol")

    return metrics


def calculate_abfe_metrics(
    abfe_result: Dict[str, Any],
    experimental_data: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Calculate ABFE validation metrics.

    Args:
        abfe_result: ABFE result with predicted ΔG
        experimental_data: List of ligands with experimental ΔG

    Returns:
        Dictionary of error metrics
    """
    ligand_name = abfe_result.get("ligand")
    predicted_dg = abfe_result.get("predicted_dG")
    uncertainty = abfe_result.get("uncertainty")

    # Find experimental value
    experimental_dg = None
    for ligand in experimental_data:
        if ligand["name"] == ligand_name:
            experimental_dg = ligand.get("experimental_dG_kcal_mol")
            break

    if experimental_dg is None:
        logger.warning(f"No experimental data for {ligand_name}")
        return {
            "ligand": ligand_name,
            "predicted_dG": predicted_dg,
            "experimental_dG": None,
            "error": None,
            "abs_error": None,
            "uncertainty": uncertainty
        }

    error = predicted_dg - experimental_dg
    abs_error = abs(error)

    metrics = {
        "ligand": ligand_name,
        "predicted_dG": predicted_dg,
        "experimental_dG": experimental_dg,
        "error": error,
        "abs_error": abs_error,
        "uncertainty": uncertainty,
        "within_uncertainty": abs_error <= uncertainty if uncertainty else None
    }

    logger.info(f"ABFE metrics for {ligand_name}:")
    logger.info(f"  Predicted: {predicted_dg:.2f} ± {uncertainty:.2f} kcal/mol")
    logger.info(f"  Experimental: {experimental_dg:.2f} kcal/mol")
    logger.info(f"  Error: {error:.2f} kcal/mol (|error|={abs_error:.2f})")

    return metrics


def calculate_ranking_accuracy(
    predicted: List[Tuple[str, float]],
    experimental: List[Tuple[str, float]]
) -> Dict[str, Any]:
    """
    Calculate ranking accuracy metrics.

    Args:
        predicted: List of (ligand_name, predicted_affinity) tuples
        experimental: List of (ligand_name, experimental_affinity) tuples

    Returns:
        Dictionary of ranking metrics
    """
    # Sort by affinity (more negative = better binder)
    pred_sorted = sorted(predicted, key=lambda x: x[1])
    exp_sorted = sorted(experimental, key=lambda x: x[1])

    # Get rankings
    pred_names = [name for name, _ in pred_sorted]
    exp_names = [name for name, _ in exp_sorted]

    # Find common ligands
    common = set(pred_names) & set(exp_names)

    if len(common) < 2:
        return {
            "n_ligands": len(common),
            "top_1_match": None,
            "top_3_match": None,
            "rank_correlation": None
        }

    # Top-1 accuracy
    top_1_match = pred_names[0] == exp_names[0]

    # Top-3 accuracy
    pred_top3 = set(pred_names[:3])
    exp_top3 = set(exp_names[:3])
    top_3_overlap = len(pred_top3 & exp_top3)

    metrics = {
        "n_ligands": len(common),
        "top_1_match": top_1_match,
        "top_3_overlap": top_3_overlap,
        "predicted_ranking": pred_names,
        "experimental_ranking": exp_names
    }

    return metrics
