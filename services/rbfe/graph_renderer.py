"""
Cinnabar-based Network Graph Renderer

Generates RBFE network graph images with 2D molecule structures in nodes.
Uses cinnabar FEMap for network structure and RDKit for molecule rendering.
"""
import io
import logging
import math
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from urllib.parse import quote

import matplotlib
matplotlib.use('Agg')  # Non-interactive backend for server
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.offsetbox import OffsetImage, AnnotationBbox
import networkx as nx
import numpy as np
from PIL import Image

try:
    from rdkit import Chem
    from rdkit.Chem import Draw, AllChem
    RDKIT_AVAILABLE = True
except ImportError:
    RDKIT_AVAILABLE = False

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False

logger = logging.getLogger(__name__)


@dataclass
class NetworkNode:
    """Node in the network graph."""
    name: str
    smiles: Optional[str] = None
    image: Optional[np.ndarray] = None


@dataclass
class NetworkEdge:
    """Edge in the network graph."""
    ligand_a: str
    ligand_b: str
    score: Optional[float] = None
    ddg_kcal_mol: Optional[float] = None
    uncertainty: Optional[float] = None


class CinnabarGraphRenderer:
    """
    Renders RBFE network graphs with molecule images in nodes.
    
    Uses cinnabar-style circular layout with:
    - RDKit for 2D molecule depiction (primary)
    - PubChem API fallback for molecule images
    - Colored edges based on DDG values (green=improved, red=weaker binding)
    """
    
    def __init__(self, image_size: int = 100, dpi: int = 150):
        """
        Initialize the renderer.
        
        Args:
            image_size: Size of molecule images in pixels
            dpi: DPI for output image
        """
        self.image_size = image_size
        self.dpi = dpi
        self.pubchem_timeout = 5.0
    
    def render_molecule_image(self, smiles: str) -> Optional[np.ndarray]:
        """
        Render a 2D molecule image from SMILES.
        
        Args:
            smiles: SMILES string
            
        Returns:
            numpy array of the image, or None if rendering failed
        """
        if not smiles:
            return None
        
        # Try RDKit first
        if RDKIT_AVAILABLE:
            try:
                mol = Chem.MolFromSmiles(smiles)
                if mol is not None:
                    AllChem.Compute2DCoords(mol)
                    img = Draw.MolToImage(mol, size=(self.image_size, self.image_size))
                    return np.array(img)
            except Exception as e:
                logger.warning(f"RDKit rendering failed for SMILES {smiles[:20]}...: {e}")
        
        # Fallback to PubChem
        return self._fetch_pubchem_image(smiles)

    def render_molecule_image_from_molblock(self, molblock: str) -> Optional[np.ndarray]:
        """
        Render a 2D molecule image from molblock/SDF text.

        Args:
            molblock: Mol block text

        Returns:
            numpy array of the image, or None if rendering failed
        """
        if not molblock or not RDKIT_AVAILABLE:
            return None

        try:
            mol = Chem.MolFromMolBlock(molblock, sanitize=True, removeHs=False)
            if mol is None:
                return None
            AllChem.Compute2DCoords(mol)
            img = Draw.MolToImage(mol, size=(self.image_size, self.image_size))
            return np.array(img)
        except Exception as e:
            logger.warning(f"MolBlock rendering failed: {e}")
            return None
    
    def _fetch_pubchem_image(self, smiles: str) -> Optional[np.ndarray]:
        """Fetch molecule image from PubChem API."""
        if not HTTPX_AVAILABLE:
            return None
        
        try:
            # Encode full SMILES safely for URL path segment (handles '/', '@', etc.).
            encoded_smiles = quote(smiles, safe="")
            url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/{encoded_smiles}/PNG?image_size={self.image_size}x{self.image_size}"
            
            with httpx.Client(timeout=self.pubchem_timeout) as client:
                response = client.get(url)
                if response.status_code == 200:
                    img = Image.open(io.BytesIO(response.content))
                    return np.array(img.convert('RGBA'))
        except Exception as e:
            logger.warning(f"PubChem fetch failed for SMILES {smiles[:20]}...: {e}")
        
        return None
    
    def _create_placeholder_image(self, label: str) -> np.ndarray:
        """Create a placeholder circle with label for nodes without molecule images."""
        fig, ax = plt.subplots(figsize=(1, 1), dpi=self.image_size)
        ax.set_xlim(-1, 1)
        ax.set_ylim(-1, 1)
        ax.set_aspect('equal')
        ax.axis('off')
        
        # Draw circle
        circle = plt.Circle((0, 0), 0.9, color='#e5e7eb', ec='#9ca3af', linewidth=2)
        ax.add_patch(circle)
        
        # Add label
        display_label = label[:8] + '..' if len(label) > 10 else label
        ax.text(0, 0, display_label, ha='center', va='center', fontsize=8, fontweight='bold')
        
        # Convert to image array
        buf = io.BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight', pad_inches=0, transparent=True)
        plt.close(fig)
        buf.seek(0)
        img = Image.open(buf)
        return np.array(img.convert('RGBA'))
    
    def _circular_layout(self, nodes: List[str], width: float, height: float, padding: float = 0.15) -> Dict[str, Tuple[float, float]]:
        """Calculate circular layout positions for nodes."""
        positions = {}
        n = len(nodes)
        if n == 0:
            return positions
        
        cx, cy = width / 2, height / 2
        radius = min(cx, cy) * (1 - padding)
        
        for i, node in enumerate(nodes):
            angle = (2 * math.pi * i) / n - math.pi / 2
            x = cx + radius * math.cos(angle)
            y = cy + radius * math.sin(angle)
            positions[node] = (x, y)
        
        return positions
    
    def _get_edge_color(self, ddg: Optional[float], score: Optional[float]) -> str:
        """Get edge color based on DDG value or score."""
        if ddg is not None:
            return '#16a34a' if ddg < 0 else '#dc2626'  # Green for improved, red for weaker
        if score is not None:
            if score >= 0.7:
                return '#4ade80'  # green-400
            if score >= 0.5:
                return '#60a5fa'  # blue-400
            if score >= 0.3:
                return '#facc15'  # yellow-400
            return '#f87171'  # red-400
        return '#6b7280'  # gray
    
    def render_network_graph(
        self,
        nodes: List[str],
        edges: List[Dict[str, Any]],
        ligand_smiles: Dict[str, str],
        ligand_molfiles: Optional[Dict[str, str]] = None,
        ddg_values: Optional[List[Dict[str, Any]]] = None,
        title: Optional[str] = None,
        topology: str = "network",
        width: int = 800,
        height: int = 600,
    ) -> bytes:
        """
        Render the network graph as a PNG image.
        
        Args:
            nodes: List of node names (ligand identifiers)
            edges: List of edge dicts with ligand_a, ligand_b, score
            ligand_smiles: Dict mapping node names to SMILES strings
            ligand_molfiles: Optional dict mapping node names to molblock/SDF strings
            ddg_values: Optional list of DDG values for edges
            title: Optional title for the graph
            topology: Network topology name for display
            width: Image width in pixels
            height: Image height in pixels
            
        Returns:
            PNG image as bytes
        """
        # Log received SMILES for debugging
        ligand_molfiles = ligand_molfiles or {}
        logger.info(
            f"Rendering network graph with {len(nodes)} nodes, "
            f"{len(ligand_smiles)} SMILES, {len(ligand_molfiles)} molfiles"
        )
        missing_smiles = [n for n in nodes if n not in ligand_smiles]
        if missing_smiles:
            logger.warning(f"Missing SMILES for nodes: {missing_smiles}")

        # #region agent log
        import json as _json, time as _time
        _log_path = "/home/konstantin-nomerotski/Documents/ligand-x/.cursor/debug.log"
        try:
            with open(_log_path, "a") as _lf:
                _lf.write(_json.dumps({"timestamp": int(_time.time()*1000),"location":"graph_renderer.py:render_network_graph","hypothesisId":"E","message":"backend received","data":{"nodes":nodes,"smiles_keys":list(ligand_smiles.keys()),"molfile_keys":list(ligand_molfiles.keys()),"smiles_sample":{k:v[:30] for k,v in list(ligand_smiles.items())[:3]},"missing_smiles":missing_smiles}}) + "\n")
        except Exception:
            pass
        # #endregion

        # Create figure
        # Use 100 DPI for screen rendering to keep text sizes reasonable relative to pixel dimensions
        self.dpi = 100
        fig_width = width / self.dpi
        fig_height = height / self.dpi
        
        fig, ax = plt.subplots(figsize=(fig_width, fig_height), dpi=self.dpi)
        ax.set_xlim(0, width)
        ax.set_ylim(0, height)
        ax.set_aspect('equal')
        ax.axis('off')
        ax.set_facecolor('white')
        fig.patch.set_facecolor('white')
        
        if not nodes:
            # Empty graph
            ax.text(width/2, height/2, "No ligands to display", ha='center', va='center', fontsize=12)
            buf = io.BytesIO()
            fig.savefig(buf, format='png', bbox_inches='tight', facecolor='white')
            plt.close(fig)
            buf.seek(0)
            return buf.getvalue()
        
        # Calculate positions with more padding
        positions = self._circular_layout(nodes, width, height, padding=0.25)
        
        # Build DDG lookup
        ddg_lookup = {}
        if ddg_values:
            for ddg in ddg_values:
                key = (ddg.get('ligand_a'), ddg.get('ligand_b'))
                ddg_lookup[key] = ddg
                ddg_lookup[(key[1], key[0])] = ddg  # Both directions
        
        # Render molecule images
        node_images = {}
        for node in nodes:
            smiles = ligand_smiles.get(node)
            molblock = ligand_molfiles.get(node)
            if not smiles:
                logger.warning(f"No SMILES found for node {node}")
            
            img = self.render_molecule_image(smiles) if smiles else None
            if img is None and molblock:
                img = self.render_molecule_image_from_molblock(molblock)
            if img is None:
                if smiles:
                    logger.warning(f"Failed to render image for node {node} (SMILES: {smiles[:15]}...)")
                img = self._create_placeholder_image(node)
            node_images[node] = img
        
        # Draw edges first (behind nodes)
        # Scale sizes based on resolution, but keep them reasonable
        # Base scale on 800px width
        scale_factor = width / 800.0
        node_radius = 45 * scale_factor
        
        for edge in edges:
            a, b = edge.get('ligand_a'), edge.get('ligand_b')
            if a not in positions or b not in positions:
                continue
            
            x1, y1 = positions[a]
            x2, y2 = positions[b]
            
            # Get DDG for this edge
            ddg_info = ddg_lookup.get((a, b))
            ddg_val = ddg_info.get('ddg_kcal_mol') if ddg_info else None
            score = edge.get('score')
            
            color = self._get_edge_color(ddg_val, score)
            
            # Shorten line to not overlap with nodes
            dx, dy = x2 - x1, y2 - y1
            dist = math.sqrt(dx*dx + dy*dy)
            if dist > 0:
                shorten = node_radius + (10 * scale_factor)
                ratio = (dist - shorten) / dist
                x2_short = x1 + dx * ratio
                y2_short = y1 + dy * ratio
                
                # Draw edge line
                ax.plot([x1, x2_short], [y1, y2_short], color=color, linewidth=2 * scale_factor, alpha=0.7, zorder=1)
                
                # Draw arrowhead
                arrow_size = 10 * scale_factor
                angle = math.atan2(dy, dx)
                ax.annotate('', xy=(x2_short, y2_short), xytext=(x2_short - arrow_size*math.cos(angle), y2_short - arrow_size*math.sin(angle)),
                           arrowprops=dict(arrowstyle='->', color=color, lw=2 * scale_factor), zorder=1)
                
                # Draw DDG label on edge
                if ddg_val is not None:
                    mid_x = (x1 + x2_short) / 2
                    mid_y = (y1 + y2_short) / 2
                    # Offset perpendicular to edge
                    perp_angle = angle + math.pi / 2
                    offset = 14 * scale_factor
                    label_x = mid_x + offset * math.cos(perp_angle)
                    label_y = mid_y + offset * math.sin(perp_angle)
                    
                    # Background circle for label
                    circle = plt.Circle((label_x, label_y), 12 * scale_factor, color='white', ec=color, linewidth=1.5 * scale_factor, zorder=2)
                    ax.add_patch(circle)
                    ax.text(label_x, label_y, f"{ddg_val:.1f}", ha='center', va='center', 
                           fontsize=8 * scale_factor, fontweight='bold', color=color, zorder=3)
        
        # Draw nodes with molecule images
        for node in nodes:
            x, y = positions[node]
            img = node_images[node]
            
            # Create circular mask for image
            # Scale imagebox to fit node_radius
            # The image size is self.image_size (default 100). 
            # node_radius is roughly 45px at 800px width.
            # Zoom factor calculation:
            zoom = (node_radius * 2 * 0.7) / self.image_size
            
            imagebox = OffsetImage(img, zoom=zoom)
            ab = AnnotationBbox(imagebox, (x, y), frameon=False, zorder=4)
            ax.add_artist(ab)

            # Add label below node
            display_name = node[:12] + '..' if len(node) > 14 else node
            ax.text(x, y - node_radius * 1.2, display_name, ha='center', va='top', 
                   fontsize=9 * scale_factor, fontweight='600', color='#1f2937', zorder=6)
        
        # Add title
        if title:
            ax.text(width/2, height - 15, title, ha='center', va='top', 
                   fontsize=14 * scale_factor, fontweight='bold', color='#1f2937')
        else:
            ax.text(width/2, height - 15, f"RBFE Network Graph ({topology.upper()})", 
                   ha='center', va='top', fontsize=14 * scale_factor, fontweight='bold', color='#1f2937')
        
        # Add legend
        legend_y = 30 * scale_factor
        legend_x_start = 20 * scale_factor
        line_len = 25 * scale_factor
        
        ax.plot([legend_x_start, legend_x_start + line_len], [legend_y + 20, legend_y + 20], color='#16a34a', linewidth=2.5 * scale_factor)
        ax.text(legend_x_start + line_len + 8, legend_y + 20, "Improved (<0)", va='center', fontsize=9 * scale_factor, color='#374151')
        
        ax.plot([legend_x_start, legend_x_start + line_len], [legend_y, legend_y], color='#dc2626', linewidth=2.5 * scale_factor)
        ax.text(legend_x_start + line_len + 8, legend_y, "Weaker (>0)", va='center', fontsize=9 * scale_factor, color='#374151')
        
        # Save to bytes
        buf = io.BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight', facecolor='white', edgecolor='none', dpi=self.dpi)
        plt.close(fig)
        buf.seek(0)
        return buf.getvalue()


def render_network_graph(
    nodes: List[str],
    edges: List[Dict[str, Any]],
    ligand_smiles: Dict[str, str],
    ligand_molfiles: Optional[Dict[str, str]] = None,
    ddg_values: Optional[List[Dict[str, Any]]] = None,
    title: Optional[str] = None,
    topology: str = "network",
    width: int = 800,
    height: int = 600,
) -> bytes:
    """
    Convenience function to render a network graph.
    
    Args:
        nodes: List of node names (ligand identifiers)
        edges: List of edge dicts with ligand_a, ligand_b, score
        ligand_smiles: Dict mapping node names to SMILES strings
        ligand_molfiles: Optional dict mapping node names to molblock/SDF strings
        ddg_values: Optional list of DDG values for edges
        title: Optional title for the graph
        topology: Network topology name for display
        width: Image width in pixels
        height: Image height in pixels
        
    Returns:
        PNG image as bytes
    """
    renderer = CinnabarGraphRenderer()
    return renderer.render_network_graph(
        nodes=nodes,
        edges=edges,
        ligand_smiles=ligand_smiles,
        ligand_molfiles=ligand_molfiles,
        ddg_values=ddg_values,
        title=title,
        topology=topology,
        width=width,
        height=height,
    )
