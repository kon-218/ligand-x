# Contributing to Molecular Structure Processing Application

Thank you for your interest in contributing to this molecular structure processing platform! This document provides guidelines and best practices for contributors.

## 🚀 Getting Started

### Development Environment Setup

1. **Fork and Clone**
   ```bash
   git clone <your-fork-url>
   cd app
   ```

2. **Create Virtual Environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install Dependencies**
   
   Backend dependencies are managed via Conda/Mamba environments:
   ```bash
   # Install Mamba (if not already installed)
   conda install mamba -n base -c conda-forge
   
   # Create the base environment (or specific service environment)
   mamba env create -f environments/base.yml
   conda activate biochem-base
   ```
   
   Frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```
   
   **Note:** For Docker-based development, use `docker-compose build` which automatically sets up all environments.

4. **Run Tests**
   ```bash
   python -m pytest
   # Test files should be placed in the tests/ directory
   ```

## 📝 Code Style Guidelines

### Python Code Standards

#### 1. Follow PEP 8
- Use 4 spaces for indentation
- Line length: 88 characters (Black formatter standard)
- Use descriptive variable names
- Follow naming conventions:
  - Functions: `snake_case`
  - Classes: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE`

#### 2. Type Hints
Always use type hints for function parameters and return values:

```python
from typing import Dict, List, Optional, Union, Any

def process_structure(self, pdb_data: str, clean_protein: bool = True) -> Dict[str, Any]:
    """Process a protein structure with proper type hints."""
    pass
```

#### 3. Docstrings
Use Google-style docstrings for all functions and classes:

```python
def prepare_ligand(self, sdf_data: str, ligand_id: str = "ligand") -> Molecule:
    """
    Prepare a ligand structure for MD simulation.
    
    Args:
        sdf_data: SDF format data as a string
        ligand_id: Identifier for the ligand
        
    Returns:
        OpenFF Molecule object with proper parameterization
        
    Raises:
        ValueError: If SDF data is invalid
        ImportError: If OpenFF toolkit is not available
        
    Example:
        >>> service = MDOptimizationService()
        >>> ligand = service.prepare_ligand(sdf_content, "ligand_1")
    """
    pass
```

#### 4. Error Handling
Implement comprehensive error handling:

```python
def process_file(self, file_path: str) -> Dict[str, Any]:
    """Process a molecular structure file with proper error handling."""
    try:
        # Main processing logic
        result = self._process_structure(file_path)
        return {"status": "success", "data": result}
    except FileNotFoundError:
        logger.error(f"File not found: {file_path}")
        return {"status": "error", "message": "File not found"}
    except ValueError as e:
        logger.error(f"Invalid file format: {str(e)}")
        return {"status": "error", "message": f"Invalid format: {str(e)}"}
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return {"status": "error", "message": "Processing failed"}
```

#### 5. Logging
Use structured logging throughout:

```python
import logging

logger = logging.getLogger(__name__)

def complex_operation(self, data: str) -> bool:
    """Example of proper logging usage."""
    logger.info(f"Starting complex operation with {len(data)} bytes of data")
    
    try:
        # Processing steps
        logger.debug("Step 1: Data validation")
        self._validate_data(data)
        
        logger.debug("Step 2: Processing")
        result = self._process_data(data)
        
        logger.info("Complex operation completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"Complex operation failed: {str(e)}")
        raise
```

### JavaScript Code Standards

#### 1. Modern ES6+ Syntax
- Use `const` and `let` instead of `var`
- Use arrow functions where appropriate
- Use template literals for string interpolation

```javascript
// Good
const processStructure = async (structureData) => {
    const result = await fetch('/api/process', {
        method: 'POST',
        body: JSON.stringify(structureData)
    });
    return result.json();
};

// Avoid
var processStructure = function(structureData) {
    // Old-style function
};
```

#### 2. Error Handling
Implement proper error handling in async functions:

```javascript
async function loadMolecularData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Failed to load molecular data:', error);
        showErrorMessage(`Failed to load data: ${error.message}`);
        throw error;
    }
}
```

#### 3. Documentation
Use JSDoc for function documentation:

```javascript
/**
 * Toggle the visibility of a ligand in the 3D viewer
 * @param {string} ligandId - Unique identifier for the ligand
 * @param {boolean} visible - Whether to show or hide the ligand
 * @param {Object} options - Additional visualization options
 * @param {number} options.opacity - Opacity level (0-1)
 * @param {string} options.style - Visualization style ('stick', 'sphere', etc.)
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function toggleLigandVisibility(ligandId, visible, options = {}) {
    // Implementation
}
```

## 🧪 Testing Guidelines

### Python Tests

#### 1. Unit Tests
Write unit tests for all service methods:

```python
import pytest
from services.structure.processor import StructureProcessor

class TestStructureProcessor:
    def setup_method(self):
        """Set up test fixtures."""
        self.processor = StructureProcessor()
        self.sample_pdb_data = """
        ATOM      1  CA  ALA A   1      20.154  16.967  23.462  1.00 20.00           C
        """
    
    def test_process_structure_valid_input(self):
        """Test structure processing with valid PDB data."""
        result = self.processor.process_structure(self.sample_pdb_data)
        assert result["status"] == "success"
        assert "components" in result
    
    def test_process_structure_invalid_input(self):
        """Test structure processing with invalid input."""
        with pytest.raises(ValueError):
            self.processor.process_structure("")
```

#### 2. Integration Tests
Test complete workflows:

```python
def test_complete_md_workflow():
    """Test the complete MD optimization workflow."""
    service = MDOptimizationService()
    
    # Test data
    protein_pdb = load_test_protein()
    ligand_sdf = load_test_ligand()
    
    # Run complete workflow
    result = service.optimize_complex(
        protein_pdb, ligand_sdf,
        nvt_steps=1000,  # Reduced for testing
        npt_steps=1000
    )
    
    assert result["status"] == "success"
    assert os.path.exists(result["equilibration"]["trajectory_path"])
```

### Frontend Tests

#### 1. Unit Tests (Jest)
```javascript
// tests/molecular-viewer.test.js
import { toggleLigandVisibility } from '../static/js/main.js';

describe('Molecular Viewer', () => {
    test('should toggle ligand visibility', async () => {
        const result = await toggleLigandVisibility('ligand_1', true);
        expect(result).toBe(true);
    });
});
```

## 🔧 API Design Guidelines

### RESTful Endpoints

#### 1. Naming Conventions
- Use nouns for resources: `/api/structures`, `/api/ligands`
- Use HTTP methods appropriately: GET, POST, PUT, DELETE
- Use consistent URL patterns

#### 2. Request/Response Format
```python
@app.route('/api/structures/<structure_id>/process', methods=['POST'])
def process_structure(structure_id: str):
    """
    Process a molecular structure.
    
    Request Body:
    {
        "clean_protein": true,
        "include_2d_images": true,
        "options": {
            "remove_water": true,
            "add_hydrogens": true
        }
    }
    
    Response:
    {
        "status": "success",
        "data": {
            "structure_id": "1abc",
            "components": {...},
            "processing_time": 2.5
        },
        "metadata": {
            "timestamp": "2025-08-12T15:30:00Z",
            "version": "1.0.0"
        }
    }
    """
    pass
```

#### 3. Error Responses
Standardize error responses:

```python
def create_error_response(message: str, code: int = 400, details: Dict = None) -> Dict:
    """Create a standardized error response."""
    return {
        "status": "error",
        "error": {
            "message": message,
            "code": code,
            "details": details or {},
            "timestamp": datetime.utcnow().isoformat()
        }
    }
```

## 📚 Documentation Standards

### 1. README Files
- Each major component should have its own README
- Include installation, usage, and examples
- Keep documentation up-to-date with code changes

### 2. Code Comments
```python
# Good: Explain WHY, not WHAT
# Use PDBFixer to clean protein structure because it handles
# missing atoms and standardizes residue names for MD simulation
cleaned_protein = self._clean_with_pdbfixer(protein_data)

# Avoid: Obvious comments
# Create a variable called result
result = process_data()
```

### 3. API Documentation
Use OpenAPI/Swagger specifications for API documentation.

## 🚀 Performance Guidelines

### 1. Backend Performance
- Cache expensive computations
- Use appropriate data structures
- Profile code for bottlenecks
- Implement pagination for large datasets

```python
from functools import lru_cache

class StructureProcessor:
    @lru_cache(maxsize=128)
    def _expensive_calculation(self, structure_hash: str) -> Dict:
        """Cache expensive calculations using LRU cache."""
        # Expensive computation here
        pass
```

### 2. Frontend Performance
- Lazy load large molecular structures
- Debounce user input
- Use efficient rendering techniques

```javascript
// Debounce search input
const debouncedSearch = debounce((query) => {
    searchMolecules(query);
}, 300);
```

## 🔒 Security Guidelines

### 1. Input Validation
Always validate and sanitize user inputs:

```python
def validate_pdb_data(pdb_data: str) -> bool:
    """Validate PDB data format and content."""
    if not pdb_data or len(pdb_data) > MAX_FILE_SIZE:
        return False
    
    # Check for malicious content
    if any(dangerous in pdb_data for dangerous in DANGEROUS_PATTERNS):
        return False
    
    return True
```

### 2. File Handling
- Validate file types and sizes
- Use secure file paths
- Clean up temporary files

## 📋 Pull Request Process

### 1. Before Submitting
- [ ] Code follows style guidelines
- [ ] All tests pass
- [ ] Documentation is updated
- [ ] No security vulnerabilities
- [ ] Performance impact assessed

### 2. PR Description Template
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

### 3. Review Process
1. Automated checks must pass
2. Code review by maintainer
3. Testing in staging environment
4. Final approval and merge

## 🐛 Bug Reports

### Issue Template
```markdown
**Bug Description**
Clear description of the bug

**Steps to Reproduce**
1. Go to '...'
2. Click on '...'
3. See error

**Expected Behavior**
What should happen

**Screenshots**
If applicable

**Environment**
- OS: [e.g. Ubuntu 20.04]
- Python version: [e.g. 3.9.0]
- Browser: [e.g. Chrome 91.0]
```

## 🎯 Feature Requests

### Feature Template
```markdown
**Feature Description**
Clear description of the proposed feature

**Use Case**
Why is this feature needed?

**Proposed Solution**
How should this feature work?

**Alternatives Considered**
Other approaches that were considered

**Additional Context**
Any other relevant information
```

---

Thank you for contributing to the molecular structure processing platform! Your contributions help advance computational chemistry and structural biology research.
