"""Report generation utilities for benchmark results."""

import json
from pathlib import Path
from typing import Dict, Any, List
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class BenchmarkReport:
    """Generate benchmark reports in multiple formats."""

    def __init__(self, benchmark_name: str, run_id: str, output_dir: Path):
        """
        Initialize report generator.

        Args:
            benchmark_name: Name of benchmark system
            run_id: Unique identifier for this run
            output_dir: Directory to save reports
        """
        self.benchmark_name = benchmark_name
        self.run_id = run_id
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.data = {
            "benchmark_name": benchmark_name,
            "run_id": run_id,
            "timestamp": datetime.now().isoformat(),
            "docking": {},
            "rbfe": {},
            "abfe": {},
            "settings": {}
        }

    def add_docking_results(
        self,
        results: List[Dict[str, Any]],
        metrics: Dict[str, Any]
    ):
        """Add docking results to report."""
        self.data["docking"] = {
            "results": results,
            "metrics": metrics
        }

    def add_rbfe_results(
        self,
        network: Dict[str, Any],
        transformations: List[Dict[str, Any]],
        metrics: Dict[str, Any]
    ):
        """Add RBFE results to report."""
        self.data["rbfe"] = {
            "network": network,
            "transformations": transformations,
            "metrics": metrics
        }

    def add_abfe_results(
        self,
        result: Dict[str, Any],
        metrics: Dict[str, Any]
    ):
        """Add ABFE results to report."""
        self.data["abfe"] = {
            "result": result,
            "metrics": metrics
        }

    def add_settings(self, settings: Dict[str, Any]):
        """Add protocol settings to report."""
        self.data["settings"] = settings

    def save_json(self, filename: str = None) -> Path:
        """
        Save report as JSON.

        Args:
            filename: Optional custom filename

        Returns:
            Path to saved file
        """
        if filename is None:
            filename = f"{self.benchmark_name}_{self.run_id}_report.json"

        filepath = self.output_dir / filename

        with open(filepath, "w") as f:
            json.dump(self.data, f, indent=2)

        logger.info(f"JSON report saved to: {filepath}")
        return filepath

    def save_html(self, filename: str = None) -> Path:
        """
        Save report as HTML.

        Args:
            filename: Optional custom filename

        Returns:
            Path to saved file
        """
        if filename is None:
            filename = f"{self.benchmark_name}_{self.run_id}_report.html"

        filepath = self.output_dir / filename

        html = self._generate_html()

        with open(filepath, "w") as f:
            f.write(html)

        logger.info(f"HTML report saved to: {filepath}")
        return filepath

    def _generate_html(self) -> str:
        """Generate HTML report content."""
        docking = self.data.get("docking", {})
        rbfe = self.data.get("rbfe", {})
        abfe = self.data.get("abfe", {})
        settings = self.data.get("settings", {})

        html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{self.benchmark_name} Benchmark Report</title>
    <style>
        body {{
            font-family: Arial, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }}
        .header {{
            background-color: #2c3e50;
            color: white;
            padding: 20px;
            border-radius: 5px;
            margin-bottom: 20px;
        }}
        .section {{
            background-color: white;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        h1 {{ margin: 0; }}
        h2 {{
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }}
        th, td {{
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }}
        th {{
            background-color: #3498db;
            color: white;
        }}
        tr:hover {{ background-color: #f5f5f5; }}
        .metric {{
            display: inline-block;
            margin: 10px 20px 10px 0;
        }}
        .metric-label {{
            font-weight: bold;
            color: #7f8c8d;
        }}
        .metric-value {{
            font-size: 1.2em;
            color: #2c3e50;
        }}
        .success {{ color: #27ae60; }}
        .warning {{ color: #f39c12; }}
        .error {{ color: #e74c3c; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>{self.benchmark_name} Benchmark Report</h1>
        <p>Run ID: {self.run_id}</p>
        <p>Generated: {self.data['timestamp']}</p>
    </div>
"""

        # Docking section
        if docking:
            metrics = docking.get("metrics", {})
            results = docking.get("results", [])

            success_class = "success" if metrics.get("success_rate", 0) > 0.8 else "warning"

            html += f"""
    <div class="section">
        <h2>Docking Results</h2>

        <div class="metrics">
            <div class="metric">
                <span class="metric-label">Success Rate:</span>
                <span class="metric-value {success_class}">
                    {metrics.get('success_rate', 0)*100:.1f}%
                </span>
                ({metrics.get('n_successful', 0)}/{metrics.get('n_total', 0)})
            </div>
            <div class="metric">
                <span class="metric-label">Mean RMSD:</span>
                <span class="metric-value">
                    {metrics.get('rmsd_mean', 0):.2f} ± {metrics.get('rmsd_std', 0):.2f} Å
                </span>
            </div>
            <div class="metric">
                <span class="metric-label">Range:</span>
                <span class="metric-value">
                    {metrics.get('rmsd_min', 0):.2f} - {metrics.get('rmsd_max', 0):.2f} Å
                </span>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Ligand</th>
                    <th>PDB ID</th>
                    <th>RMSD (Å)</th>
                    <th>Affinity (kcal/mol)</th>
                    <th>Success</th>
                </tr>
            </thead>
            <tbody>
"""
            for result in results:
                success = "✓" if result.get("success", False) else "✗"
                success_class = "success" if result.get("success", False) else "error"

                html += f"""
                <tr>
                    <td>{result.get('ligand_name', 'N/A')}</td>
                    <td>{result.get('pdb_id', 'N/A')}</td>
                    <td>{result.get('crystal_rmsd', 0):.2f}</td>
                    <td>{result.get('affinity', 0):.2f}</td>
                    <td class="{success_class}">{success}</td>
                </tr>
"""
            html += """
            </tbody>
        </table>
    </div>
"""

        # RBFE section
        if rbfe:
            metrics = rbfe.get("metrics", {})
            transformations = rbfe.get("transformations", [])

            correlation_class = "success" if metrics.get("pearson_r", 0) > 0.8 else "warning"
            rmse_class = "success" if metrics.get("rmse", 10) < 2.0 else "warning"

            html += f"""
    <div class="section">
        <h2>RBFE Results</h2>

        <div class="metrics">
            <div class="metric">
                <span class="metric-label">Pearson r:</span>
                <span class="metric-value {correlation_class}">
                    {metrics.get('pearson_r', 0):.3f}
                </span>
                (p={metrics.get('pearson_p', 1):.4f})
            </div>
            <div class="metric">
                <span class="metric-label">Spearman ρ:</span>
                <span class="metric-value">
                    {metrics.get('spearman_rho', 0):.3f}
                </span>
            </div>
            <div class="metric">
                <span class="metric-label">RMSE:</span>
                <span class="metric-value {rmse_class}">
                    {metrics.get('rmse', 0):.2f} kcal/mol
                </span>
            </div>
            <div class="metric">
                <span class="metric-label">MAE:</span>
                <span class="metric-value">
                    {metrics.get('mae', 0):.2f} kcal/mol
                </span>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Transformation</th>
                    <th>Predicted ΔΔG</th>
                    <th>Experimental ΔΔG</th>
                    <th>Error</th>
                    <th>Uncertainty</th>
                </tr>
            </thead>
            <tbody>
"""
            for trans in transformations:
                pred = trans.get("predicted_ddG", 0)
                exp = trans.get("experimental_ddG", 0)
                error = pred - exp if exp else None
                unc = trans.get("uncertainty", 0)

                html += f"""
                <tr>
                    <td>{trans.get('transformation', 'N/A')}</td>
                    <td>{pred:.2f} ± {unc:.2f}</td>
                    <td>{exp:.2f if exp else 'N/A'}</td>
                    <td>{error:.2f if error is not None else 'N/A'}</td>
                    <td>{unc:.2f}</td>
                </tr>
"""
            html += """
            </tbody>
        </table>
    </div>
"""

        # ABFE section
        if abfe:
            metrics = abfe.get("metrics", {})

            html += f"""
    <div class="section">
        <h2>ABFE Results</h2>

        <div class="metrics">
            <div class="metric">
                <span class="metric-label">Ligand:</span>
                <span class="metric-value">{metrics.get('ligand', 'N/A')}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Predicted ΔG:</span>
                <span class="metric-value">
                    {metrics.get('predicted_dG', 0):.2f} ± {metrics.get('uncertainty', 0):.2f} kcal/mol
                </span>
            </div>
            <div class="metric">
                <span class="metric-label">Experimental ΔG:</span>
                <span class="metric-value">{metrics.get('experimental_dG', 0):.2f} kcal/mol</span>
            </div>
            <div class="metric">
                <span class="metric-label">Error:</span>
                <span class="metric-value">{metrics.get('error', 0):.2f} kcal/mol</span>
            </div>
        </div>
    </div>
"""

        # Settings section
        if settings:
            html += """
    <div class="section">
        <h2>Protocol Settings</h2>
        <pre style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto;">
"""
            html += json.dumps(settings, indent=2)
            html += """
        </pre>
    </div>
"""

        html += """
</body>
</html>
"""
        return html


def generate_reports(
    benchmark_name: str,
    run_id: str,
    output_dir: Path,
    results: Dict[str, Any],
    formats: List[str] = ["json", "html"]
) -> Dict[str, Path]:
    """
    Generate benchmark reports in multiple formats.

    Args:
        benchmark_name: Name of benchmark
        run_id: Unique run identifier
        output_dir: Directory to save reports
        results: Complete benchmark results
        formats: List of formats to generate ("json", "html", "pdf")

    Returns:
        Dictionary mapping format -> filepath
    """
    report = BenchmarkReport(benchmark_name, run_id, output_dir)

    # Add results
    if "docking" in results:
        report.add_docking_results(
            results["docking"].get("results", []),
            results["docking"].get("metrics", {})
        )

    if "rbfe" in results:
        report.add_rbfe_results(
            results["rbfe"].get("network", {}),
            results["rbfe"].get("transformations", []),
            results["rbfe"].get("metrics", {})
        )

    if "abfe" in results:
        report.add_abfe_results(
            results["abfe"].get("result", {}),
            results["abfe"].get("metrics", {})
        )

    if "settings" in results:
        report.add_settings(results["settings"])

    # Generate reports
    generated = {}

    if "json" in formats:
        generated["json"] = report.save_json()

    if "html" in formats:
        generated["html"] = report.save_html()

    # PDF generation would require additional dependencies (weasyprint, etc.)
    if "pdf" in formats:
        logger.warning("PDF generation not yet implemented")

    return generated
