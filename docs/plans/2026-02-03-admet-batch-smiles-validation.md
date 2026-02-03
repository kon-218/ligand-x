# ADMET Batch SMILES Input Validation & Deduplication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix ADMET batch prediction to properly parse, validate, separate, and deduplicate SMILES entries, preventing malformed input like "CO // CO COO // CO, COO // CO,COO" from being added as-is.

**Architecture:**
Frontend parses SMILES input by splitting on multiple delimiters (comma, semicolon, newline, whitespace), trims and filters empty strings, then sends clean array to backend. Backend deduplicates within batch and against PostgreSQL cache before validation, tracks metadata (duplicates_removed, already_cached, invalid_count), and returns comprehensive feedback. Invalid SMILES are filtered out but don't block processing.

**Tech Stack:**
TypeScript/React frontend with Zustand state, FastAPI backend with asyncpg PostgreSQL integration, RDKit for SMILES validation.

---

## Task 1: Update ADMETBatchResult type with deduplication metadata

**Files:**
- Modify: `frontend/src/types/molecular.ts:141-157`

**Step 1: Read current type definition**

Already read in planning - the current `ADMETBatchResult` has `total`, `valid`, `cached`, `predicted`. Need to add `duplicates_removed`, `already_cached`, `invalid_count`, and optional `invalid_smiles` array.

**Step 2: Write the updated type**

```typescript
export interface ADMETBatchResult {
  success: boolean
  batch: boolean
  total: number  // Original count before any processing
  valid: number  // Count of valid SMILES that produced results
  cached: number  // Count of valid SMILES from PostgreSQL cache
  predicted: number  // Count of newly predicted SMILES (valid - cached)
  duplicates_removed: number  // Count of duplicate SMILES within batch
  already_cached: number  // Count of SMILES already in PostgreSQL cache
  invalid_count: number  // Count of invalid SMILES (filtered out)
  invalid_smiles?: Array<{  // Optional list of invalid SMILES with errors
    smiles: string
    error: string
  }>
  results: Array<{
    smiles: string
    canonical_smiles?: string
    molecule_name?: string
    result?: ADMETResult
    error?: string
    valid: boolean
    cached?: boolean
  }>
}
```

**Step 3: Verify type compiles**

Run: `cd frontend && npm run build:check` (or use tsc)
Expected: No TypeScript errors

**Step 4: Commit**

```bash
git add frontend/src/types/molecular.ts
git commit -m "feat: add deduplication metadata to ADMETBatchResult type"
```

---

## Task 2: Create SMILES parsing utility function in frontend

**Files:**
- Modify: `frontend/src/components/Tools/ADMETTool.tsx:176-191`
- Add helper function above the component

**Step 1: Add parseSmilesInput function**

Add this utility function before the ADMETTool component (around line 20):

```typescript
/**
 * Parse SMILES input string supporting multiple delimiters.
 * Splits by comma, semicolon, newline, and whitespace.
 * Trims each candidate and filters empty strings.
 */
function parseSmilesInput(input: string): string[] {
  if (!input.trim()) return []

  // Split by multiple delimiters: comma, semicolon, newline, and spaces
  // Using regex to split on one or more of these delimiters
  const candidates = input.split(/[,;\n\s]+/)

  // Trim, filter empty strings, and remove duplicates in frontend
  const parsed = Array.from(new Set(
    candidates
      .map(s => s.trim())
      .filter(s => s.length > 0)
  ))

  return parsed
}
```

**Step 2: Update handleAddSmiles to use parser**

Change the `handleAddSmiles` function (lines 176-191) from:

```typescript
const handleAddSmiles = () => {
  if (!smilesInput.trim()) return

  // Add as a temporary option
  const id = `smiles_${Date.now()}`
  const newMolecule: MoleculeOption = {
    id,
    name: `SMILES: ${smilesInput.substring(0, 15)}...`,
    smiles: smilesInput.trim(),
    source: 'library' // Treat as library for simplicity
  }

  setAvailableMolecules(prev => [...prev, newMolecule])
  setBatchMolecules(prev => new Set(prev).add(id))
  setSmilesInput('')
}
```

To:

```typescript
const handleAddSmiles = () => {
  const parsedSmiles = parseSmilesInput(smilesInput)
  if (parsedSmiles.length === 0) return

  // Add each parsed SMILES as a separate temporary option
  const newMolecules: MoleculeOption[] = parsedSmiles.map((smiles, index) => ({
    id: `smiles_${Date.now()}_${index}`,
    name: `SMILES: ${smiles.substring(0, 15)}${smiles.length > 15 ? '...' : ''}`,
    smiles: smiles,
    source: 'library' as const
  }))

  setAvailableMolecules(prev => [...prev, ...newMolecules])
  const newIds = new Set(batchMolecules)
  newMolecules.forEach(mol => newIds.add(mol.id))
  setBatchMolecules(newIds)
  setSmilesInput('')
}
```

**Step 3: Verify function works with test input**

Mentally verify: input "CO, CCO\nCC(C)O;CCCC" → splits to ["CO", "CCO", "CC(C)O", "CCCC"]

**Step 4: Commit**

```bash
git add frontend/src/components/Tools/ADMETTool.tsx
git commit -m "feat: add SMILES input parser supporting multiple delimiters"
```

---

## Task 3: Add backend helper to get cached SMILES set

**Files:**
- Modify: `services/admet/routers.py:183-189`

**Step 1: Add new async function after get_cached_result**

Add this function after `get_cached_result` (around line 86):

```python
async def get_all_cached_canonical_smiles() -> set:
    """Get all canonical SMILES currently in PostgreSQL cache."""
    pool = await get_db_pool()
    if pool is None:
        return set()

    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT DISTINCT canonical_smiles FROM admet_results"
            )
            cached_set = {row['canonical_smiles'] for row in rows}
            logger.info(f"Loaded {len(cached_set)} cached SMILES from PostgreSQL")
            return cached_set
    except Exception as e:
        logger.warning(f"Error fetching cached SMILES set: {e}")
        return set()
```

**Step 2: Verify function is accessible**

No test needed - just ensure function definition is valid Python.

**Step 3: Commit**

```bash
git add services/admet/routers.py
git commit -m "feat: add helper to fetch all cached canonical SMILES"
```

---

## Task 4: Update backend batch processing with deduplication logic

**Files:**
- Modify: `services/admet/routers.py:184-313`

**Step 1: Read current batch processing section**

Already read in planning (lines 188-313). Key logic is:
1. Loop through smiles_list
2. Validate each SMILES with RDKit
3. Get canonical form
4. Check cache
5. Store uncached for batch prediction

**Step 2: Rewrite batch processing with deduplication**

Replace the batch processing section (lines 188-313) with:

```python
# Handle batch mode
if request.smiles_list:
    logger.info(f"Processing batch ADMET prediction for {len(request.smiles_list)} molecules")

    # Get all cached SMILES upfront for deduplication
    cached_smiles_set = await get_all_cached_canonical_smiles()

    results = []
    uncached_indices = []
    uncached_smiles = []
    seen_canonical = {}  # Track canonical SMILES to detect duplicates

    duplicates_removed = 0
    already_cached_count = 0
    invalid_smiles_list = []

    # First pass: validate, canonicalize, deduplicate
    for i, smiles in enumerate(request.smiles_list):
        try:
            # Validate SMILES
            mol = Chem.MolFromSmiles(smiles)
            if mol is None:
                # Track invalid SMILES
                invalid_smiles_list.append({
                    'smiles': smiles,
                    'error': 'Invalid SMILES string'
                })
                results.append({
                    'smiles': smiles,
                    'error': 'Invalid SMILES string',
                    'valid': False
                })
                continue

            # Get canonical form
            canonical_smiles = Chem.MolToSmiles(mol, canonical=True)
            molecule_name = f"Molecule_{canonical_smiles[:15]}"

            # Check for duplicate within current batch
            if canonical_smiles in seen_canonical:
                duplicates_removed += 1
                logger.info(f"Skipping duplicate SMILES in batch: {canonical_smiles[:30]}...")
                results.append({
                    'smiles': smiles,
                    'canonical_smiles': canonical_smiles,
                    'molecule_name': molecule_name,
                    'error': 'Duplicate SMILES in batch',
                    'valid': False
                })
                continue

            seen_canonical[canonical_smiles] = smiles

            # Check if already cached
            if canonical_smiles in cached_smiles_set:
                already_cached_count += 1
                # Get full cached result
                cached = await get_cached_result(canonical_smiles)
                if cached:
                    result_data = cached['results']
                    result_data['_metadata'] = {
                        'canonical_smiles': canonical_smiles,
                        'molecule_name': cached['molecule_name'] or molecule_name,
                        'cached': True,
                        'cached_at': cached['created_at']
                    }
                    results.append({
                        'smiles': smiles,
                        'canonical_smiles': canonical_smiles,
                        'molecule_name': cached['molecule_name'] or molecule_name,
                        'result': result_data,
                        'cached': True,
                        'valid': True
                    })
                else:
                    # Should be in set but not retrievable - treat as error
                    results.append({
                        'smiles': smiles,
                        'canonical_smiles': canonical_smiles,
                        'error': 'Cached result not found',
                        'valid': False
                    })
            else:
                # Mark for prediction
                results.append(None)  # Placeholder
                uncached_indices.append(i)
                uncached_smiles.append(smiles)

        except Exception as e:
            logger.error(f"Error processing SMILES {smiles}: {e}")
            invalid_smiles_list.append({
                'smiles': smiles,
                'error': str(e)
            })
            results.append({
                'smiles': smiles,
                'error': str(e),
                'valid': False
            })

    # Run batch prediction for uncached molecules
    if uncached_smiles:
        logger.info(f"Running batch prediction for {len(uncached_smiles)} uncached molecules")
        service_result = call_service('admet', {'smiles_list': uncached_smiles})

        if not service_result.get('success'):
            logger.error(f"Batch prediction failed: {service_result.get('error')}")
            for idx in uncached_indices:
                results[idx] = {
                    'smiles': request.smiles_list[idx],
                    'error': 'Prediction service failed',
                    'valid': False
                }
        else:
            batch_predictions = service_result.get('result', [])

            if len(batch_predictions) != len(uncached_smiles):
                logger.error(f"Mismatch in batch results: sent {len(uncached_smiles)}, got {len(batch_predictions)}")

            # Process results
            for i, (smiles, preds) in enumerate(zip(uncached_smiles, batch_predictions)):
                try:
                    mol = Chem.MolFromSmiles(smiles)
                    canonical_smiles = Chem.MolToSmiles(mol, canonical=True)
                    molecule_name = f"Molecule_{canonical_smiles[:15]}"

                    formatted_result = format_admet_results(
                        mol, preds, canonical_smiles, molecule_name, smiles, cached=False
                    )

                    # Cache result
                    await cache_result(canonical_smiles, smiles, molecule_name, formatted_result)

                    # Update results list at correct index
                    original_idx = uncached_indices[i]
                    results[original_idx] = {
                        'smiles': smiles,
                        'canonical_smiles': canonical_smiles,
                        'molecule_name': molecule_name,
                        'result': formatted_result,
                        'cached': False,
                        'valid': True
                    }
                except Exception as e:
                    logger.error(f"Error processing result for {smiles}: {e}")
                    original_idx = uncached_indices[i]
                    results[original_idx] = {
                        'smiles': smiles,
                        'error': str(e),
                        'valid': False
                    }

    # Count stats
    total = len(request.smiles_list)
    valid = sum(1 for r in results if r and r.get('valid'))
    cached_count = sum(1 for r in results if r and r.get('cached'))
    predicted = valid - cached_count
    invalid_count = len(invalid_smiles_list)

    return {
        'success': True,
        'batch': True,
        'total': total,
        'valid': valid,
        'cached': cached_count,
        'predicted': predicted,
        'duplicates_removed': duplicates_removed,
        'already_cached': already_cached_count,
        'invalid_count': invalid_count,
        'invalid_smiles': invalid_smiles_list if invalid_smiles_list else None,
        'results': results
    }
```

**Step 3: Verify logic manually**

Input: `["CO", "CCO", "CO", "CCCC"]`
- CO: valid, canonical CO, not cached → to uncached_smiles
- CCO: valid, canonical CCO, not cached → to uncached_smiles
- CO: valid, canonical CO, seen in seen_canonical → duplicates_removed += 1, add error result
- CCCC: valid, canonical CCCC, not cached → to uncached_smiles
Result: duplicates_removed=1, uncached_smiles=["CO", "CCO", "CCCC"], results has 4 items

**Step 4: Commit**

```bash
git add services/admet/routers.py
git commit -m "feat: add SMILES deduplication and cache checking to batch processing"
```

---

## Task 5: Update frontend batch results display with summary feedback

**Files:**
- Modify: `frontend/src/components/Tools/ADMETTool.tsx:339-406`

**Step 1: Update renderBatchResults to show summary**

Replace the `renderBatchResults` function (lines 339-406) with:

```typescript
const renderBatchResults = () => {
  if (!batchResults) return null

  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-white">Batch Results Summary</h3>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="space-y-1">
          <div className="text-xs text-gray-400">Input SMILES</div>
          <div className="text-lg font-semibold text-white">{batchResults.total}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-gray-400">Valid Results</div>
          <div className="text-lg font-semibold text-green-400">{batchResults.valid}</div>
        </div>
        {batchResults.duplicates_removed > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-gray-400">Duplicates Removed</div>
            <div className="text-lg font-semibold text-yellow-400">{batchResults.duplicates_removed}</div>
          </div>
        )}
        {batchResults.already_cached > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-gray-400">From Cache</div>
            <div className="text-lg font-semibold text-blue-400">{batchResults.already_cached}</div>
          </div>
        )}
        {batchResults.invalid_count > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-gray-400">Invalid SMILES</div>
            <div className="text-lg font-semibold text-red-400">{batchResults.invalid_count}</div>
          </div>
        )}
        {batchResults.predicted > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-gray-400">Newly Predicted</div>
            <div className="text-lg font-semibold text-teal-400">{batchResults.predicted}</div>
          </div>
        )}
      </div>

      {/* Invalid SMILES list (if any) */}
      {batchResults.invalid_smiles && batchResults.invalid_smiles.length > 0 && (
        <div className="p-4 bg-red-900/10 border border-red-500/30 rounded-lg">
          <div className="text-sm font-medium text-red-400 mb-2">Invalid SMILES ({batchResults.invalid_smiles.length})</div>
          <div className="space-y-1 max-h-[150px] overflow-y-auto">
            {batchResults.invalid_smiles.map((item, idx) => (
              <div key={idx} className="text-xs text-red-300">
                <span className="font-mono text-red-200">{item.smiles}</span>
                <span className="text-red-400"> — {item.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results table */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-300">Prediction Results</h4>
        {batchResults.results.map((item, index) => (
          <div key={index} className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
            <div className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-700/50"
                 onClick={() => setExpandedBatchRow(expandedBatchRow === index ? null : index)}>
              <div className="flex items-center gap-3 overflow-hidden">
                {expandedBatchRow === index ? <ChevronDown className="w-4 h-4 text-teal-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-white truncate max-w-[200px]">
                    {item.molecule_name || `Molecule ${index + 1}`}
                  </span>
                  <span className="text-xs text-gray-500 font-mono truncate max-w-[200px]">
                    {item.smiles}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {item.valid ? (
                  <>
                    {item.cached && (
                      <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded-full whitespace-nowrap">
                        Cached
                      </span>
                    )}
                    {!item.cached && (
                      <span className="px-2 py-0.5 text-xs bg-teal-500/20 text-teal-400 rounded-full whitespace-nowrap">
                        Predicted
                      </span>
                    )}
                    <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded-full">
                      Success
                    </span>
                  </>
                ) : (
                  <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded-full">
                    Error
                  </span>
                )}
              </div>
            </div>

            {expandedBatchRow === index && item.result && (
              <div className="p-4 border-t border-gray-700 bg-gray-900/30">
                {renderExpandedResults(item.result)}
              </div>
            )}

            {expandedBatchRow === index && item.error && (
              <div className="p-4 border-t border-gray-700 bg-red-900/10 text-red-400 text-sm">
                Error: {item.error}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Verify new layout is clear**

Mentally check: Summary shows duplicates_removed, already_cached, invalid_count, predicted. Invalid SMILES show in collapsible. Results table shows badges.

**Step 3: Commit**

```bash
git add frontend/src/components/Tools/ADMETTool.tsx
git commit -m "feat: enhance batch results display with deduplication feedback"
```

---

## Task 6: Add tooltip/info about SMILES input format

**Files:**
- Modify: `frontend/src/components/Tools/ADMETTool.tsx:474-487`

**Step 1: Add info box before SMILES input**

After line 474 (before the Input field), add:

```typescript
<div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg text-xs text-blue-300">
  <strong>SMILES Format:</strong> Enter one or more SMILES separated by commas, semicolons, newlines, or spaces. Duplicates are automatically removed.
</div>
```

**Step 2: Verify it displays correctly**

Just ensure the JSX is valid - no further test needed.

**Step 3: Commit**

```bash
git add frontend/src/components/Tools/ADMETTool.tsx
git commit -m "docs: add SMILES input format help text"
```

---

## Summary

This plan implements full SMILES validation and deduplication across frontend and backend:

1. **Type Update**: Add deduplication metadata fields to `ADMETBatchResult`
2. **Frontend Parser**: `parseSmilesInput()` splits by multiple delimiters and deduplicates within input
3. **Backend Helper**: `get_all_cached_canonical_smiles()` fetches all cached SMILES efficiently
4. **Backend Deduplication**: Enhanced batch processing with tracking of duplicates, cached hits, and invalid SMILES
5. **Frontend UX**: Rich summary display showing counts and invalid SMILES list
6. **Documentation**: Help text explaining SMILES input format

**Flow after implementation:**
- User enters: `"CO, CO COO\nCO,CCCC"`
- Frontend parses to: `["CO", "COO", "CCCC"]` (deduped within input)
- Backend gets cached_set: say `{"CO", "CCCC"}`
- Backend processes: CO → cached, COO → new prediction, CCCC → cached
- Backend returns: total=3, duplicates_removed=2, already_cached=2, predicted=1
- Frontend shows summary with all stats

Invalid SMILES like "INVALID" are silently filtered with count reported.

---
