# Documentation Index

Welcome to the comprehensive documentation for the Molecular Structure Processing Web Application. This index provides quick access to all documentation resources.

## 📚 Core Documentation

### [Main README](../README.md)
Complete overview of the application, installation instructions, and quick start guide.

### [API Documentation](API_DOCUMENTATION.md)
Comprehensive API reference with endpoints, parameters, responses, and examples.

### [Contributing Guide](../CONTRIBUTING.md)
Guidelines for contributors including code standards, testing, and pull request process.

### [Best Practices Guide](BEST_PRACTICES.md)
Detailed best practices for architecture, security, performance, and deployment.

### [Frontend Development Guide](FRONTEND_GUIDE.md)
Frontend architecture, JavaScript modules, CSS organization, and development workflow.

## 🔧 Technical Documentation

### Architecture Overview
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   FastAPI       │    │   Microservices │
│   (Next.js/TS)  │◄──►│   Gateway       │◄──►│   (FastAPI)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Mol* Viewer   │    │   File Storage  │    │   External APIs │
│   Ketcher       │    │   (uploads/)    │    │   (PDB, etc.)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Service Layer Architecture
- **Structure Processor**: PDB/SDF parsing, component identification
- **PDB Service**: RCSB PDB database integration
- **Docking Service**: AutoDock Vina molecular docking
- **MD Optimization**: OpenMM/OpenFF molecular dynamics

## 📖 Specialized Guides

### [3Dmol.js Integration](../3dmol_info.md)
Detailed guide on 3D molecular visualization implementation.

### [Docking Setup](../DOCKING_SETUP.md)
Complete molecular docking workflow setup and configuration.

### [Kekule.js Editor](../kekule_info.md)
Chemical structure editor integration and usage.

### [MD Optimization](../md_optimization.md)
Molecular dynamics simulation workflows and best practices.

## 🚀 Quick Reference

### Common Tasks

#### Starting the Application
```bash
# Build Docker images (first time only)
docker-compose build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Access at http://localhost:3000 (frontend)
# API Gateway at http://localhost:8000
```

#### Running Tests
```bash
# Run pytest tests (when available)
python -m pytest

# Test files should be placed in the tests/ directory
```

#### API Usage Examples
```python
# Fetch PDB structure
import requests
response = requests.post('http://localhost:8000/api/structure/fetch_pdb', 
                        json={'pdb_id': '1abc'})

# Run molecular docking
response = requests.post('http://localhost:8000/api/docking/dock_protein_ligand',
                        json={
                            'protein_data': protein_pdb,
                            'ligand_data': ligand_sdf,
                            'grid_center': [10, 20, 15],
                            'grid_size': [20, 20, 20]
                        })
```

### File Structure Reference
```
app/
├── README.md                    # Main documentation
├── CONTRIBUTING.md              # Contributor guidelines
├── requirements.txt             # Python dependencies
├── docker-compose.yml           # Docker Compose configuration
├── Dockerfile.backend           # Backend Docker image
├── Dockerfile.frontend          # Frontend Docker image
├── rebuild-service.sh           # Helper script to rebuild services
│
├── gateway/                     # FastAPI Gateway
│   ├── main.py                 # Gateway application
│   └── routers/                # Service proxy routers
│
├── docs/                       # Documentation directory
│   ├── README.md               # This file
│   ├── API_DOCUMENTATION.md    # API reference
│   ├── BEST_PRACTICES.md       # Development best practices
│   └── FRONTEND_GUIDE.md       # Frontend development guide
│
├── services/                   # FastAPI microservices
│   ├── structure/              # Structure processing service
│   ├── docking/                # Docking service
│   ├── md/                     # MD optimization service
│   ├── qc/                     # Quantum chemistry service
│   ├── admet/                  # ADMET prediction service
│   ├── boltz2/                 # Boltz-2 binding prediction
│   └── alignment/              # Protein alignment service
│
├── frontend-react/             # Next.js/React Frontend
│   ├── src/
│   │   ├── app/                # Next.js app directory
│   │   ├── components/         # React components
│   │   ├── lib/                # Utilities
│   │   └── store/              # State management
│   └── package.json            # Frontend dependencies
│
├── utils/                      # Utility modules
├── uploads/                    # File upload directory
├── md_outputs/                 # MD simulation outputs
└── tests/                      # Test files
```

## 🔍 Finding Information

### By Topic

| Topic | Documentation |
|-------|---------------|
| **Installation** | [Main README](../README.md#installation) |
| **API Endpoints** | [API Documentation](API_DOCUMENTATION.md) |
| **Code Standards** | [Contributing Guide](../CONTRIBUTING.md#code-style-guidelines) |
| **Frontend Development** | [Frontend Guide](FRONTEND_GUIDE.md) |
| **Testing** | [Contributing Guide](../CONTRIBUTING.md#testing-guidelines) |
| **Deployment** | [Best Practices](BEST_PRACTICES.md#deployment-best-practices) |
| **Security** | [Best Practices](BEST_PRACTICES.md#security-best-practices) |
| **Performance** | [Best Practices](BEST_PRACTICES.md#performance-best-practices) |

### By Component

| Component | Primary Documentation | Additional Resources |
|-----------|----------------------|---------------------|
| **3D Visualization** | [Frontend Guide](FRONTEND_GUIDE.md#3dmoljs-integration) | [3Dmol.js Info](../3dmol_info.md) |
| **Molecular Docking** | [API Documentation](API_DOCUMENTATION.md#molecular-docking-endpoints) | [Docking Setup](../DOCKING_SETUP.md) |
| **Structure Editor** | [Frontend Guide](FRONTEND_GUIDE.md#kekule-editorjs---molecule-editor) | [Kekule.js Info](../kekule_info.md) |
| **MD Simulations** | [API Documentation](API_DOCUMENTATION.md#md-optimization-endpoints) | [MD Optimization](../md_optimization.md) |

## 🆘 Troubleshooting

### Common Issues

1. **Import Errors**
   - Check [Installation Guide](../README.md#installation)
   - Verify virtual environment activation
   - Install missing dependencies

2. **Frontend Issues**
   - Check browser console for JavaScript errors
   - Verify static file serving
   - Clear browser cache

3. **API Errors**
   - Check [API Documentation](API_DOCUMENTATION.md#error-codes)
   - Verify request format and parameters
   - Check server logs

4. **Performance Issues**
   - Review [Performance Best Practices](BEST_PRACTICES.md#performance-best-practices)
   - Check system resources
   - Optimize large file handling

### Getting Help

1. **Check Documentation**: Start with this index and relevant guides
2. **Review Examples**: Look at test files and API examples
3. **Check Logs**: Application logs provide detailed error information
4. **Create Issues**: For bugs or feature requests, create GitHub issues

## 📝 Documentation Standards

### Writing Guidelines
- Use clear, concise language
- Include code examples where appropriate
- Maintain consistent formatting
- Update documentation with code changes
- Test all examples before publishing

### Documentation Types
- **README**: Overview and quick start
- **API Reference**: Detailed endpoint documentation
- **Guides**: Step-by-step instructions
- **Best Practices**: Recommendations and patterns
- **Examples**: Working code samples

## 🔄 Keeping Documentation Updated

### Maintenance Schedule
- **Weekly**: Review for accuracy
- **With Releases**: Update version-specific information
- **With Features**: Document new functionality
- **With Bug Fixes**: Update troubleshooting guides

### Contributing to Documentation
See the [Contributing Guide](../CONTRIBUTING.md) for information on:
- Documentation standards
- Review process
- Style guidelines
- Update procedures

---

**Last Updated**: August 2025  
**Version**: 1.0.0

For questions about the documentation or suggestions for improvement, please create an issue or submit a pull request.
