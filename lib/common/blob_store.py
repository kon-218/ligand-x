"""
Blob Store for molecular data.

Implements the Claim Check pattern for large molecular files (PDB, SDF, trajectories).
Instead of passing large data through HTTP requests, services store blobs and pass
blob_ids as references.

This implementation uses the local filesystem. Can be upgraded to MinIO/S3 for
production deployments.

Usage:
    from lib.common.blob_store import get_blob_store
    
    store = get_blob_store()
    
    # Store a PDB file
    blob_id = store.store(pdb_data.encode(), extension='pdb')
    
    # Retrieve later
    data = store.retrieve(blob_id, extension='pdb')
    
    # Or get path for services that need file access
    path = store.get_path(blob_id, extension='pdb')
"""

import os
import hashlib
import logging
import shutil
from pathlib import Path
from typing import Optional, Union
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class BlobStore:
    """
    Simple file-based blob storage for molecular data.
    
    Blobs are stored with content-addressable IDs (SHA256 hash prefix).
    This provides automatic deduplication - identical files get the same ID.
    """
    
    def __init__(self, base_path: Optional[str] = None):
        """
        Initialize blob store.
        
        Args:
            base_path: Base directory for blob storage.
                      Defaults to /app/data/molecular_data or ./data/molecular_data
        """
        if base_path:
            self.base_path = Path(base_path)
        else:
            # Try container path first, fall back to local
            container_path = Path('/app/data/molecular_data')
            local_path = Path('./data/molecular_data')
            
            if container_path.parent.exists():
                self.base_path = container_path
            else:
                self.base_path = local_path
        
        self.base_path.mkdir(parents=True, exist_ok=True)
        logger.info(f"BlobStore initialized at {self.base_path}")
    
    def _compute_blob_id(self, data: bytes) -> str:
        """
        Compute content-addressable blob ID.
        
        Uses SHA256 hash truncated to 16 characters for reasonable
        uniqueness while keeping IDs manageable.
        """
        return hashlib.sha256(data).hexdigest()[:16]
    
    def _get_blob_path(self, blob_id: str, extension: str) -> Path:
        """Get the filesystem path for a blob."""
        # Use first 2 chars as subdirectory for better filesystem performance
        subdir = blob_id[:2]
        return self.base_path / subdir / f"{blob_id}.{extension}"
    
    def store(
        self, 
        data: Union[bytes, str], 
        extension: str = 'pdb',
        blob_id: Optional[str] = None
    ) -> str:
        """
        Store blob and return blob_id.
        
        Args:
            data: Binary or string data to store
            extension: File extension (pdb, sdf, mol2, xyz, etc.)
            blob_id: Optional explicit blob ID (otherwise computed from content)
        
        Returns:
            blob_id that can be used to retrieve the data
        """
        # Convert string to bytes if needed
        if isinstance(data, str):
            data = data.encode('utf-8')
        
        # Compute or use provided blob_id
        if blob_id is None:
            blob_id = self._compute_blob_id(data)
        
        blob_path = self._get_blob_path(blob_id, extension)
        
        # Create subdirectory if needed
        blob_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write blob (atomic write with temp file)
        temp_path = blob_path.with_suffix('.tmp')
        try:
            temp_path.write_bytes(data)
            temp_path.rename(blob_path)
            logger.debug(f"Stored blob {blob_id}.{extension} ({len(data)} bytes)")
        except Exception as e:
            if temp_path.exists():
                temp_path.unlink()
            raise RuntimeError(f"Failed to store blob: {e}")
        
        return blob_id
    
    def store_file(self, file_path: Union[str, Path], extension: Optional[str] = None) -> str:
        """
        Store a file as a blob.
        
        Args:
            file_path: Path to file to store
            extension: Override extension (defaults to file's extension)
        
        Returns:
            blob_id
        """
        file_path = Path(file_path)
        
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        if extension is None:
            extension = file_path.suffix.lstrip('.') or 'bin'
        
        data = file_path.read_bytes()
        return self.store(data, extension)
    
    def retrieve(self, blob_id: str, extension: str = 'pdb') -> Optional[bytes]:
        """
        Retrieve blob by ID.
        
        Args:
            blob_id: Blob identifier
            extension: File extension
        
        Returns:
            Blob data as bytes, or None if not found
        """
        blob_path = self._get_blob_path(blob_id, extension)
        
        if blob_path.exists():
            return blob_path.read_bytes()
        
        logger.warning(f"Blob not found: {blob_id}.{extension}")
        return None
    
    def retrieve_text(self, blob_id: str, extension: str = 'pdb') -> Optional[str]:
        """
        Retrieve blob as text.
        
        Args:
            blob_id: Blob identifier
            extension: File extension
        
        Returns:
            Blob data as string, or None if not found
        """
        data = self.retrieve(blob_id, extension)
        if data:
            return data.decode('utf-8')
        return None
    
    def get_path(self, blob_id: str, extension: str = 'pdb') -> Optional[Path]:
        """
        Get filesystem path for blob.
        
        Useful for services that need direct file access.
        
        Args:
            blob_id: Blob identifier
            extension: File extension
        
        Returns:
            Path to blob file, or None if not found
        """
        blob_path = self._get_blob_path(blob_id, extension)
        
        if blob_path.exists():
            return blob_path
        
        return None
    
    def exists(self, blob_id: str, extension: str = 'pdb') -> bool:
        """Check if blob exists."""
        return self._get_blob_path(blob_id, extension).exists()
    
    def delete(self, blob_id: str, extension: str = 'pdb') -> bool:
        """
        Delete a blob.
        
        Args:
            blob_id: Blob identifier
            extension: File extension
        
        Returns:
            True if deleted, False if not found
        """
        blob_path = self._get_blob_path(blob_id, extension)
        
        if blob_path.exists():
            blob_path.unlink()
            logger.debug(f"Deleted blob {blob_id}.{extension}")
            return True
        
        return False
    
    def get_size(self, blob_id: str, extension: str = 'pdb') -> Optional[int]:
        """Get blob size in bytes."""
        blob_path = self._get_blob_path(blob_id, extension)
        
        if blob_path.exists():
            return blob_path.stat().st_size
        
        return None
    
    def list_blobs(self, extension: Optional[str] = None) -> list:
        """
        List all blob IDs.
        
        Args:
            extension: Filter by extension
        
        Returns:
            List of (blob_id, extension) tuples
        """
        blobs = []
        
        for subdir in self.base_path.iterdir():
            if not subdir.is_dir():
                continue
            
            for blob_file in subdir.iterdir():
                if blob_file.is_file():
                    blob_id = blob_file.stem
                    ext = blob_file.suffix.lstrip('.')
                    
                    if extension is None or ext == extension:
                        blobs.append((blob_id, ext))
        
        return blobs
    
    def cleanup_old_blobs(self, max_age_days: int = 30) -> int:
        """
        Remove blobs older than specified age.
        
        Args:
            max_age_days: Maximum age in days
        
        Returns:
            Number of blobs deleted
        """
        cutoff = datetime.now() - timedelta(days=max_age_days)
        deleted = 0
        
        for subdir in self.base_path.iterdir():
            if not subdir.is_dir():
                continue
            
            for blob_file in subdir.iterdir():
                if blob_file.is_file():
                    mtime = datetime.fromtimestamp(blob_file.stat().st_mtime)
                    if mtime < cutoff:
                        blob_file.unlink()
                        deleted += 1
        
        if deleted > 0:
            logger.info(f"Cleaned up {deleted} old blobs")
        
        return deleted
    
    def get_stats(self) -> dict:
        """Get storage statistics."""
        total_size = 0
        total_count = 0
        by_extension = {}
        
        for subdir in self.base_path.iterdir():
            if not subdir.is_dir():
                continue
            
            for blob_file in subdir.iterdir():
                if blob_file.is_file():
                    size = blob_file.stat().st_size
                    ext = blob_file.suffix.lstrip('.')
                    
                    total_size += size
                    total_count += 1
                    
                    if ext not in by_extension:
                        by_extension[ext] = {'count': 0, 'size': 0}
                    by_extension[ext]['count'] += 1
                    by_extension[ext]['size'] += size
        
        return {
            'total_count': total_count,
            'total_size_bytes': total_size,
            'total_size_mb': round(total_size / (1024 * 1024), 2),
            'by_extension': by_extension
        }


# Singleton instance
_blob_store: Optional[BlobStore] = None


def get_blob_store(base_path: Optional[str] = None) -> BlobStore:
    """
    Get the singleton BlobStore instance.
    
    Args:
        base_path: Optional base path (only used on first call)
    
    Returns:
        BlobStore instance
    """
    global _blob_store
    if _blob_store is None:
        _blob_store = BlobStore(base_path)
    return _blob_store
