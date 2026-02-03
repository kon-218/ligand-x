# Batch Docking Backend Implementation Guide

## Endpoint Specification

### Route
```
POST /api/docking/batch_dock_protein_ligands
```

### Request Format
```json
{
  "protein_pdb": "ATOM      1  N   ALA A   1...",
  "ligands": [
    {
      "id": "ligand_1",
      "name": "Compound A",
      "data": "ATOM      1  C   LIG A   1...",
      "format": "pdb",
      "resname": "LIG"
    },
    {
      "id": "ligand_2", 
      "name": "Compound B",
      "data": "@<tripos>MOLECULE\nLigand...",
      "format": "sdf",
      "resname": "LIG"
    }
  ],
  "grid_padding": 5.0,
  "docking_params": {
    "exhaustiveness": 8,
    "num_modes": 9,
    "energy_range": 100.0,
    "scoring_function": "vina"
  },
  "use_api": true
}
```

### Response Format (Server-Sent Events)

The endpoint should stream progress updates as Server-Sent Events (SSE) with the following format:

#### Progress Update
```
data: {"job_id": "ligand_1", "progress": 25, "status": "Preparing ligand..."}
```

#### Completion Update
```
data: {"job_id": "ligand_1", "progress": 100, "status": "Completed", "success": true, "results": {...}}
```

#### Final Summary
```
data: {"success": true, "results": {"ligand_1": {...}, "ligand_2": {...}}}
```

### Result Structure per Ligand
```json
{
  "ligand_id": "ligand_1",
  "ligand_name": "Compound A",
  "success": true,
  "poses": [
    {
      "mode": 1,
      "affinity": -8.5,
      "rmsd_lb": 0.0,
      "rmsd_ub": 1.2
    }
  ],
  "best_affinity": -8.5,
  "num_poses": 5,
  "log": "MODEL        1\nATOM      1...",
  "binding_strength": "Strong"
}
```

## Implementation Strategy

### Option 1: Sequential Processing
Process ligands one at a time:
```python
@router.post("/batch_dock_protein_ligands")
async def batch_dock(request: Request):
    config = await request.json()
    
    async def generate():
        for ligand in config["ligands"]:
            # Dock single ligand
            result = await dock_single_ligand(
                config["protein_pdb"],
                ligand,
                config["docking_params"],
                config["grid_padding"],
                config["use_api"]
            )
            
            # Stream progress
            yield f"data: {json.dumps({
                'job_id': ligand['id'],
                'progress': 50,
                'status': f'Processing {ligand["name"]}...'
            })}\n\n"
            
            # Stream result
            yield f"data: {json.dumps({
                'job_id': ligand['id'],
                'progress': 100,
                'success': result['success'],
                'results': result
            })}\n\n"
        
        # Final summary
        yield f"data: {json.dumps({'success': True})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")
```

### Option 2: Parallel Processing
Process multiple ligands concurrently:
```python
import asyncio

@router.post("/batch_dock_protein_ligands")
async def batch_dock(request: Request):
    config = await request.json()
    
    async def generate():
        tasks = []
        for ligand in config["ligands"]:
            task = dock_single_ligand_with_progress(
                config["protein_pdb"],
                ligand,
                config["docking_params"],
                config["grid_padding"],
                config["use_api"]
            )
            tasks.append(task)
        
        # Process with concurrency limit
        for coro in asyncio.as_completed(tasks, return_exceptions=True):
            result = await coro
            if isinstance(result, Exception):
                yield f"data: {json.dumps({'success': False, 'error': str(result)})}\n\n"
            else:
                yield f"data: {json.dumps(result)}\n\n"
        
        yield f"data: {json.dumps({'success': True})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")
```

## Integration with Existing Code

### Using Existing Docking Service
Reuse the existing `dockProteinLigand` logic:

```python
from services.docking.main import DockingService

async def batch_dock_protein_ligands(request: Request):
    config = await request.json()
    docking_service = DockingService()
    
    async def generate():
        for i, ligand in enumerate(config["ligands"]):
            try:
                # Prepare docking config for single ligand
                single_config = {
                    "protein_pdb": config["protein_pdb"],
                    "ligand_data": ligand["data"],
                    "ligand_format": ligand["format"],
                    "ligand_resname": ligand["resname"],
                    "grid_padding": config["grid_padding"],
                    "docking_params": config["docking_params"],
                    "use_api": config["use_api"]
                }
                
                # Run docking
                result = await docking_service.dock(single_config)
                
                # Calculate progress
                progress = int((i + 1) / len(config["ligands"]) * 100)
                
                # Stream result
                yield f"data: {json.dumps({
                    'job_id': ligand['id'],
                    'progress': progress,
                    'status': f'Completed {ligand["name"]}',
                    'success': result.get('success', False),
                    'results': result
                })}\n\n"
                
            except Exception as e:
                yield f"data: {json.dumps({
                    'job_id': ligand['id'],
                    'progress': 100,
                    'status': 'Failed',
                    'success': False,
                    'error': str(e)
                })}\n\n"
        
        yield f"data: {json.dumps({'success': True})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")
```

## Error Handling

### Per-Ligand Errors
If one ligand fails, continue processing others:
```json
{
  "job_id": "ligand_2",
  "progress": 100,
  "status": "Failed",
  "success": false,
  "error": "Invalid ligand format"
}
```

### Critical Errors
If protein is invalid or other critical issue:
```json
{
  "success": false,
  "error": "Invalid protein PDB format"
}
```

## Testing

### cURL Test
```bash
curl -X POST http://localhost:8000/api/docking/batch_dock_protein_ligands \
  -H "Content-Type: application/json" \
  -d '{
    "protein_pdb": "...",
    "ligands": [...],
    "grid_padding": 5.0,
    "docking_params": {...},
    "use_api": true
  }'
```

### Expected Output
```
data: {"job_id": "ligand_1", "progress": 25, "status": "Preparing..."}
data: {"job_id": "ligand_1", "progress": 100, "status": "Completed", "success": true, "results": {...}}
data: {"job_id": "ligand_2", "progress": 25, "status": "Preparing..."}
data: {"job_id": "ligand_2", "progress": 100, "status": "Completed", "success": true, "results": {...}}
data: {"success": true}
```

## Performance Considerations

1. **Timeout**: Set appropriate timeout (30+ minutes for multiple ligands)
2. **Memory**: Each docking operation uses significant memory; consider sequential processing for many ligands
3. **Concurrency**: Limit parallel jobs based on available resources
4. **Progress Updates**: Send updates every 5-10 seconds to keep connection alive
5. **Streaming**: Use SSE to avoid timeout on long-running operations

## Gateway Configuration

Update `/gateway/routers/docking.py` to include the new endpoint:

```python
@router.post("/batch_dock_protein_ligands")
async def batch_dock_protein_ligands(request: Request):
    """Batch docking with multiple ligands."""
    url = f"{DOCKING_URL}/api/docking/batch_dock_protein_ligands"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)
```

Or update the catch-all proxy to handle it automatically.
