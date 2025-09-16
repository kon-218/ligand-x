"""
System builder module for MD optimization.

Handles creation of solvated protein-ligand systems using OpenMM and OpenFF.
"""

import os
import logging
from typing import Dict, Any, Optional
from io import StringIO

logger = logging.getLogger(__name__)


class SolvatedSystemBuilder:
    """Builds solvated protein-ligand systems for MD simulation."""

    WATER_RESIDUES = {'HOH', 'WAT', 'H2O', 'TIP', 'TIP3', 'TIP4'}
    ION_RESIDUES = {'NA', 'CL', 'MG', 'K', 'CA', 'ZN', 'FE', 'MN'}

    def __init__(self, output_dir: str = "data/md_outputs"):
        """
        Initialize system builder.

        Args:
            output_dir: Directory for output files
        """
        self.output_dir = output_dir
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

    def create_forcefield_with_ligand(self, prepared_ligand, forcefield_method: str = "openff-2.2.0") -> Any:
        """
        Create OpenMM ForceField with ligand template generator.

        Args:
            prepared_ligand: OpenFF Molecule with charges
            forcefield_method: Force field to use ('openff-2.2.0', 'gaff', 'gaff2')

        Returns:
            OpenMM ForceField with registered template generator
        """
        from openmm.app import ForceField as OpenMMForceField

        logger.info(f"Setting up OpenMM force field with ligand template using: {forcefield_method}")

        try:
            # Create template generator based on selected method
            if forcefield_method.startswith("openff"):
                template_generator = self._create_openff_generator(prepared_ligand, forcefield_method)
            elif forcefield_method in ["gaff", "gaff2"]:
                template_generator = self._create_gaff_generator(prepared_ligand, forcefield_method)
            else:
                raise ValueError(f"Unknown force field method: {forcefield_method}")

            # Create force field with template generator
            forcefield = OpenMMForceField('amber14-all.xml', 'amber14/tip3p.xml')
            forcefield.registerTemplateGenerator(template_generator)
            logger.info("[COMPLETE] Registered template generator with OpenMM force field")
            return forcefield

        except Exception as e:
            logger.error(f"Force field creation failed with method '{forcefield_method}': {e}")
            raise

    def _create_openff_generator(self, prepared_ligand, forcefield_method: str):
        """Create SMIRNOFF/OpenFF template generator."""
        from openmmforcefields.generators import SMIRNOFFTemplateGenerator

        logger.info(f"Creating SMIRNOFF template generator with {forcefield_method}")

        try:
            smirnoff_generator = SMIRNOFFTemplateGenerator(
                molecules=[prepared_ligand],
                forcefield=f'{forcefield_method}.offxml'
            )
            logger.info(f"[COMPLETE] Created SMIRNOFF template generator ({forcefield_method})")
            return smirnoff_generator.generator
        except Exception as e:
            logger.error(f"SMIRNOFF template generator creation failed: {e}")
            logger.error("This molecule may contain atoms not supported by OpenFF")
            logger.error("Suggestion: Try GAFF or GAFF2 force field instead")
            raise

    def _create_gaff_generator(self, prepared_ligand, forcefield_method: str):
        """Create GAFF template generator."""
        from openmmforcefields.generators import GAFFTemplateGenerator

        # Map method name to GAFF version
        gaff_version = 'gaff-2.11' if forcefield_method == 'gaff2' else 'gaff-1.81'
        logger.info(f"Creating GAFF template generator with {gaff_version}")

        try:
            gaff_generator = GAFFTemplateGenerator(
                molecules=[prepared_ligand],
                forcefield=gaff_version
            )
            logger.info(f"[COMPLETE] Created GAFF template generator ({gaff_version})")
            return gaff_generator.generator
        except Exception as e:
            logger.error(f"GAFF template generator creation failed: {e}")
            raise
    
    def prepare_ligand_pdb(
        self,
        prepared_ligand,
        ligand_id: str = "ligand",
        output_path: Optional[str] = None
    ) -> str:
        """
        Convert OpenFF ligand to PDB format with unique atom names.
        
        Args:
            prepared_ligand: OpenFF Molecule
            ligand_id: Ligand identifier
            output_path: Path to save PDB (optional)
            
        Returns:
            Path to ligand PDB file
        """
        from rdkit import Chem
        from rdkit.Chem import AtomPDBResidueInfo
        from ..utils.pdb_utils import format_ligand_pdb_block
        
        if output_path is None:
            output_path = os.path.join(self.output_dir, f"{ligand_id}_prepared.pdb")
        
        # Get RDKit molecule from OpenFF molecule
        rdkit_mol = prepared_ligand.to_rdkit()
        
        # Ensure unique atom names for PDB export
        atom_counts = {}
        for atom in rdkit_mol.GetAtoms():
            symbol = atom.GetSymbol()
            if symbol not in atom_counts:
                atom_counts[symbol] = 0
            atom_counts[symbol] += 1
            
            # Assign unique name: Symbol + Count (e.g., C1, C2, H1)
            atom_name = f"{symbol}{atom_counts[symbol]}"
            if len(atom_name) > 4:
                atom_name = f"{symbol[:1]}{atom_counts[symbol]}"
            
            # Set the PDB atom name property
            info = atom.GetPDBResidueInfo()
            if not info:
                info = AtomPDBResidueInfo()
                atom.SetPDBResidueInfo(info)
            
            atom.GetPDBResidueInfo().SetName(atom_name.ljust(4))
        
        # Ensure the molecule has a name
        if not rdkit_mol.HasProp("_Name"):
            rdkit_mol.SetProp("_Name", ligand_id)
        
        # Write ligand PDB with proper formatting
        with open(output_path, 'w') as f:
            pdb_block = Chem.MolToPDBBlock(rdkit_mol)
            formatted_block = format_ligand_pdb_block(
                pdb_block,
                residue_name=(ligand_id[:3] if ligand_id else "LIG")
            )
            f.write(formatted_block + "\n")
        
        logger.info(f"[COMPLETE] Ligand PDB saved: {output_path}")
        return output_path
    
    def create_solvated_system(
        self,
        protein_pdb_data: str,
        prepared_ligand,
        protein_id: str = "protein",
        ligand_id: str = "ligand",
        system_id: str = "system",
        ionic_strength_m: float = 0.15,
        padding_nm: float = 1.0,
        forcefield_method: str = "openff-2.2.0",
        box_shape: str = "dodecahedron",
        temperature: float = 300.0,
        pressure: float = 1.0
    ) -> Dict[str, Any]:
        """
        Create a complete solvated protein-ligand system.

        Args:
            protein_pdb_data: Cleaned protein PDB data
            prepared_ligand: OpenFF Molecule with charges
            protein_id: Protein identifier
            ligand_id: Ligand identifier
            system_id: System identifier
            ionic_strength_m: Ionic strength in molar
            padding_nm: Solvent padding in nanometers
            forcefield_method: Force field to use ('openff-2.2.0', 'gaff', 'gaff2')
            box_shape: Solvation box shape ('dodecahedron' or 'cubic')
            temperature: Simulation temperature in Kelvin
            pressure: Simulation pressure in bar

        Returns:
            Dict with system creation results including OpenMM Simulation
        """
        import numpy as np
        from openmm.app import PDBFile, Modeller
        from openmm import LangevinMiddleIntegrator, MonteCarloBarostat, Platform, Vec3
        from openmm.app import Simulation
        from openmm import unit
        import openmm
        
        logger.info("Creating protein-ligand complex using hybrid OpenFF/OpenMM approach...")
        
        try:
            # Step 1: Prepare ligand PDB
            logger.info("Step 1: Converting OpenFF ligand to PDB format...")
            ligand_pdb_path = self.prepare_ligand_pdb(prepared_ligand, ligand_id)
            
            # Step 2: Load protein structure
            logger.info("Step 2: Loading protein structure...")
            prepared_protein_path = os.path.join(self.output_dir, f"{protein_id}_cleaned.pdb")
            
            if os.path.exists(prepared_protein_path):
                logger.info(f"Using prepared protein structure: {prepared_protein_path}")
                protein_pdb = PDBFile(prepared_protein_path)
            else:
                logger.warning("Prepared protein structure not found, using raw protein data")
                protein_pdb_file = StringIO(protein_pdb_data)
                protein_pdb = PDBFile(protein_pdb_file)
            
            logger.info(f"[COMPLETE] Loaded protein: {protein_pdb.topology.getNumAtoms()} atoms")
            
            # Step 3: Load ligand PDB
            logger.info("Step 3: Loading ligand structure...")
            ligand_pdb = PDBFile(ligand_pdb_path)
            logger.info(f"[COMPLETE] Loaded ligand: {ligand_pdb.topology.getNumAtoms()} atoms")
            
            # Step 4: Create force field with ligand template
            logger.info(f"Step 4: Creating force field with ligand template using {forcefield_method}...")
            forcefield = self.create_forcefield_with_ligand(prepared_ligand, forcefield_method)
            
            # Step 5: Combine protein and ligand
            logger.info("Step 5: Combining protein and ligand...")
            modeller = Modeller(protein_pdb.topology, protein_pdb.positions)
            modeller.add(ligand_pdb.topology, ligand_pdb.positions)
            logger.info(f"[COMPLETE] Combined system: {modeller.topology.getNumAtoms()} atoms")
            
            # Step 6: Solvate and ionize
            omm_box_shape = 'dodecahedron' if box_shape == 'dodecahedron' else 'cube'
            logger.info(f"Step 6: Solvating and ionizing system (box_shape={omm_box_shape})...")
            modeller.addSolvent(
                forcefield,
                model='tip3p',
                padding=padding_nm * unit.nanometer,
                ionicStrength=ionic_strength_m * unit.molar,
                boxShape=omm_box_shape
            )
            logger.info(f"[COMPLETE] Solvation completed successfully (box_shape={omm_box_shape})")

            # Verify periodic box vectors
            box_vectors = modeller.topology.getPeriodicBoxVectors()
            if box_vectors is None:
                raise RuntimeError(
                    "Periodic box vectors not set after solvation. "
                    "This indicates a solvation failure that would produce an unphysical system."
                )
            
            logger.info(f"[COMPLETE] Solvated system: {modeller.topology.getNumAtoms()} atoms")

            # Step 6b: Pre-minimize to resolve solvation clashes
            # Solvation places water molecules that can overlap, producing forces
            # of ~10^5 kJ/mol/nm. L-BFGS with AllBonds constraints fails because
            # CCMA (constraint solver) cannot handle the large displacements.
            # Solution: create a temporary constraint-free system where L-BFGS
            # works reliably, resolve clashes, then build the production system.
            logger.info("Step 6b: Pre-minimizing to resolve solvation clashes (constraint-free)...")
            try:
                pre_system = forcefield.createSystem(
                    modeller.topology,
                    nonbondedMethod=openmm.app.PME,
                    nonbondedCutoff=1.0 * unit.nanometer,
                    constraints=None,
                    rigidWater=False,
                )
                pre_integrator = openmm.VerletIntegrator(0.001 * unit.picoseconds)
                pre_platform = Platform.getPlatformByName('CPU')
                pre_sim = Simulation(
                    modeller.topology, pre_system, pre_integrator, pre_platform
                )
                pre_sim.context.setPositions(modeller.positions)
                pre_sim.minimizeEnergy(maxIterations=500)
                modeller.positions = pre_sim.context.getState(
                    getPositions=True
                ).getPositions()
                pre_energy = pre_sim.context.getState(
                    getEnergy=True
                ).getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole)
                logger.info(
                    f"[COMPLETE] Pre-minimization resolved clashes "
                    f"(energy={pre_energy:.1f} kJ/mol)"
                )
                del pre_sim, pre_system, pre_integrator
            except Exception as pre_err:
                logger.warning(f"Pre-minimization failed ({pre_err}), continuing with raw positions")

            # Step 7: Create OpenMM System (HMR + HBonds + vdW switching)
            logger.info("Step 7: Creating parameterized system (HMR, HBonds, switchDistance=0.8nm)...")
            openmm_system = forcefield.createSystem(
                modeller.topology,
                nonbondedMethod=openmm.app.PME,
                nonbondedCutoff=1.0 * unit.nanometer,
                switchDistance=0.8 * unit.nanometer,
                constraints=openmm.app.HBonds,
                rigidWater=True,
                hydrogenMass=4.0 * unit.amu,
            )

            # Enable long-range dispersion correction
            for force in openmm_system.getForces():
                if isinstance(force, openmm.NonbondedForce):
                    force.setUseDispersionCorrection(True)
                    force.setUseSwitchingFunction(True)
                    force.setSwitchingDistance(0.8 * unit.nanometer)
                    logger.info("[COMPLETE] Dispersion correction and vdW switching enabled")
                    break

            # Step 8: Add barostat
            logger.info("Step 8: Adding barostat...")
            barostat = MonteCarloBarostat(
                pressure * unit.bar,
                temperature * unit.kelvin,
                25
            )
            openmm_system.addForce(barostat)

            # Step 9: Create integrator (4 fs with HMR)
            logger.info("Step 9: Creating integrator (4 fs timestep with HMR)...")
            integrator = LangevinMiddleIntegrator(
                temperature * unit.kelvin,
                1.0 / unit.picosecond,
                0.004 * unit.picoseconds
            )

            # Step 10: Create simulation
            logger.info("Step 10: Creating simulation...")
            simulation, platform_name = self._create_simulation_with_fallback(
                modeller.topology, openmm_system, integrator
            )
            simulation.context.setPositions(modeller.positions)

            # Step 10b: Minimize with constraints to satisfy HBonds tolerances
            # The constraint-free pre-minimization resolved clashes, but bonds
            # may violate HBonds constraint tolerances. A quick minimization
            # adjusts positions to satisfy constraints before dynamics start.
            logger.info("Step 10b: Minimizing with constraints to satisfy HBonds tolerances...")
            try:
                simulation.minimizeEnergy(maxIterations=100, tolerance=10.0)
                final_energy = simulation.context.getState(
                    getEnergy=True
                ).getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole)
                logger.info(
                    f"[COMPLETE] Constraint-satisfying minimization complete "
                    f"(energy={final_energy:.1f} kJ/mol)"
                )
            except Exception as min_err:
                logger.warning(
                    f"Constraint-satisfying minimization failed ({min_err}), "
                    "proceeding with pre-minimized positions"
                )

            # Save system PDB
            system_pdb_path = os.path.join(self.output_dir, f"{system_id}_system.pdb")
            from ..utils.pdb_utils import write_pdb_file
            write_pdb_file(
                simulation.topology,
                simulation.context.getState(getPositions=True).getPositions(),
                system_pdb_path,
                keep_ids=True
            )

            logger.info("[COMPLETE] Solvated system created successfully")

            return {
                "status": "success",
                "simulation": simulation,
                "system_pdb_path": system_pdb_path,
                "total_atoms": modeller.topology.getNumAtoms(),
                "platform": platform_name,
                "system_info": {
                    "protein_atoms": len([a for a in modeller.topology.atoms()
                                         if a.residue.name not in ['HOH', 'NA', 'CL']]),
                    "water_molecules": len([r for r in modeller.topology.residues()
                                           if r.name == 'HOH']),
                    "ions": len([a for a in modeller.topology.atoms()
                                if a.residue.name in ['NA', 'CL']])
                }
            }
            
        except Exception as e:
            import traceback
            logger.error(f"System creation failed: {e}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            return {
                "status": "error",
                "error": str(e),
                "traceback": traceback.format_exc()
            }
    
    def recreate_system_from_pdb(
        self,
        system_pdb_data: str,
        prepared_ligand,
        system_id: str = "system",
        forcefield_method: str = "openff-2.2.0",
        temperature: float = 300.0,
        pressure: float = 1.0
    ) -> Dict[str, Any]:
        """
        Recreate OpenMM system from an existing solvated PDB.

        Args:
            system_pdb_data: Solvated system PDB data
            prepared_ligand: OpenFF Molecule with charges
            system_id: System identifier
            forcefield_method: Force field to use ('openff-2.2.0', 'gaff', 'gaff2')
            temperature: Simulation temperature in Kelvin
            pressure: Simulation pressure in bar

        Returns:
            Dict with system recreation results
        """
        import io
        from openmm.app import PDBFile
        from openmm import LangevinMiddleIntegrator, MonteCarloBarostat
        from openmm import unit
        import openmm
        
        logger.info("Recreating system from existing solvated PDB...")
        
        try:
            # Create force field with ligand template
            forcefield = self.create_forcefield_with_ligand(prepared_ligand, forcefield_method)
            
            # Load PDB using OpenMM PDBFile (supports Hybrid-36)
            pdb_file = io.StringIO(system_pdb_data)
            pdb = PDBFile(pdb_file)
            logger.info(f"[COMPLETE] Loaded solvated system PDB: {pdb.topology.getNumAtoms()} atoms")
            
            # Create System (HMR + HBonds + vdW switching)
            logger.info("Creating OpenMM system (HMR, HBonds, switchDistance=0.8nm)...")
            openmm_system = forcefield.createSystem(
                pdb.topology,
                nonbondedMethod=openmm.app.PME,
                nonbondedCutoff=1.0 * unit.nanometer,
                switchDistance=0.8 * unit.nanometer,
                constraints=openmm.app.HBonds,
                rigidWater=True,
                hydrogenMass=4.0 * unit.amu
            )

            # Enable long-range dispersion correction
            for force in openmm_system.getForces():
                if isinstance(force, openmm.NonbondedForce):
                    force.setUseDispersionCorrection(True)
                    force.setUseSwitchingFunction(True)
                    force.setSwitchingDistance(0.8 * unit.nanometer)
                    logger.info("[COMPLETE] Dispersion correction and vdW switching enabled")
                    break

            # Configure integrator and barostat
            temp_unit = temperature * unit.kelvin
            friction = 1.0 / unit.picosecond
            step_size = 4.0 * unit.femtoseconds
            integrator = LangevinMiddleIntegrator(temp_unit, friction, step_size)

            press_unit = pressure * unit.bar
            barostat = MonteCarloBarostat(press_unit, temp_unit)
            openmm_system.addForce(barostat)

            # Create Simulation
            simulation, platform_name = self._create_simulation_with_fallback(
                pdb.topology, openmm_system, integrator
            )
            simulation.context.setPositions(pdb.positions)

            # Restore periodic box vectors
            box_vectors = pdb.topology.getPeriodicBoxVectors()
            if box_vectors:
                simulation.context.setPeriodicBoxVectors(*box_vectors)
                logger.info(f"[COMPLETE] Periodic box vectors restored")

            return {
                "status": "success",
                "simulation": simulation,
                "total_atoms": pdb.topology.getNumAtoms(),
                "platform": platform_name,
                "system_info": {
                    "total_atoms": pdb.topology.getNumAtoms(),
                    "residues": pdb.topology.getNumResidues(),
                    "chains": pdb.topology.getNumChains()
                }
            }
            
        except Exception as e:
            import traceback
            logger.error(f"Failed to recreate system from PDB: {e}")
            return {
                "status": "error",
                "error": str(e),
                "traceback": traceback.format_exc()
            }
    
    def create_solvated_system_protein_only(
        self,
        protein_pdb_data: str,
        protein_id: str = "protein",
        system_id: str = "system",
        ionic_strength_m: float = 0.15,
        padding_nm: float = 1.0,
        box_shape: str = "dodecahedron",
        temperature: float = 300.0,
        pressure: float = 1.0
    ) -> Dict[str, Any]:
        """
        Create a complete solvated protein-only system using AMBER14 force fields.

        No OpenFF or template generators required — pure AMBER14 for standard residues.

        Returns:
            Dict with system creation results including OpenMM Simulation
        """
        import numpy as np
        from openmm.app import PDBFile, Modeller, ForceField as OpenMMForceField
        from openmm import LangevinMiddleIntegrator, MonteCarloBarostat, Platform
        from openmm.app import Simulation
        from openmm import unit
        import openmm

        logger.info("Creating protein-only solvated system using AMBER14 force fields...")

        try:
            # Step 1: Load protein structure
            logger.info("Step 1: Loading protein structure...")
            prepared_protein_path = os.path.join(self.output_dir, f"{protein_id}_cleaned.pdb")

            if os.path.exists(prepared_protein_path):
                logger.info(f"Using prepared protein structure: {prepared_protein_path}")
                protein_pdb = PDBFile(prepared_protein_path)
            else:
                logger.warning("Prepared protein structure not found, using raw protein data")
                protein_pdb_file = StringIO(protein_pdb_data)
                protein_pdb = PDBFile(protein_pdb_file)

            logger.info(f"[COMPLETE] Loaded protein: {protein_pdb.topology.getNumAtoms()} atoms")

            # Step 2: Create AMBER14 force field (no template generator needed)
            logger.info("Step 2: Creating AMBER14 force field...")
            forcefield = OpenMMForceField('amber14-all.xml', 'amber14/tip3p.xml')

            # Step 3: Solvate and ionize
            omm_box_shape = 'dodecahedron' if box_shape == 'dodecahedron' else 'cube'
            logger.info(f"Step 3: Solvating and ionizing system (box_shape={omm_box_shape})...")
            modeller = Modeller(protein_pdb.topology, protein_pdb.positions)
            modeller.addSolvent(
                forcefield,
                model='tip3p',
                padding=padding_nm * unit.nanometer,
                ionicStrength=ionic_strength_m * unit.molar,
                boxShape=omm_box_shape
            )
            logger.info(f"[COMPLETE] Solvation completed successfully")

            # Verify periodic box vectors
            box_vectors = modeller.topology.getPeriodicBoxVectors()
            if box_vectors is None:
                raise RuntimeError(
                    "Periodic box vectors not set after solvation. "
                    "This indicates a solvation failure that would produce an unphysical system."
                )

            logger.info(f"[COMPLETE] Solvated system: {modeller.topology.getNumAtoms()} atoms")

            # Step 3b: Pre-minimize to resolve solvation clashes (constraint-free)
            logger.info("Step 3b: Pre-minimizing to resolve solvation clashes (constraint-free)...")
            try:
                pre_system = forcefield.createSystem(
                    modeller.topology,
                    nonbondedMethod=openmm.app.PME,
                    nonbondedCutoff=1.0 * unit.nanometer,
                    constraints=None,
                    rigidWater=False,
                )
                pre_integrator = openmm.VerletIntegrator(0.001 * unit.picoseconds)
                pre_platform = Platform.getPlatformByName('CPU')
                pre_sim = Simulation(
                    modeller.topology, pre_system, pre_integrator, pre_platform
                )
                pre_sim.context.setPositions(modeller.positions)
                pre_sim.minimizeEnergy(maxIterations=500)
                modeller.positions = pre_sim.context.getState(
                    getPositions=True
                ).getPositions()
                pre_energy = pre_sim.context.getState(
                    getEnergy=True
                ).getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole)
                logger.info(
                    f"[COMPLETE] Pre-minimization resolved clashes "
                    f"(energy={pre_energy:.1f} kJ/mol)"
                )
                del pre_sim, pre_system, pre_integrator
            except Exception as pre_err:
                logger.warning(f"Pre-minimization failed ({pre_err}), continuing with raw positions")

            # Step 4: Create OpenMM System (HMR + HBonds + vdW switching)
            logger.info("Step 4: Creating parameterized system (HMR, HBonds, switchDistance=0.8nm)...")
            openmm_system = forcefield.createSystem(
                modeller.topology,
                nonbondedMethod=openmm.app.PME,
                nonbondedCutoff=1.0 * unit.nanometer,
                switchDistance=0.8 * unit.nanometer,
                constraints=openmm.app.HBonds,
                rigidWater=True,
                hydrogenMass=4.0 * unit.amu,
            )

            # Enable long-range dispersion correction
            for force in openmm_system.getForces():
                if isinstance(force, openmm.NonbondedForce):
                    force.setUseDispersionCorrection(True)
                    force.setUseSwitchingFunction(True)
                    force.setSwitchingDistance(0.8 * unit.nanometer)
                    logger.info("[COMPLETE] Dispersion correction and vdW switching enabled")
                    break

            # Step 5: Add barostat
            logger.info("Step 5: Adding barostat...")
            barostat = MonteCarloBarostat(
                pressure * unit.bar,
                temperature * unit.kelvin,
                25
            )
            openmm_system.addForce(barostat)

            # Step 6: Create integrator (4 fs with HMR)
            logger.info("Step 6: Creating integrator (4 fs timestep with HMR)...")
            integrator = LangevinMiddleIntegrator(
                temperature * unit.kelvin,
                1.0 / unit.picosecond,
                0.004 * unit.picoseconds
            )

            # Step 7: Create simulation
            logger.info("Step 7: Creating simulation...")
            simulation, platform_name = self._create_simulation_with_fallback(
                modeller.topology, openmm_system, integrator
            )
            simulation.context.setPositions(modeller.positions)

            # Step 7b: Minimize with constraints
            logger.info("Step 7b: Minimizing with constraints to satisfy HBonds tolerances...")
            try:
                simulation.minimizeEnergy(maxIterations=100, tolerance=10.0)
                final_energy = simulation.context.getState(
                    getEnergy=True
                ).getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole)
                logger.info(
                    f"[COMPLETE] Constraint-satisfying minimization complete "
                    f"(energy={final_energy:.1f} kJ/mol)"
                )
            except Exception as min_err:
                logger.warning(
                    f"Constraint-satisfying minimization failed ({min_err}), "
                    "proceeding with pre-minimized positions"
                )

            # Save system PDB
            system_pdb_path = os.path.join(self.output_dir, f"{system_id}_system.pdb")
            from ..utils.pdb_utils import write_pdb_file
            write_pdb_file(
                simulation.topology,
                simulation.context.getState(getPositions=True).getPositions(),
                system_pdb_path,
                keep_ids=True
            )

            logger.info("[COMPLETE] Protein-only solvated system created successfully")

            return {
                "status": "success",
                "simulation": simulation,
                "system_pdb_path": system_pdb_path,
                "total_atoms": modeller.topology.getNumAtoms(),
                "platform": platform_name,
                "system_info": {
                    "protein_atoms": len([a for a in modeller.topology.atoms()
                                         if a.residue.name not in ['HOH', 'NA', 'CL']]),
                    "water_molecules": len([r for r in modeller.topology.residues()
                                           if r.name == 'HOH']),
                    "ions": len([a for a in modeller.topology.atoms()
                                if a.residue.name in ['NA', 'CL']])
                }
            }

        except Exception as e:
            import traceback
            logger.error(f"Protein-only system creation failed: {e}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            return {
                "status": "error",
                "error": str(e),
                "traceback": traceback.format_exc()
            }

    def recreate_system_from_pdb_protein_only(
        self,
        system_pdb_data: str,
        system_id: str = "system",
        temperature: float = 300.0,
        pressure: float = 1.0
    ) -> Dict[str, Any]:
        """
        Recreate protein-only OpenMM system from an existing solvated PDB.

        Uses pure AMBER14 force fields — no template generator needed.

        Returns:
            Dict with system recreation results
        """
        import io
        from openmm.app import PDBFile, ForceField as OpenMMForceField
        from openmm import LangevinMiddleIntegrator, MonteCarloBarostat
        from openmm import unit
        import openmm

        logger.info("Recreating protein-only system from existing solvated PDB...")

        try:
            # Create AMBER14 force field
            forcefield = OpenMMForceField('amber14-all.xml', 'amber14/tip3p.xml')

            # Load PDB
            pdb_file = io.StringIO(system_pdb_data)
            pdb = PDBFile(pdb_file)
            logger.info(f"[COMPLETE] Loaded solvated system PDB: {pdb.topology.getNumAtoms()} atoms")

            # Create System (HMR + HBonds + vdW switching)
            logger.info("Creating OpenMM system (HMR, HBonds, switchDistance=0.8nm)...")
            openmm_system = forcefield.createSystem(
                pdb.topology,
                nonbondedMethod=openmm.app.PME,
                nonbondedCutoff=1.0 * unit.nanometer,
                switchDistance=0.8 * unit.nanometer,
                constraints=openmm.app.HBonds,
                rigidWater=True,
                hydrogenMass=4.0 * unit.amu
            )

            # Enable long-range dispersion correction
            for force in openmm_system.getForces():
                if isinstance(force, openmm.NonbondedForce):
                    force.setUseDispersionCorrection(True)
                    force.setUseSwitchingFunction(True)
                    force.setSwitchingDistance(0.8 * unit.nanometer)
                    logger.info("[COMPLETE] Dispersion correction and vdW switching enabled")
                    break

            # Configure integrator and barostat
            temp_unit = temperature * unit.kelvin
            friction = 1.0 / unit.picosecond
            step_size = 4.0 * unit.femtoseconds
            integrator = LangevinMiddleIntegrator(temp_unit, friction, step_size)

            press_unit = pressure * unit.bar
            barostat = MonteCarloBarostat(press_unit, temp_unit)
            openmm_system.addForce(barostat)

            # Create Simulation
            simulation, platform_name = self._create_simulation_with_fallback(
                pdb.topology, openmm_system, integrator
            )
            simulation.context.setPositions(pdb.positions)

            # Restore periodic box vectors
            box_vectors = pdb.topology.getPeriodicBoxVectors()
            if box_vectors:
                simulation.context.setPeriodicBoxVectors(*box_vectors)
                logger.info(f"[COMPLETE] Periodic box vectors restored")

            return {
                "status": "success",
                "simulation": simulation,
                "total_atoms": pdb.topology.getNumAtoms(),
                "platform": platform_name,
                "system_info": {
                    "total_atoms": pdb.topology.getNumAtoms(),
                    "residues": pdb.topology.getNumResidues(),
                    "chains": pdb.topology.getNumChains()
                }
            }

        except Exception as e:
            import traceback
            logger.error(f"Failed to recreate protein-only system from PDB: {e}")
            return {
                "status": "error",
                "error": str(e),
                "traceback": traceback.format_exc()
            }

    def _create_simulation_with_fallback(self, topology, system, integrator):
        """Create simulation with platform fallback."""
        from openmm import Platform
        from openmm.app import Simulation
        
        simulation = None
        platform_name = None
        
        for pname in ['CUDA', 'OpenCL', 'CPU']:
            try:
                logger.info(f"Attempting {pname} platform...")
                platform = Platform.getPlatformByName(pname)
                
                if pname == 'CUDA':
                    properties = {'Precision': 'mixed', 'CudaDeviceIndex': '0'}
                    simulation = Simulation(topology, system, integrator, platform, properties)
                elif pname == 'OpenCL':
                    properties = {'Precision': 'mixed'}
                    simulation = Simulation(topology, system, integrator, platform, properties)
                else:
                    simulation = Simulation(topology, system, integrator, platform)
                
                platform_name = pname
                logger.info(f"[COMPLETE] Using {pname} platform")
                break
                
            except Exception as e:
                logger.warning(f"Failed to initialize {pname}: {e}")
                continue
        
        if simulation is None:
            raise RuntimeError("Could not initialize simulation on any platform")
        
        return simulation, platform_name
    
