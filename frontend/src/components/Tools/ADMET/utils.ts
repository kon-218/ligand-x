// Utility functions for ADMET workflow

/**
 * Helper to parse value and unit for better display
 * e.g., "0.43 (logD7.4)" -> { value: "0.43", unit: "logD7.4" }
 */
export const parseValueUnit = (value: any): { value: string; unit: string } => {
    // Convert value to string first to handle numbers and other types
    const valueString = String(value ?? '')

    // Match patterns like "0.43 (logD7.4)" or "0.95 (Prob.)"
    const match = valueString.match(/^(.+?)\s*\((.+?)\)$/)
    if (match) {
        return { value: match[1].trim(), unit: match[2].trim() }
    }
    return { value: valueString, unit: '' }
}
