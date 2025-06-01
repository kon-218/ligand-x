# Molecular Structure Processing Web Application

A comprehensive web-based platform for molecular structure analysis, visualization, and computational chemistry workflows including molecular docking, MD optimization, and structure editing.

## 🚀 Features

### Core Functionality
- **Structure Upload & Processing**: Support for PDB, CIF, mmCIF, and SDF file formats
- **PDB Structure Fetching**: Direct integration with RCSB PDB database
- **SMILES to 3D Conversion**: Convert SMILES strings to 3D molecular structures
- **Component Identification**: Automatic separation of proteins, ligands, water, and ions
- **Structure Cleaning**: Protein structure preparation using PDBFixer

### Advanced Capabilities
- **Molecular Docking**: AutoDock Vina integration for protein-ligand docking
- **MD Optimization**: Molecular dynamics simulations using OpenMM and OpenFF
- **Structure Editing**: Interactive molecule editor using Ketcher
- **ADMET Prediction**: Molecular property and ADMET prediction
- **3D Visualization**: Interactive molecular visualization using Mol* (Molstar)
- **Quantum Chemistry**: QC calculations with Celery workers and ORCA integration

### User Interface
- **Modern React Frontend**: Next.js-based application with TypeScript
- **Real-time Visualization**: Interactive 3D molecular viewer with Mol*
- **Ketcher Integration**: Professional molecular editor for structure drawing
- **Responsive Design**: Modern UI with dark theme
- **Sequential Workflows**: Step-by-step guided processes for complex tasks

## 📋 Prerequisites

### System Requirements
- **Docker** 20.10+ and **Docker Compose** 2.0+
- Linux/macOS/Windows with Docker support
- At least 8GB RAM recommended
- 10GB+ free disk space for Docker images and data

### Installing Docker

Follow the official Docker installation guide: https://docs.docker.com/get-docker/

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd app
```

### 2. Build Docker Images
```bash
docker-compose build
```

This will:
- Create all required Conda environments
- Install all Python dependencies
- Build the frontend application
- Set up all microservices

**Note:** The first build may take 15-30 minutes depending on your internet connection and system performance.

## 🚀 Quick Start

### Start All Services
```bash
docker-compose up -d
```

This starts all services in the background:
- **Gateway**: `http://localhost:8000` (API Gateway)
- **Frontend**: `http://localhost:3000` (Web Interface)
- **Redis**: Port 6380 (for Celery workers)
- All microservices (structure, docking, md, admet, boltz2, qc, alignment, ketcher)

### View Logs
```bash
# View all logs
docker-compose logs -f

# View logs for a specific service
docker-compose logs -f gateway
```

### Stop Services
```bash
docker-compose down
```

### Access the Web Interface
Open your browser and navigate to: `http://localhost:3000`

### Basic Workflow
1. **Upload Structure**: Use the file upload or PDB ID fetch
2. **Process Structure**: Automatic component identification and cleaning
3. **Visualize**: Interactive 3D visualization with Mol* viewer
4. **Edit**: Use Ketcher molecular editor for structure modifications
5. **Analyze**: Run docking, MD simulations, QC calculations, or property predictions

## 📁 Project Structure

```
app/
├── gateway/                        # FastAPI Gateway
│   ├── main.py                    # Gateway application
│   └── routers/                   # Service proxy routers
├── environments/                   # Conda environment definitions
│   ├── base.yml                   # Base environment
│   ├── admet.yml                  # ADMET service environment
│   ├── boltz2.yml                 # Boltz-2 service environment
│   ├── docking.yml                # Docking service environment
│   ├── md.yml                     # MD service environment
│   └── qc.yml                     # QC service environment
├── requirements.txt                # DEPRECATED - See environments/*.yml
├── package.json                    # Backend package info
├── README.md                       # This file
├── docker-compose.yml              # Docker Compose configuration
├── Dockerfile.backend              # Backend Docker image
├── Dockerfile.frontend             # Frontend Docker image
├── entrypoint.sh                   # Docker entrypoint script
├── rebuild-service.sh              # Helper script to rebuild individual services
│
├── services/                       # FastAPI microservices
│   ├── structure/                  # Structure processing service
│   │   ├── main.py
│   │   ├── routers.py
│   │   ├── service.py
│   │   ├── processor.py            # Structure analysis and processing
│   │   └── pdb_service.py          # PDB database integration
│   ├── docking/                    # Docking service
│   │   ├── main.py
│   │   ├── routers.py
│   │   └── service.py              # Molecular docking workflows
│   ├── md/                         # MD optimization service
│   │   ├── main.py
│   │   ├── routers.py
│   │   └── service.py              # MD simulation services
│   ├── ketcher/                    # Ketcher service
│   │   ├── main.py
│   │   ├── routers.py
│   │   └── service.py              # Ketcher integration
│   ├── boltz2/                     # Boltz-2 service
│   │   ├── main.py
│   │   ├── routers.py
│   │   └── service.py              # Boltz-2 binding prediction
│   ├── qc/                         # Quantum chemistry service
│   │   ├── main.py
│   │   ├── routers.py
│   │   ├── service.py
│   │   ├── config.py
│   │   ├── parsers.py
│   │   └── tasks.py
│   ├── admet/                      # ADMET prediction service
│   │   ├── main.py
│   │   └── routers.py
│   └── alignment/                  # Protein alignment service
│       ├── main.py
│       ├── routers.py
│       ├── service.py
│       └── helpers.py
│
├── lib/                            # Utility modules
│   ├── molecular_utils.py          # Molecular utilities
│   ├── service_runner.py           # Service execution utilities
│   └── smiles_lookup.py            # SMILES lookup functions
│
├── frontend/                       # React/Next.js Frontend
│   ├── src/
│   │   ├── app/                    # Next.js app directory
│   │   ├── components/             # React components
│   │   │   ├── MolecularViewer/    # Mol* viewer components
│   │   │   ├── Tools/              # Tool panels (docking, MD, etc)
│   │   │   └── QC/                 # Quantum chemistry components
│   │   ├── lib/                    # Utilities and helpers
│   │   └── store/                  # State management (Zustand)
│   ├── package.json                # Frontend dependencies
│   └── README.md                   # Frontend documentation
│
├── shared/                         # Shared utilities and config
│   ├── config.py                   # Service configuration
│   ├── utils.py                    # Shared utility functions
│   └── models.py                   # Shared data models
├── data/                           # Application data directory
│   ├── uploads/                    # File upload directory
│   ├── md_outputs/                 # MD simulation outputs
│   ├── qc_jobs/                    # Quantum chemistry job files
│   ├── qc_results_db/             # QC results database
│   └── boltz_results_input/        # Boltz-2 input/output files
├── vina                            # AutoDock Vina binary
│
└── docs/                           # Additional documentation
    ├── DOCKING_SETUP.md            # Docking workflow setup
    └── md_optimization.md          # MD optimization guide
```

## 🔧 API Endpoints

### Structure Processing
- `POST /upload_structure` - Upload and process structure files
- `POST /fetch_pdb` - Fetch structures from PDB database
- `POST /process_pdb_with_ligands` - Process with ligand extraction
- `POST /smiles_to_3d` - Convert SMILES to 3D structure

### Molecular Docking
- `POST /prepare_docking` - Prepare structures for docking
- `POST /run_docking` - Execute docking calculations
- `POST /dock_protein_ligand` - Complete docking workflow

### MD Optimization
- `POST /api/md/optimize` - Full MD optimization workflow
- `POST /api/md/prepare_protein` - Protein preparation
- `POST /api/md/prepare_ligand` - Ligand preparation
- `GET /api/md/status` - Service availability

### Structure Editing
- `POST /get_ligand_structure` - Get ligand for editing
- `POST /save_edited_molecule` - Save edited structures

## 🧪 Testing

### Manual Testing
1. Upload a PDB file (e.g., 1abc.pdb)
2. Verify structure processing and visualization
3. Test docking with protein-ligand complexes
4. Validate MD optimization workflows

### Test Suite
Test files should be placed in the `tests/` directory. See [CONTRIBUTING.md](docs-root/CONTRIBUTING.md) for testing guidelines.

## 🔧 Development

### Rebuilding a Single Service
If you've made changes to a specific service, you can rebuild just that service:

```bash
./scripts/rebuild-service.sh <service_name>
```

For example:
```bash
./scripts/rebuild-service.sh gateway      # Rebuild gateway service
./scripts/rebuild-service.sh docking      # Rebuild docking service
./scripts/rebuild-service.sh frontend     # Rebuild frontend
```

After rebuilding, restart the service:
```bash
docker-compose up -d <service_name>
```

### Available Services
- `gateway` - API Gateway
- `structure` - Structure processing
- `docking` - Molecular docking
- `md` - MD optimization
- `admet` - ADMET prediction
- `boltz2` - Boltz2 binding affinity
- `qc` - Quantum chemistry
- `alignment` - Protein alignment
- `ketcher` - Ketcher molecular editor
- `worker-qc` - Celery worker for quantum chemistry
- `frontend` - Next.js frontend

### Rebuilding All Services
```bash
docker-compose build
```

### Viewing Service Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f gateway
docker-compose logs -f qc
```

## 🧹 Docker Cleanup & Disk Space Management

Docker can consume significant disk space over time. To prevent running out of space:

### Quick Cleanup
```bash
# Run the automated cleanup script
./docker-cleanup.sh
```

### Automated Cleanup (Recommended)
Set up a systemd timer to run cleanup weekly:
```bash
sudo cp docker-cleanup.service docker-cleanup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable docker-cleanup.timer
sudo systemctl start docker-cleanup.timer
```

### What Gets Cleaned
- Stopped containers
- Dangling/untagged images
- Build cache older than 24 hours
- Unused images older than 7 days
- Unused volumes (named volumes are preserved)

### Monitor Disk Usage
```bash
# Check disk usage
df -h /

# Check Docker resource usage
docker system df
```

**For detailed cleanup instructions, see [DOCKER_CLEANUP_GUIDE.md](DOCKER_CLEANUP_GUIDE.md)**

## 🔍 Troubleshooting

### Common Issues

#### 1. Docker Build Fails
- Ensure you have enough disk space (10GB+)
- Check Docker has enough memory allocated (8GB+ recommended)
- Try rebuilding with: `docker-compose build --no-cache`
- **If out of space**: Run `./docker-cleanup.sh` to free up space

#### 2. Services Won't Start
- Check logs: `docker-compose logs <service_name>`
- Verify all services are built: `docker-compose ps`
- Ensure ports aren't already in use

#### 3. Port Already in Use
If ports 3000, 8000, or 6380 are already in use:
- Stop conflicting services
- Or modify ports in `docker-compose.yml`

#### 4. Docking Issues
- Check service logs: `docker-compose logs docking`
- Verify AutoDock Vina is available in the container

#### 5. MD Simulation Issues
- Ensure sufficient disk space for trajectory files
- Check service logs: `docker-compose logs md`

#### 6. Frontend Issues
- Clear browser cache
- Check browser console for JavaScript errors
- Rebuild frontend: `./rebuild-service.sh frontend`

### Performance Optimization

#### Docker
- Use Docker layer caching effectively (already optimized in Dockerfile)
- Rebuild only changed services using `./rebuild-service.sh`
- Monitor resource usage: `docker stats`

#### Backend
- Services run in optimized Conda environments
- Redis caching for QC jobs
- Consider increasing Docker memory allocation for heavy computations

#### Frontend
- Production build is optimized automatically
- Static assets are cached
- 3D rendering uses WebGL acceleration

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Follow the coding standards (see below)
4. Add tests for new functionality
5. Submit a pull request

### Coding Standards
- **Python**: Follow PEP 8, use type hints where appropriate
- **JavaScript**: Use ES6+ features, consistent naming
- **Documentation**: Comprehensive docstrings and comments
- **Testing**: Unit tests for all new features

### Code Review Process
1. Automated testing must pass
2. Code review by maintainers
3. Documentation updates required
4. Performance impact assessment

## 📚 Additional Documentation

- [Molecular Docking Setup](docs/DOCKING_SETUP.md)
- [MD Optimization Workflows](docs/md_optimization.md)

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **RDKit**: Cheminformatics toolkit
- **OpenMM**: Molecular dynamics engine
- **Molstar**: Molecular visualization
- **Ketcher**: Chemical structure editor
- **AutoDock Vina**: Molecular docking software
- **BioPython**: Structural bioinformatics tools

## 📞 Support

For questions, issues, or contributions:
- Create an issue on GitHub
- Check existing documentation
- Review troubleshooting section

---

**Version**: 1.0.0  
**Last Updated**: August 2025
# Initial project setup and repository structure
# Date: 2024-07-01

# Update documentation and README
# Date: 2024-12-10

# Initial project setup and repository structure
# Date: 2024-07-01

# Update documentation and README
# Date: 2024-12-10

# Initial project setup and repository structure
# Date: 2025-07-01

# Update documentation and README
# Date: 2025-12-10

# Initial project setup
# Date: 2025-01-13

# Update README
# Date: 2025-12-01

# Initial project setup
# Date: 2025-01-13

# Update README
# Date: 2025-12-01

# Initial project setup
# Date: 2025-01-13

# Update README
# Date: 2025-12-01

