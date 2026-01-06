/**
 * Fukui Indices Color Theme
 * Colors atoms based on their Fukui index values.
 * - f+ (Nucleophilic): Red/Pink for high values (sites susceptible to nucleophilic attack)
 * - f- (Electrophilic): Blue for high values (sites susceptible to electrophilic attack)
 * - f0 (Radical): Purple for high values (sites susceptible to radical attack)
 */

import { ColorTheme } from 'molstar/lib/mol-theme/color';
import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { Color } from 'molstar/lib/mol-util/color';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { StructureElement, StructureProperties, Unit } from 'molstar/lib/mol-model/structure';

// Define the parameters for our theme
export const FukuiColorThemeParams = {
    values: PD.Value<number[]>([], { isHidden: true }),
    type: PD.Value<string>('f+', { isHidden: true }),
};

export type FukuiColorThemeParams = typeof FukuiColorThemeParams;

// Helper function to interpolate between two colors
function interpolateColor(color1: Color, color2: Color, factor: number): Color {
    const r1 = (color1 >> 16) & 0xFF;
    const g1 = (color1 >> 8) & 0xFF;
    const b1 = color1 & 0xFF;

    const r2 = (color2 >> 16) & 0xFF;
    const g2 = (color2 >> 8) & 0xFF;
    const b2 = color2 & 0xFF;

    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);

    return Color.fromRgb(r, g, b);
}

export function FukuiColorTheme(
    ctx: ThemeDataContext,
    props: PD.Values<FukuiColorThemeParams>
): ColorTheme<FukuiColorThemeParams> {
    // Always get fresh values from props to ensure we use the latest parameters
    const { values, type } = props;

    console.log(`[STYLE] Creating/Updating Fukui color theme: type=${type}, values count=${values?.length || 0}`);
    
    // Check if structure is available
    const structure = ctx.structure;
    if (structure) {
        const atomCount = structure.units.reduce((sum, unit) => sum + (unit.elements?.length || 0), 0);
        console.log(`🔍 Structure has ${atomCount} atoms, Fukui values: ${values?.length || 0}`);
    }

    // Find min/max for normalization - recalculate each time to ensure fresh values
    let max = 0;
    let min = 0;

    if (values && values.length > 0) {
        // Create a copy to avoid mutation issues
        const valuesCopy = [...values];
        max = Math.max(...valuesCopy);
        min = Math.min(...valuesCopy);
        console.log(`[INFO] Fukui value range: min=${min.toFixed(4)}, max=${max.toFixed(4)}`);
    } else {
        console.warn('[WARNING] No Fukui values provided to theme');
    }

    // Ensure we have a spread
    const range = max - min;
    const normalizedRange = range < 0.001 ? 0.001 : range;

    // Define color schemes for each Fukui type
    const colorSchemes = {
        'f+': {
            low: Color.fromRgb(240, 240, 240),  // Light gray/white
            high: Color.fromRgb(220, 50, 50),    // Red (nucleophilic attack)
        },
        'f-': {
            low: Color.fromRgb(240, 240, 240),  // Light gray/white
            high: Color.fromRgb(50, 100, 220),   // Blue (electrophilic attack)
        },
        'f0': {
            low: Color.fromRgb(240, 240, 240),  // Light gray/white
            high: Color.fromRgb(150, 50, 200),   // Purple (radical attack)
        }
    };

    const scheme = colorSchemes[type as keyof typeof colorSchemes] || colorSchemes['f+'];

    // Store values and type in closure to ensure we always use the latest
    const currentValues = values;
    const currentType = type;
    const currentScheme = scheme;
    const currentMin = min;
    const currentMax = max;
    const currentRange = normalizedRange;

    return {
        factory: FukuiColorTheme,
        granularity: 'group',
        color: (location: any) => {
            // Always use the latest values from closure (props are updated when theme is recreated)
            if (StructureElement.Location.is(location)) {
                // For small molecules (XYZ/MOL), atoms are typically in a single unit
                // The element index within the unit should directly map to the Fukui array
                let atomIndex = -1;

                if (Unit.isAtomic(location.unit)) {
                    // Use element index directly - this is the position in the unit
                    // For small molecules, this should match the order in the Fukui results
                    atomIndex = location.element;
                }

                // Fallback: try source index if element index doesn't work
                if ((atomIndex === -1 || atomIndex === undefined || atomIndex >= currentValues.length) && currentValues && currentValues.length > 0) {
                    try {
                        const sourceIndex = StructureProperties.atom.sourceIndex(location);
                        // For small molecules, source index might be the same as element index
                        // But we need to ensure it's within bounds
                        if (sourceIndex >= 0 && sourceIndex < currentValues.length) {
                            atomIndex = sourceIndex;
                        }
                    } catch (e) {
                        // Ignore errors
                    }
                }

                // Use values from closure to ensure we get the latest values
                if (currentValues && atomIndex >= 0 && atomIndex < currentValues.length) {
                    const val = currentValues[atomIndex];
                    // Normalize value to 0-1 range using the calculated range
                    const normalized = Math.max(0, Math.min(1, (val - currentMin) / currentRange));

                    // Interpolate between low and high colors using current scheme
                    const color = interpolateColor(currentScheme.low, currentScheme.high, normalized);
                    return color;
                } else {
                    // Debug: log when we can't find the atom index (but only for first few to avoid spam)
                    if (currentValues && currentValues.length > 0 && atomIndex < 5) {
                        console.warn(`[WARNING] Could not map atom: element=${location.element}, atomIndex=${atomIndex}, values.length=${currentValues.length}`);
                    }
                }
            }
            return Color.fromRgb(200, 200, 200); // Default grey
        },
        props: props,
        description: `Fukui Indices Visualization (${currentType})`,
    };
}

export const FukuiColorThemeProvider: ColorTheme.Provider<FukuiColorThemeParams, 'fukui-indices'> = {
    name: 'fukui-indices',
    label: 'Fukui Indices',
    category: 'Custom',
    factory: FukuiColorTheme,
    getParams: () => FukuiColorThemeParams,
    defaultValues: PD.getDefaultValues(FukuiColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => true,
};
