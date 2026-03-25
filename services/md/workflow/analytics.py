"""
Equilibration analytics module.

Post-processes MD equilibration output files to produce quantitative KPIs
and time-series data for frontend visualization. Runs after all simulation
stages complete; never modifies the simulation itself.

Data flow:
  EquilibrationAnalytics.compute()
    ├─ _parse_log()       → thermodynamic time series from StateDataReporter TSV
    ├─ _compute_rmsd()    → backbone + ligand RMSD from NPT DCD trajectory
    └─ _evaluate_kpis()   → pass/warn/fail summary with absolute tolerances
"""

import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ── KPI thresholds (absolute, per scientific literature) ──────────────────────
# Plateau is defined as: std(last 20% of frames) < threshold
_ENERGY_STD_THRESHOLD_KJ = 500.0      # kJ/mol  — energy stable
_TEMP_STD_THRESHOLD_K = 5.0           # K       — thermostat converged
_DENSITY_STD_THRESHOLD_GCM3 = 0.05   # g/cm³   — barostat converged
_DENSITY_TARGET_GCM3 = 1.0           # g/cm³   — expected water density

# RMSD pass/warn/fail (final-20%-mean vs threshold)
_BACKBONE_RMSD_PASS_A = 2.5           # Å
_BACKBONE_RMSD_WARN_A = 3.5           # Å
_LIGAND_RMSD_PASS_A = 2.0             # Å
_LIGAND_RMSD_WARN_A = 5.0             # Å

# Max frames to load for RMSD (stride to cap compute time)
_RMSD_MAX_FRAMES = 200

# Report interval × integration timestep (ps) used in equilibration_runner.py
# report_interval=1000, dt=0.004 ps → 4 ps per data point
_DEFAULT_REPORT_INTERVAL = 1000
_DT_PS = 0.004


class EquilibrationAnalytics:
    """
    Computes quantitative KPIs from completed MD equilibration output files.

    Usage:
        result = EquilibrationAnalytics().compute(
            output_dir, system_id, topology_pdb, npt_traj, log_path, ligand_id
        )

    Returns a dict suitable for JSON serialization. On any internal failure
    returns {"error": "<message>"} rather than raising, so a completed
    simulation result is never lost due to an analytics bug.
    """

    def compute(
        self,
        output_dir: str,
        system_id: str,
        topology_pdb: str | None,
        npt_traj: str | None,
        log_path: str | None,
        ligand_id: str = "ligand",
    ) -> dict[str, Any]:
        """
        Run all analytics passes and return combined result dict.

        Args:
            output_dir:    MD output directory (unused directly; paths passed explicitly)
            system_id:     System identifier (used for logging only)
            topology_pdb:  Path to NPT final PDB (topology reference for RMSD)
            npt_traj:      Path to NPT DCD trajectory
            log_path:      Path to StateDataReporter equilibration log (TSV)
            ligand_id:     Ligand identifier; residue name derived as ligand_id[:3].upper()

        Returns:
            {
                "thermodynamics": {...},
                "rmsd": {...},
                "kpi_summary": {...},
            }
            or {"error": "<message>"} on failure.
        """
        try:
            ligand_resname = (ligand_id[:3] if ligand_id else "LIG").upper()
            logger.info(
                f"[ANALYTICS] Starting analytics for system={system_id}, "
                f"ligand_resname={ligand_resname}"
            )

            thermo = self._parse_log(log_path)
            rmsd = self._compute_rmsd(topology_pdb, npt_traj, ligand_resname)
            kpi = self._evaluate_kpis(thermo, rmsd)

            logger.info(
                f"[ANALYTICS] Complete — overall_pass={kpi.get('overall_pass')}, "
                f"warnings={kpi.get('warnings')}"
            )
            return {
                "thermodynamics": thermo,
                "rmsd": rmsd,
                "kpi_summary": kpi,
            }
        except Exception as e:
            logger.warning(f"[ANALYTICS] Analytics computation failed: {e}", exc_info=True)
            return {"error": str(e)}

    # ── Log parser ─────────────────────────────────────────────────────────────

    def _parse_log(self, log_path: str | None) -> dict[str, Any]:
        """
        Parse the OpenMM StateDataReporter TSV log file.

        The log is written with:
            separator='\t', step=True, potentialEnergy=True, kineticEnergy=True,
            totalEnergy=True, temperature=True, volume=True, density=True, speed=True

        The reporter is re-attached (with clear()) for each stage (NVT, NPT), so
        step numbers restart. We use cumulative row index × report_interval × dt
        as the time axis to get a monotonic time series in picoseconds.

        Returns dict with arrays (empty on failure):
            step[], time_ps[], potential_energy_kjmol[],
            temperature_k[], density_gcm3[], volume_nm3[]
        """
        empty = {
            "step": [], "time_ps": [], "potential_energy_kjmol": [],
            "temperature_k": [], "density_gcm3": [], "volume_nm3": [],
        }

        if not log_path or not os.path.exists(log_path):
            logger.debug(f"[ANALYTICS] Log file not found: {log_path}")
            return empty

        try:
            steps: list[int] = []
            times: list[float] = []
            energies: list[float] = []
            temperatures: list[float] = []
            densities: list[float] = []
            volumes: list[float] = []

            col_step = col_pe = col_temp = col_vol = col_den = -1
            row_index = 0

            with open(log_path, "r") as fh:
                for raw_line in fh:
                    line = raw_line.strip()
                    if not line:
                        continue

                    # Header line starts with '#'
                    if line.startswith("#"):
                        # Parse column names from header
                        # Format: #"Step"\t"Potential Energy (kJ/mole)"\t...
                        header = line.lstrip("# ").replace('"', '')
                        cols = [c.strip() for c in header.split("\t")]
                        for i, c in enumerate(cols):
                            cl = c.lower()
                            if "step" in cl:
                                col_step = i
                            elif "potential" in cl:
                                col_pe = i
                            elif "temperature" in cl:
                                col_temp = i
                            elif "volume" in cl:
                                col_vol = i
                            elif "density" in cl:
                                col_den = i
                        continue

                    # Data row
                    parts = line.split("\t")
                    try:
                        def _safe(idx: int) -> float | None:
                            if idx < 0 or idx >= len(parts):
                                return None
                            try:
                                v = float(parts[idx])
                                return v if v == v else None  # NaN check
                            except (ValueError, IndexError):
                                return None

                        pe = _safe(col_pe)
                        temp = _safe(col_temp)
                        vol = _safe(col_vol)
                        den = _safe(col_den)

                        # Skip rows where all values are None/NaN
                        if all(v is None for v in [pe, temp, vol, den]):
                            continue

                        step_val = int(parts[col_step]) if col_step >= 0 else row_index
                        # Derive time from step number × integration timestep.
                        # This is correct for both equilibration (report_interval=1000)
                        # and production (report_interval=2500) logs.
                        time_ps = step_val * _DT_PS

                        steps.append(step_val)
                        times.append(round(time_ps, 3))
                        energies.append(pe if pe is not None else float("nan"))
                        temperatures.append(temp if temp is not None else float("nan"))
                        volumes.append(vol if vol is not None else float("nan"))
                        densities.append(den if den is not None else float("nan"))
                        row_index += 1

                    except (ValueError, IndexError):
                        # Malformed row — skip silently
                        continue

            logger.info(f"[ANALYTICS] Parsed {row_index} rows from log")
            return {
                "step": steps,
                "time_ps": times,
                "potential_energy_kjmol": energies,
                "temperature_k": temperatures,
                "density_gcm3": densities,
                "volume_nm3": volumes,
            }

        except Exception as e:
            logger.warning(f"[ANALYTICS] Log parse failed: {e}")
            return empty

    # ── RMSD computation ───────────────────────────────────────────────────────

    def _compute_rmsd(
        self,
        topology_pdb: str | None,
        npt_traj: str | None,
        ligand_resname: str,
    ) -> dict[str, Any]:
        """
        Compute backbone and ligand RMSD from NPT DCD trajectory using MDAnalysis.

        Uses NPT trajectory only (NVT skipped to save compute).

        Alignment: protein backbone (CA atoms) aligned to frame 0.
        Backbone RMSD: CA atoms vs frame 0 after alignment.
        Ligand RMSD:   ligand heavy atoms vs frame 0 after backbone alignment.

        Ligand selection tries `resname {ligand_resname}` first. If empty,
        falls back to non-protein/non-solvent atoms and appends a warning.

        DCD is strided so at most _RMSD_MAX_FRAMES frames are loaded to cap
        compute time regardless of trajectory length.

        Returns:
            {
                "time_ps": [...],
                "backbone_rmsd_angstrom": [...],
                "ligand_rmsd_angstrom": [...],   # empty list if no ligand found
                "warnings": [...],
            }
        """
        empty = {
            "time_ps": [],
            "backbone_rmsd_angstrom": [],
            "ligand_rmsd_angstrom": [],
            "warnings": [],
        }

        if not npt_traj or not os.path.exists(npt_traj):
            logger.debug(f"[ANALYTICS] NPT trajectory not found: {npt_traj} — skipping RMSD")
            return empty

        if not topology_pdb or not os.path.exists(topology_pdb):
            logger.debug(f"[ANALYTICS] Topology PDB not found: {topology_pdb} — skipping RMSD")
            return empty

        try:
            import numpy as np
            import MDAnalysis as mda
            from MDAnalysis.analysis import align
            from MDAnalysis.lib.distances import minimize_vectors

            warnings_list: list[str] = []

            # Load universe with stride to cap frame count
            u_full = mda.Universe(topology_pdb, npt_traj)

            # NOTE: We do NOT use the MDAnalysis `unwrap` on-the-fly transformation here.
            # That transformation is stateful and requires seeing every consecutive frame
            # to track atoms crossing box boundaries. Strided iteration (trajectory[::N])
            # skips intermediate frames, breaking the state tracking and leaving PBC jumps
            # uncorrected. Instead we apply the minimum image convention per frame below.

            n_frames = len(u_full.trajectory)

            if n_frames == 0:
                return {**empty, "warnings": ["Trajectory has 0 frames"]}

            stride = max(1, n_frames // _RMSD_MAX_FRAMES)
            logger.info(
                f"[ANALYTICS] RMSD: {n_frames} frames, stride={stride} "
                f"(loading ~{n_frames // stride} frames)"
            )

            if n_frames < 10:
                warnings_list.append("Trajectory too short for reliable plateau analysis")

            # Select backbone (CA atoms) for alignment + backbone RMSD
            backbone_sel_str = "backbone and name CA"
            backbone_sel = u_full.select_atoms(backbone_sel_str)
            if len(backbone_sel) == 0:
                backbone_sel_str = "protein and name CA"
                backbone_sel = u_full.select_atoms(backbone_sel_str)
            if len(backbone_sel) == 0:
                logger.warning("[ANALYTICS] No backbone CA atoms found — skipping RMSD")
                return {**empty, "warnings": ["No backbone CA atoms found"]}

            # Select ligand heavy atoms
            ligand_sel = u_full.select_atoms(f"resname {ligand_resname} and not name H*")
            if len(ligand_sel) == 0:
                # Fallback: non-protein, non-solvent, non-ion atoms
                solvent_resnames = (
                    "HOH WAT H2O TIP TIP3 TIP4 TIP5 SOL "
                    "NA CL MG K CA ZN FE MN NA+ CL-"
                )
                ligand_sel = u_full.select_atoms(
                    f"not protein and not (resname {solvent_resnames}) and not name H*"
                )
                if len(ligand_sel) > 0:
                    warnings_list.append(
                        f"Ligand resname '{ligand_resname}' not found — "
                        f"used auto-detected ligand ({len(ligand_sel)} atoms)"
                    )
                    logger.info(
                        f"[ANALYTICS] Ligand fallback: found {len(ligand_sel)} atoms"
                    )

            has_ligand = len(ligand_sel) > 0

            # ── Run RMSD analysis ──────────────────────────────────────────────
            # Rewind to frame 0 to extract reference positions (avoids a second Universe load)
            u_full.trajectory[0]
            ref_backbone_pos = u_full.select_atoms(backbone_sel_str).positions.copy()
            ref_ligand_pos = u_full.select_atoms(
                f"resname {ligand_resname} and not name H*"
                if len(u_full.select_atoms(f"resname {ligand_resname} and not name H*")) > 0
                else f"not protein and not (resname HOH WAT H2O TIP TIP3 TIP4 TIP5 SOL NA CL MG K CA ZN FE MN NA+ CL-) and not name H*"
            ).positions.copy() if has_ligand else None

            backbone_rmsd: list[float] = []
            ligand_rmsd: list[float] = []
            time_ps: list[float] = []

            ref_bb_com = ref_backbone_pos.mean(axis=0)
            ref_bb_centered = ref_backbone_pos - ref_bb_com
            ref_lig_com = ref_ligand_pos.mean(axis=0) if has_ligand else None
            ref_lig_centered = (ref_ligand_pos - ref_bb_com) if has_ligand else None

            for frame_i, ts in enumerate(u_full.trajectory[::stride]):
                mobile_bb = backbone_sel.positions.copy()
                mobile_bb_com = mobile_bb.mean(axis=0)

                # PBC correction for backbone translation continuity.
                # Without this, the protein CA coordinates may be split across
                # periodic images, making the rigid-body superposition ill-conditioned
                # and inflating RMSD (which then propagates into ligand RMSD).
                if ts.dimensions is not None:
                    delta_bb = (mobile_bb_com - ref_bb_com).reshape(1, 3)
                    delta_bb_mim = minimize_vectors(delta_bb, ts.dimensions)[0]
                    mobile_bb += delta_bb_mim - delta_bb[0]
                    mobile_bb_com = mobile_bb.mean(axis=0)

                # Compute rotation matrix aligning mobile backbone to reference
                R, _ = align.rotation_matrix(mobile_bb, ref_backbone_pos)

                # Backbone RMSD after alignment
                aligned_bb = (mobile_bb - mobile_bb_com) @ R.T
                diff_bb = aligned_bb - ref_bb_centered
                rmsd_bb = float(np.sqrt((diff_bb ** 2).sum(axis=1).mean()))
                backbone_rmsd.append(round(rmsd_bb, 4))

                if has_ligand:
                    mobile_lig = ligand_sel.positions.copy()

                    # PBC correction: apply minimum image convention to the ligand
                    # centre-of-mass displacement. This collapses any periodic-image
                    # jump to the nearest equivalent position relative to the reference,
                    # eliminating the ~50 Å RMSD spikes caused by the ligand crossing a
                    # box boundary mid-trajectory. Works per-frame with no sequential
                    # state, so it is fully compatible with strided iteration.
                    if ts.dimensions is not None:
                        lig_com_mobile = mobile_lig.mean(axis=0)
                        delta = (lig_com_mobile - ref_lig_com).reshape(1, 3)
                        delta_mim = minimize_vectors(delta, ts.dimensions)[0]
                        mobile_lig += delta_mim - delta[0]

                    # Apply the same backbone rotation to the PBC-corrected ligand
                    aligned_lig = (mobile_lig - mobile_bb_com) @ R.T
                    diff_lig = aligned_lig - ref_lig_centered
                    lig_rmsd = float(np.sqrt((diff_lig ** 2).sum(axis=1).mean()))
                    ligand_rmsd.append(round(lig_rmsd, 4))

                # Use ts.time (ps) directly from DCD metadata — correct regardless
                # of report interval (equilibration=1000 steps, production=2500 steps).
                time_ps.append(round(float(ts.time), 1))

            logger.info(
                f"[ANALYTICS] RMSD computed: {len(backbone_rmsd)} points, "
                f"backbone max={max(backbone_rmsd):.2f}Å"
            )

            return {
                "time_ps": time_ps,
                "backbone_rmsd_angstrom": backbone_rmsd,
                "ligand_rmsd_angstrom": ligand_rmsd,
                "warnings": warnings_list,
            }

        except ImportError:
            logger.warning("[ANALYTICS] MDAnalysis not available — skipping RMSD")
            return {**empty, "warnings": ["MDAnalysis not available"]}
        except Exception as e:
            logger.warning(f"[ANALYTICS] RMSD computation failed: {e}", exc_info=True)
            return {**empty, "warnings": [f"RMSD computation failed: {str(e)}"]}

    # ── KPI evaluator ──────────────────────────────────────────────────────────

    def _evaluate_kpis(
        self,
        thermo: dict[str, Any],
        rmsd: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Evaluate pass/warn/fail status for each KPI using absolute tolerances.

        Plateau definition: std(last 20% of series) < threshold.
        RMSD threshold: mean(last 20% of series) < pass_threshold.

        Returns:
            {
                "energy_stable": bool | None,
                "density_converged": bool | None,
                "backbone_rmsd_status": "pass" | "warn" | "fail" | None,
                "ligand_rmsd_status": "pass" | "warn" | "fail" | None,
                "overall_pass": bool,
                "warnings": [...],
            }
        """
        import math

        def last20_std(series: list[float]) -> float | None:
            """Std of last 20% of series, ignoring NaN."""
            if not series:
                return None
            n = max(1, len(series) // 5)
            tail = [v for v in series[-n:] if not math.isnan(v)]
            if len(tail) < 2:
                return None
            mean = sum(tail) / len(tail)
            variance = sum((v - mean) ** 2 for v in tail) / len(tail)
            return variance ** 0.5

        def last20_mean(series: list[float]) -> float | None:
            """Mean of last 20% of series, ignoring NaN."""
            if not series:
                return None
            n = max(1, len(series) // 5)
            tail = [v for v in series[-n:] if not math.isnan(v)]
            if not tail:
                return None
            return sum(tail) / len(tail)

        warnings: list[str] = list(rmsd.get("warnings", []))
        all_none = True

        # Energy stability
        energy_stable = None
        energy_std = last20_std(thermo.get("potential_energy_kjmol", []))
        if energy_std is not None:
            all_none = False
            energy_stable = energy_std < _ENERGY_STD_THRESHOLD_KJ
            if not energy_stable:
                warnings.append(
                    f"Energy not stable: std={energy_std:.0f} kJ/mol "
                    f"(threshold {_ENERGY_STD_THRESHOLD_KJ:.0f})"
                )

        # Density convergence
        density_converged = None
        density_std = last20_std(thermo.get("density_gcm3", []))
        density_mean = last20_mean(thermo.get("density_gcm3", []))
        if density_std is not None and density_mean is not None:
            all_none = False
            density_converged = density_std < _DENSITY_STD_THRESHOLD_GCM3
            if not density_converged:
                warnings.append(
                    f"Density not converged: std={density_std:.4f} g/cm³ "
                    f"(threshold {_DENSITY_STD_THRESHOLD_GCM3:.2f})"
                )
            elif abs(density_mean - _DENSITY_TARGET_GCM3) > 0.1:
                warnings.append(
                    f"Density converged but far from target: "
                    f"mean={density_mean:.3f} g/cm³ (expected ~{_DENSITY_TARGET_GCM3:.1f})"
                )

        # Backbone RMSD
        backbone_status = None
        bb_mean = last20_mean(rmsd.get("backbone_rmsd_angstrom", []))
        if bb_mean is not None:
            all_none = False
            if bb_mean < _BACKBONE_RMSD_PASS_A:
                backbone_status = "pass"
            elif bb_mean < _BACKBONE_RMSD_WARN_A:
                backbone_status = "warn"
                warnings.append(
                    f"Backbone RMSD elevated: {bb_mean:.2f}Å "
                    f"(pass <{_BACKBONE_RMSD_PASS_A}Å)"
                )
            else:
                backbone_status = "fail"
                warnings.append(
                    f"Backbone RMSD too high: {bb_mean:.2f}Å "
                    f"(fail >{_BACKBONE_RMSD_WARN_A}Å) — protein may be unstable"
                )

        # Ligand RMSD
        ligand_status = None
        lig_mean = last20_mean(rmsd.get("ligand_rmsd_angstrom", []))
        if lig_mean is not None:
            all_none = False
            if lig_mean < _LIGAND_RMSD_PASS_A:
                ligand_status = "pass"
            elif lig_mean < _LIGAND_RMSD_WARN_A:
                ligand_status = "warn"
                warnings.append(
                    f"Ligand RMSD elevated: {lig_mean:.2f}Å "
                    f"(pass <{_LIGAND_RMSD_PASS_A}Å) — check binding pose"
                )
            else:
                ligand_status = "fail"
                warnings.append(
                    f"Ligand RMSD too high: {lig_mean:.2f}Å "
                    f"(fail >{_LIGAND_RMSD_WARN_A}Å) — ligand may have dissociated"
                )

        # Overall pass: all evaluated KPIs must pass
        statuses = [
            energy_stable,
            density_converged,
            backbone_status == "pass" if backbone_status else None,
            ligand_status == "pass" if ligand_status else None,
        ]
        evaluated = [s for s in statuses if s is not None]
        overall_pass = all(evaluated) if evaluated else False

        return {
            "energy_stable": energy_stable,
            "density_converged": density_converged,
            "backbone_rmsd_status": backbone_status,
            "ligand_rmsd_status": ligand_status,
            "overall_pass": overall_pass,
            "warnings": warnings,
            "backbone_rmsd_pass_a": _BACKBONE_RMSD_PASS_A,
            "ligand_rmsd_pass_a": _LIGAND_RMSD_PASS_A,
        }
