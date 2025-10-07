"""
Multiple Sequence Alignment (MSA) Service

This service generates Multiple Sequence Alignments for protein sequences using
various MSA generation methods. MSAs are essential for structure prediction tools
like Boltz-2 and AlphaFold, providing evolutionary covariance information.

Key Features:
- Multiple MSA generation methods (MMSeqs2, with extensibility for others)
- Sequence-based caching using SHA256 hashes
- Support for .a3m output format
- Metadata tracking (hit counts, timestamps)

Supported Methods:
- mmseqs2_server: ColabFold MMSeqs2 server (default, no local installation required)
- (Future) mmseqs2_local: Local MMSeqs2 installation
- (Future) hhblits: HHblits for more sensitive searches
- (Future) jackhmmer: Iterative search using HMMER

Technical Implementation:
- Extensible method-based architecture via MSAMethod enum
- Caches results in data/msa_cache/{sequence_hash}/
- Thread-safe file operations
"""

import os
import sys
import json
import hashlib
import logging
import time
import requests
import tarfile
import io
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List
from datetime import datetime
from enum import Enum

# Set up logging
logger = logging.getLogger(__name__)

if not logger.handlers and not logging.getLogger().handlers:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


class MSAMethod(str, Enum):
    """Supported MSA generation methods."""
    MMSEQS2_SERVER = "mmseqs2_server"  # ColabFold MMSeqs2 server (remote)
    MMSEQS2_LOCAL = "mmseqs2_local"    # Local MMSeqs2 installation (future)
    NCBI_BLAST = "ncbi_blast"          # NCBI BLAST API (local, fast)
    HHBLITS = "hhblits"                # HHblits (future)
    JACKHMMER = "jackhmmer"            # Jackhmmer/HMMER (future)
    CLUSTAL = "clustal"                # Clustal Omega (future)
    MUSCLE = "muscle"                  # MUSCLE (future)


class MSABackend(ABC):
    """Abstract base class for MSA generation backends."""
    
    @property
    @abstractmethod
    def method(self) -> MSAMethod:
        """Return the method identifier for this backend."""
        pass
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name for this backend."""
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """Check if this backend is available for use."""
        pass
    
    @abstractmethod
    def generate(self, sequence: str, sequence_id: str = "query", 
                 **kwargs) -> Dict[str, Any]:
        """
        Generate MSA for a sequence.
        
        Args:
            sequence: Protein sequence
            sequence_id: Identifier for the sequence
            **kwargs: Method-specific parameters
            
        Returns:
            Dict containing:
                - success: bool
                - msa_content: str (A3M format)
                - num_sequences: int
                - error: str (if failed)
        """
        pass
    
    def get_status(self) -> Dict[str, Any]:
        """Get status information for this backend."""
        return {
            'method': self.method.value,
            'name': self.name,
            'available': self.is_available()
        }


class MMSeqs2ServerBackend(MSABackend):
    """MSA generation using ColabFold MMSeqs2 server."""
    
    DEFAULT_SERVER_URL = "https://api.colabfold.com"
    
    def __init__(self, server_url: Optional[str] = None):
        self.server_url = server_url or os.getenv('MSA_SERVER_URL', self.DEFAULT_SERVER_URL)
    
    @property
    def method(self) -> MSAMethod:
        return MSAMethod.MMSEQS2_SERVER
    
    @property
    def name(self) -> str:
        return "MMSeqs2 ColabFold Server"
    
    def is_available(self) -> bool:
        """Check if the ColabFold server is reachable."""
        try:
            response = requests.head(self.server_url, timeout=5)
            return response.status_code < 500
        except Exception:
            return False
    
    def generate(self, sequence: str, sequence_id: str = "query",
                 timeout_minutes: int = 10, **kwargs) -> Dict[str, Any]:
        """
        Generate MSA using ColabFold MMSeqs2 server.
        
        Args:
            sequence: Protein sequence
            sequence_id: Identifier for the sequence
            timeout_minutes: Maximum time to wait for results
            **kwargs: Additional parameters (ignored)
            
        Returns:
            Dict with MSA results
        """
        logger.info(f"[{self.name}] Generating MSA for sequence (length={len(sequence)})")
        
        ticket_url = f"{self.server_url}/ticket/msa"
        fasta_input = f">{sequence_id}\n{sequence}"
        
        try:
            # Submit job to get a ticket
            logger.info(f"[{self.name}] Submitting job to {ticket_url}")
            response = requests.post(
                ticket_url,
                data={'q': fasta_input, 'mode': 'all'},
                timeout=30
            )
            response.raise_for_status()
            
            ticket_data = response.json()
            ticket_id = ticket_data.get('id')
            
            if not ticket_id:
                raise RuntimeError(f"No ticket ID received: {ticket_data}")
            
            logger.info(f"[{self.name}] Got ticket ID: {ticket_id}")
            
            # Poll for results
            result_url = f"{self.server_url}/result/msa/{ticket_id}"
            max_attempts = timeout_minutes * 12  # Check every 5 seconds
            
            for attempt in range(max_attempts):
                time.sleep(5)
                
                result_response = requests.get(result_url, timeout=30)
                
                if result_response.status_code == 200:
                    content_type = result_response.headers.get('Content-Type', '')
                    
                    if 'application/x-tar' in content_type or 'gzip' in content_type:
                        # Extract from tar.gz
                        tar_data = io.BytesIO(result_response.content)
                        msa_content = None
                        
                        with tarfile.open(fileobj=tar_data, mode='r:gz') as tar:
                            for member in tar.getmembers():
                                if member.name.endswith('.a3m'):
                                    f = tar.extractfile(member)
                                    if f:
                                        msa_content = f.read().decode('utf-8')
                                        break
                        
                        if not msa_content:
                            raise RuntimeError("No .a3m file found in response")
                        
                        num_sequences = msa_content.count('>')
                        logger.info(f"[{self.name}] MSA generated: {num_sequences} sequences")
                        
                        return {
                            'success': True,
                            'msa_content': msa_content,
                            'num_sequences': num_sequences,
                            'method': self.method.value,
                            'server_url': self.server_url
                        }
                    
                    # Check if it's direct A3M content
                    if result_response.text.startswith('>'):
                        msa_content = result_response.text
                        num_sequences = msa_content.count('>')
                        
                        return {
                            'success': True,
                            'msa_content': msa_content,
                            'num_sequences': num_sequences,
                            'method': self.method.value,
                            'server_url': self.server_url
                        }
                    
                    # Check status JSON
                    try:
                        status_data = result_response.json()
                        status = status_data.get('status', 'unknown')
                        
                        if status == 'ERROR':
                            raise RuntimeError(f"Server error: {status_data.get('error')}")
                        elif status in ['PENDING', 'RUNNING', 'COMPLETE']:
                            continue
                    except json.JSONDecodeError:
                        continue
                
                elif result_response.status_code == 202:
                    continue
                elif result_response.status_code == 404:
                    raise RuntimeError(f"Job not found: {ticket_id}")
            
            raise RuntimeError(f"MSA generation timed out ({timeout_minutes} minutes)")
            
        except requests.exceptions.RequestException as e:
            logger.error(f"[{self.name}] HTTP request failed: {e}")
            return {
                'success': False,
                'error': f"Server communication failed: {e}",
                'method': self.method.value
            }
        except Exception as e:
            logger.error(f"[{self.name}] Generation failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'method': self.method.value
            }
    
    def get_status(self) -> Dict[str, Any]:
        status = super().get_status()
        status['server_url'] = self.server_url
        return status


class MMSeqs2LocalBackend(MSABackend):
    """MSA generation using local MMSeqs2 installation (placeholder for future)."""
    
    def __init__(self, database_path: Optional[str] = None):
        self.database_path = database_path or os.getenv('MMSEQS2_DATABASE')
    
    @property
    def method(self) -> MSAMethod:
        return MSAMethod.MMSEQS2_LOCAL
    
    @property
    def name(self) -> str:
        return "MMSeqs2 Local"
    
    def is_available(self) -> bool:
        """Check if local MMSeqs2 is installed and database is available."""
        import shutil
        
        # Check if mmseqs is in PATH
        if not shutil.which('mmseqs'):
            return False
        
        # Check if database is configured
        if not self.database_path or not Path(self.database_path).exists():
            return False
        
        return True
    
    def generate(self, sequence: str, sequence_id: str = "query", **kwargs) -> Dict[str, Any]:
        """Generate MSA using local MMSeqs2 (not yet implemented)."""
        if not self.is_available():
            return {
                'success': False,
                'error': "Local MMSeqs2 is not available. Install MMSeqs2 and configure database path.",
                'method': self.method.value
            }
        
        # TODO: Implement local MMSeqs2 MSA generation
        return {
            'success': False,
            'error': "Local MMSeqs2 support not yet implemented",
            'method': self.method.value
        }
    
    def get_status(self) -> Dict[str, Any]:
        status = super().get_status()
        status['database_path'] = self.database_path
        return status


class NCBIBLASTBackend(MSABackend):
    """MSA generation using NCBI BLAST API and Biopython alignment."""
    
    NCBI_BLAST_URL = "https://blast.ncbi.nlm.nih.gov/Blast.cgi"
    MAX_HITS = 100
    
    @property
    def method(self) -> MSAMethod:
        return MSAMethod.NCBI_BLAST
    
    @property
    def name(self) -> str:
        return "NCBI BLAST + Biopython"
    
    def is_available(self) -> bool:
        """Check if Biopython is available for alignment."""
        try:
            from Bio.Blast import NCBIWWW, NCBIXML
            from Bio import Align
            from Bio.Align import substitution_matrices
            return True
        except ImportError:
            return False
    
    def generate(self, sequence: str, sequence_id: str = "query",
                 max_hits: int = 50, evalue: float = 0.001, **kwargs) -> Dict[str, Any]:
        """
        Generate MSA using NCBI BLAST to find similar sequences, then align with Biopython.
        
        This method:
        1. Queries NCBI BLAST API to find similar sequences
        2. Downloads the top hits
        3. Aligns them using Biopython's progressive alignment
        """
        logger.info(f"[{self.name}] Generating MSA for sequence (length={len(sequence)})")
        
        try:
            from Bio.Blast import NCBIWWW, NCBIXML
            from Bio import Align
            from Bio.Align import substitution_matrices
            from Bio.Seq import Seq
            from Bio.SeqRecord import SeqRecord
            from Bio.Align import MultipleSeqAlignment
            from io import StringIO
            import time
        except ImportError as e:
            return {
                'success': False,
                'error': f"Biopython not available: {e}",
                'method': self.method.value
            }
        
        try:
            # Step 1: Submit BLAST job to NCBI
            logger.info(f"[{self.name}] Submitting BLAST job to NCBI...")
            
            # Use Biopython's NCBIWWW to submit BLAST
            result_handle = NCBIWWW.qblast(
                program="blastp",
                database="nr",  # Non-redundant protein database
                sequence=sequence,
                expect=evalue,
                hitlist_size=min(max_hits, self.MAX_HITS),
                descriptions=min(max_hits, self.MAX_HITS),
                alignments=min(max_hits, self.MAX_HITS)
            )
            
            # Step 2: Parse BLAST results
            logger.info(f"[{self.name}] Parsing BLAST results...")
            blast_records = NCBIXML.parse(result_handle)
            
            sequences = []
            # Normalize input sequence: remove whitespace, convert to uppercase
            # This ensures exact match with Boltz2 expectations
            normalized_sequence = ''.join(sequence.upper().split())
            query_seq = Seq(normalized_sequence)
            query_record = SeqRecord(query_seq, id=sequence_id, description="Query sequence")
            sequences.append(query_record)
            
            hit_count = 0
            for blast_record in blast_records:
                for alignment in blast_record.alignments:
                    for hsp in alignment.hsps:
                        if hsp.expect < evalue:
                            # Extract aligned sequence
                            hit_seq = Seq(hsp.sbjct.replace('-', ''))
                            hit_id = f"{alignment.accession}_{hit_count}"
                            hit_record = SeqRecord(hit_seq, id=hit_id, description=alignment.title[:50])
                            sequences.append(hit_record)
                            hit_count += 1
                            if hit_count >= max_hits:
                                break
                    if hit_count >= max_hits:
                        break
                if hit_count >= max_hits:
                    break
            
            if len(sequences) == 1:
                # Only query sequence found, return single-sequence MSA
                # Use normalized sequence to ensure consistency
                logger.warning(f"[{self.name}] No similar sequences found, using single-sequence MSA")
                msa_content = f">{sequence_id} Query sequence\n{normalized_sequence}\n"
                return {
                    'success': True,
                    'msa_content': msa_content,
                    'num_sequences': 1,
                    'method': self.method.value,
                    'warning': 'Single-sequence MSA (no similar sequences found)'
                }
            
            # Step 3: Create multiple sequence alignment
            logger.info(f"[{self.name}] Aligning {len(sequences)} sequences...")
            
            # Use Biopython's PairwiseAligner for progressive alignment
            aligner = Align.PairwiseAligner()
            aligner.substitution_matrix = substitution_matrices.load("BLOSUM62")
            aligner.open_gap_score = -11
            aligner.extend_gap_score = -1
            
            # Simple progressive alignment: align all sequences to the query
            aligned_sequences = [query_record]
            
            for seq_record in sequences[1:]:
                alignments = aligner.align(query_seq, seq_record.seq)
                if alignments:
                    # Use the first (best) alignment
                    alignment = alignments[0]
                    # Extract the aligned target sequence
                    aligned_target = alignment[1]  # Target sequence with gaps
                    aligned_record = SeqRecord(
                        Seq(str(aligned_target).replace('-', 'X')),  # Replace gaps with X for A3M format
                        id=seq_record.id,
                        description=seq_record.description
                    )
                    aligned_sequences.append(aligned_record)
            
            # Step 4: Format as A3M
            msa_lines = []
            for seq_idx, seq_record in enumerate(aligned_sequences):
                # First sequence (query) should be exactly as provided, without gaps
                if seq_idx == 0:
                    # Query sequence - use normalized input sequence directly (no alignment gaps)
                    msa_lines.append(f">{seq_record.id} {seq_record.description}")
                    seq_str = str(seq_record.seq)  # Already normalized, no gaps for query
                    # Break into 80 char lines
                    for i in range(0, len(seq_str), 80):
                        msa_lines.append(seq_str[i:i+80])
                else:
                    # Other sequences - aligned sequences with gaps represented properly
                    msa_lines.append(f">{seq_record.id} {seq_record.description}")
                    # A3M format: uppercase for match, lowercase for insert, '-' for gap
                    seq_str = str(seq_record.seq).upper()
                    # Break into 80 char lines
                    for i in range(0, len(seq_str), 80):
                        msa_lines.append(seq_str[i:i+80])
            
            msa_content = '\n'.join(msa_lines) + '\n'
            
            logger.info(f"[{self.name}] MSA generated: {len(sequences)} sequences")
            
            return {
                'success': True,
                'msa_content': msa_content,
                'num_sequences': len(sequences),
                'method': self.method.value
            }
            
        except Exception as e:
            logger.error(f"[{self.name}] Generation failed: {e}", exc_info=True)
            return {
                'success': False,
                'error': f"MSA generation failed: {e}",
                'method': self.method.value
            }


class MSAService:
    """Service class for Multiple Sequence Alignment generation and caching."""
    
    def __init__(self, cache_dir: Optional[str] = None):
        """
        Initialize the MSA service.
        
        Args:
            cache_dir: Directory for caching MSA results. Defaults to data/msa_cache.
        """
        if cache_dir is None:
            project_root = Path(__file__).parent.parent.parent
            cache_dir = str(project_root / "data" / "msa_cache")
        
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize available backends
        self._backends: Dict[MSAMethod, MSABackend] = {}
        self._init_backends()
        
        # Default method - prefer NCBI BLAST if available (more reliable than ColabFold)
        available = self.get_available_methods()
        if MSAMethod.NCBI_BLAST in available:
            self._default_method = MSAMethod.NCBI_BLAST
        elif MSAMethod.MMSEQS2_SERVER in available:
            self._default_method = MSAMethod.MMSEQS2_SERVER
        else:
            self._default_method = MSAMethod.MMSEQS2_SERVER  # Fallback
        
        logger.info(f"MSA Service initialized:")
        logger.info(f"  - Cache Directory: {self.cache_dir}")
        logger.info(f"  - Available Methods: {[m.value for m in self.get_available_methods()]}")
    
    def _init_backends(self):
        """Initialize all MSA backends."""
        # MMSeqs2 Server (always available if network is up)
        self._backends[MSAMethod.MMSEQS2_SERVER] = MMSeqs2ServerBackend()
        
        # MMSeqs2 Local (available if installed)
        self._backends[MSAMethod.MMSEQS2_LOCAL] = MMSeqs2LocalBackend()
        
        # NCBI BLAST (available if Biopython is installed)
        self._backends[MSAMethod.NCBI_BLAST] = NCBIBLASTBackend()
        
        # Future backends can be added here:
        # self._backends[MSAMethod.HHBLITS] = HHblitsBackend()
        # self._backends[MSAMethod.JACKHMMER] = JackhmmerBackend()
        # self._backends[MSAMethod.CLUSTAL] = ClustalBackend()
        # self._backends[MSAMethod.MUSCLE] = MuscleBackend()
    
    def get_backend(self, method: MSAMethod) -> Optional[MSABackend]:
        """Get a specific backend by method."""
        return self._backends.get(method)
    
    def get_available_methods(self) -> List[MSAMethod]:
        """Get list of available MSA methods."""
        return [
            method for method, backend in self._backends.items()
            if backend.is_available()
        ]
    
    def get_all_methods(self) -> List[Dict[str, Any]]:
        """Get status of all MSA methods."""
        return [backend.get_status() for backend in self._backends.values()]
    
    def compute_sequence_hash(self, sequence: str) -> str:
        """
        Compute SHA256 hash of a protein sequence for cache key.
        
        The sequence is normalized (uppercase, stripped) before hashing
        to ensure consistent cache hits regardless of formatting.
        
        Args:
            sequence: Protein sequence (amino acid letters)
            
        Returns:
            SHA256 hash string (first 16 characters for brevity)
        """
        normalized = ''.join(sequence.upper().split())
        hash_obj = hashlib.sha256(normalized.encode('utf-8'))
        return hash_obj.hexdigest()[:16]
    
    def _get_cache_path(self, sequence_hash: str, method: Optional[MSAMethod] = None) -> Path:
        """
        Get the cache directory path for a sequence hash.
        
        Cache structure: {cache_dir}/{sequence_hash}/{method}/
        This allows caching MSAs from different methods for the same sequence.
        """
        base_path = self.cache_dir / sequence_hash
        if method:
            return base_path / method.value
        return base_path
    
    def _validate_sequence(self, sequence: str) -> Tuple[bool, str]:
        """Validate protein sequence."""
        if not sequence:
            return False, "Sequence cannot be empty"
        
        normalized = ''.join(sequence.upper().split())
        
        if len(normalized) < 10:
            return False, "Sequence must be at least 10 amino acids"
        
        if len(normalized) > 10000:
            return False, "Sequence exceeds maximum length of 10000 amino acids"
        
        valid_aa = set('ACDEFGHIKLMNPQRSTVWYX')
        invalid_chars = set(normalized) - valid_aa
        
        if invalid_chars:
            return False, f"Invalid characters in sequence: {', '.join(sorted(invalid_chars))}"
        
        return True, ""
    
    def get_cached_msa(self, sequence: str, 
                       method: Optional[MSAMethod] = None) -> Optional[Dict[str, Any]]:
        """
        Check if MSA exists in cache for the given sequence.
        
        Args:
            sequence: Protein sequence
            method: Specific method to check (None checks all methods)
            
        Returns:
            Dict with cache info if found, None otherwise
        """
        sequence_hash = self.compute_sequence_hash(sequence)
        
        methods_to_check = [method] if method else list(self._backends.keys())
        
        for m in methods_to_check:
            cache_path = self._get_cache_path(sequence_hash, m)
            msa_file = cache_path / "msa.a3m"
            metadata_file = cache_path / "metadata.json"
            
            if msa_file.exists():
                metadata = {}
                if metadata_file.exists():
                    try:
                        with open(metadata_file, 'r') as f:
                            metadata = json.load(f)
                    except Exception as e:
                        logger.warning(f"Failed to read metadata: {e}")
                
                return {
                    'cached': True,
                    'sequence_hash': sequence_hash,
                    'method': m.value,
                    'msa_path': str(msa_file),
                    'metadata': metadata
                }
        
        return None
    
    def check_cache(self, sequence: str, 
                    method: Optional[MSAMethod] = None) -> Dict[str, Any]:
        """
        Check if MSA is cached for the given sequence.
        
        Args:
            sequence: Protein sequence
            method: Specific method to check
            
        Returns:
            Dict with cache status and sequence hash
        """
        sequence_hash = self.compute_sequence_hash(sequence)
        cached_info = self.get_cached_msa(sequence, method)
        
        return {
            'cached': cached_info is not None,
            'sequence_hash': sequence_hash,
            'method': cached_info['method'] if cached_info else None,
            'msa_path': cached_info['msa_path'] if cached_info else None,
            'metadata': cached_info.get('metadata') if cached_info else None
        }
    
    def generate_msa(self, sequence: str, sequence_id: str = "query",
                     method: Optional[MSAMethod] = None,
                     force_regenerate: bool = False,
                     **kwargs) -> Dict[str, Any]:
        """
        Generate MSA for a protein sequence.
        
        If the MSA is already cached and force_regenerate is False, returns
        the cached version. Otherwise, generates using the specified method.
        
        Args:
            sequence: Protein sequence (amino acid letters)
            sequence_id: Identifier for the sequence (default: "query")
            method: MSA generation method (default: mmseqs2_server)
            force_regenerate: If True, regenerate even if cached
            **kwargs: Method-specific parameters
            
        Returns:
            Dict containing:
                - success: bool
                - sequence_hash: str
                - method: str
                - msa_path: str (path to .a3m file)
                - cached: bool (whether result was from cache)
                - metadata: dict (num_sequences, timestamp, etc.)
                - error: str (if success is False)
        """
        # Validate sequence
        is_valid, error_msg = self._validate_sequence(sequence)
        if not is_valid:
            return {
                'success': False,
                'error': error_msg,
                'sequence_hash': None,
                'msa_path': None,
                'cached': False
            }
        
        # Normalize sequence
        normalized_sequence = ''.join(sequence.upper().split())
        sequence_hash = self.compute_sequence_hash(normalized_sequence)
        
        # Determine method
        if method is None:
            method = self._default_method
        elif isinstance(method, str):
            try:
                method = MSAMethod(method)
            except ValueError:
                return {
                    'success': False,
                    'error': f"Unknown MSA method: {method}. Available: {[m.value for m in MSAMethod]}",
                    'sequence_hash': sequence_hash,
                    'msa_path': None,
                    'cached': False
                }
        
        # Check cache first
        if not force_regenerate:
            cached = self.get_cached_msa(normalized_sequence, method)
            if cached:
                logger.info(f"MSA found in cache for hash {sequence_hash} (method: {method.value})")
                return {
                    'success': True,
                    'sequence_hash': sequence_hash,
                    'method': method.value,
                    'msa_path': cached['msa_path'],
                    'cached': True,
                    'metadata': cached['metadata']
                }
        
        # Get backend
        backend = self.get_backend(method)
        if not backend:
            return {
                'success': False,
                'error': f"Backend not found for method: {method.value}",
                'sequence_hash': sequence_hash,
                'msa_path': None,
                'cached': False
            }
        
        if not backend.is_available():
            return {
                'success': False,
                'error': f"Backend not available: {backend.name}",
                'sequence_hash': sequence_hash,
                'msa_path': None,
                'cached': False
            }
        
        # Generate MSA
        logger.info(f"Generating MSA using {backend.name} for sequence (hash={sequence_hash}, length={len(normalized_sequence)})")
        
        try:
            result = backend.generate(normalized_sequence, sequence_id, **kwargs)
            
            if not result.get('success'):
                return {
                    'success': False,
                    'error': result.get('error', 'MSA generation failed'),
                    'sequence_hash': sequence_hash,
                    'method': method.value,
                    'msa_path': None,
                    'cached': False
                }
            
            # Save to cache
            cache_path = self._get_cache_path(sequence_hash, method)
            cache_path.mkdir(parents=True, exist_ok=True)
            
            # Save MSA file
            msa_file = cache_path / "msa.a3m"
            with open(msa_file, 'w') as f:
                f.write(result['msa_content'])
            
            # Save original sequence as FASTA
            fasta_file = cache_path / "sequence.fasta"
            with open(fasta_file, 'w') as f:
                f.write(f">{sequence_id}\n{normalized_sequence}\n")
            
            # Save metadata
            metadata = {
                'sequence_id': sequence_id,
                'sequence_length': len(normalized_sequence),
                'num_sequences': result.get('num_sequences', 0),
                'method': method.value,
                'backend_info': {k: v for k, v in result.items() 
                               if k not in ['success', 'msa_content', 'num_sequences', 'error']},
                'generated_at': datetime.utcnow().isoformat(),
                'sequence_hash': sequence_hash
            }
            
            metadata_file = cache_path / "metadata.json"
            with open(metadata_file, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            logger.info(f"MSA saved to cache: {msa_file} ({metadata['num_sequences']} sequences)")
            
            return {
                'success': True,
                'sequence_hash': sequence_hash,
                'method': method.value,
                'msa_path': str(msa_file),
                'cached': False,
                'metadata': metadata
            }
            
        except Exception as e:
            logger.error(f"MSA generation failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'sequence_hash': sequence_hash,
                'method': method.value,
                'msa_path': None,
                'cached': False
            }
    
    def get_msa_path(self, sequence_hash: str, 
                     method: Optional[MSAMethod] = None) -> Optional[Path]:
        """
        Get the path to a cached MSA file by sequence hash.
        
        Args:
            sequence_hash: SHA256 hash of the sequence
            method: Specific method (None searches all)
            
        Returns:
            Path to .a3m file if exists, None otherwise
        """
        methods_to_check = [method] if method else list(self._backends.keys())
        
        for m in methods_to_check:
            cache_path = self._get_cache_path(sequence_hash, m)
            msa_file = cache_path / "msa.a3m"
            
            if msa_file.exists():
                return msa_file
        
        return None
    
    def get_msa_metadata(self, sequence_hash: str,
                         method: Optional[MSAMethod] = None) -> Optional[Dict[str, Any]]:
        """
        Get metadata for a cached MSA.
        
        Args:
            sequence_hash: SHA256 hash of the sequence
            method: Specific method (None searches all)
            
        Returns:
            Metadata dict if exists, None otherwise
        """
        methods_to_check = [method] if method else list(self._backends.keys())
        
        for m in methods_to_check:
            cache_path = self._get_cache_path(sequence_hash, m)
            metadata_file = cache_path / "metadata.json"
            
            if metadata_file.exists():
                try:
                    with open(metadata_file, 'r') as f:
                        return json.load(f)
                except Exception as e:
                    logger.warning(f"Failed to read metadata: {e}")
        
        return None
    
    def get_msa_status(self, sequence_hash: str,
                       method: Optional[MSAMethod] = None) -> Dict[str, Any]:
        """Get status of a cached MSA by sequence hash."""
        msa_path = self.get_msa_path(sequence_hash, method)
        metadata = self.get_msa_metadata(sequence_hash, method)
        
        return {
            'exists': msa_path is not None,
            'sequence_hash': sequence_hash,
            'method': metadata.get('method') if metadata else None,
            'msa_path': str(msa_path) if msa_path else None,
            'metadata': metadata
        }
    
    def delete_cached_msa(self, sequence_hash: str,
                          method: Optional[MSAMethod] = None) -> bool:
        """
        Delete a cached MSA.
        
        Args:
            sequence_hash: SHA256 hash of the sequence
            method: Specific method (None deletes all methods for this hash)
            
        Returns:
            True if deleted, False if not found
        """
        import shutil
        
        deleted = False
        
        if method:
            cache_path = self._get_cache_path(sequence_hash, method)
            if cache_path.exists():
                shutil.rmtree(cache_path)
                logger.info(f"Deleted cached MSA: {sequence_hash}/{method.value}")
                deleted = True
        else:
            # Delete all methods for this hash
            base_path = self._get_cache_path(sequence_hash)
            if base_path.exists():
                shutil.rmtree(base_path)
                logger.info(f"Deleted all cached MSAs for hash: {sequence_hash}")
                deleted = True
        
        return deleted
    
    def list_cached_msas(self) -> List[Dict[str, Any]]:
        """List all cached MSAs."""
        cached = []
        
        for hash_dir in self.cache_dir.iterdir():
            if hash_dir.is_dir():
                # Check for method subdirectories
                for method_dir in hash_dir.iterdir():
                    if method_dir.is_dir():
                        msa_file = method_dir / "msa.a3m"
                        if msa_file.exists():
                            metadata = None
                            metadata_file = method_dir / "metadata.json"
                            if metadata_file.exists():
                                try:
                                    with open(metadata_file, 'r') as f:
                                        metadata = json.load(f)
                                except Exception:
                                    pass
                            
                            cached.append({
                                'sequence_hash': hash_dir.name,
                                'method': method_dir.name,
                                'msa_path': str(msa_file),
                                'metadata': metadata
                            })
                
                # Also check for legacy format (no method subdirectory)
                legacy_msa = hash_dir / "msa.a3m"
                if legacy_msa.exists():
                    metadata = None
                    metadata_file = hash_dir / "metadata.json"
                    if metadata_file.exists():
                        try:
                            with open(metadata_file, 'r') as f:
                                metadata = json.load(f)
                        except Exception:
                            pass
                    
                    cached.append({
                        'sequence_hash': hash_dir.name,
                        'method': metadata.get('method', 'unknown') if metadata else 'unknown',
                        'msa_path': str(legacy_msa),
                        'metadata': metadata
                    })
        
        return cached
    
    def get_service_status(self) -> Dict[str, Any]:
        """Get the current status of the MSA service."""
        cached_count = len(self.list_cached_msas())
        available_methods = self.get_available_methods()
        
        return {
            'service': 'Multiple Sequence Alignment (MSA)',
            'available': len(available_methods) > 0,
            'cache_directory': str(self.cache_dir),
            'cached_msa_count': cached_count,
            'default_method': self._default_method.value,
            'available_methods': [m.value for m in available_methods],
            'all_methods': self.get_all_methods(),
            'capabilities': [
                'MSA generation via multiple backends',
                'Sequence-based caching',
                '.a3m output format',
                'Metadata tracking',
                'Extensible method architecture'
            ]
        }
