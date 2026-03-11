/**
 * Atomic Charges Color Theme
 * Colors atoms based on their partial charge values using a diverging red-white-blue scale.
 * - Negative: Blue  (electron-rich)
 * - Near zero: White
 * - Positive: Red   (electron-poor)
 */

import { ColorTheme } from 'molstar/lib/mol-theme/color';
import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { Color } from 'molstar/lib/mol-util/color';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { StructureElement, StructureProperties, Unit } from 'molstar/lib/mol-model/structure';

export const ChargesColorThemeParams = {
    values: PD.Value<number[]>([], { isHidden: true }),
};

export type ChargesColorThemeParams = typeof ChargesColorThemeParams;

function interpolateColor(color1: Color, color2: Color, factor: number): Color {
    const r1 = (color1 >> 16) & 0xFF;
    const g1 = (color1 >> 8) & 0xFF;
    const b1 = color1 & 0xFF;
    const r2 = (color2 >> 16) & 0xFF;
    const g2 = (color2 >> 8) & 0xFF;
    const b2 = color2 & 0xFF;
    return Color.fromRgb(
        Math.round(r1 + (r2 - r1) * factor),
        Math.round(g1 + (g2 - g1) * factor),
        Math.round(b1 + (b2 - b1) * factor),
    );
}

const WHITE  = Color.fromRgb(240, 240, 240);
const RED    = Color.fromRgb(220, 50,  50);   // positive charge
const BLUE   = Color.fromRgb(50,  100, 220);  // negative charge

export function ChargesColorTheme(
    ctx: ThemeDataContext,
    props: PD.Values<ChargesColorThemeParams>
): ColorTheme<ChargesColorThemeParams> {
    const { values } = props;

    // Symmetric range so that 0 always maps to white
    let maxAbs = 0;
    if (values && values.length > 0) {
        maxAbs = Math.max(...values.map(Math.abs));
    }
    const range = maxAbs < 0.001 ? 0.001 : maxAbs;

    const currentValues = values;

    return {
        factory: ChargesColorTheme,
        granularity: 'group',
        color: (location: any) => {
            if (StructureElement.Location.is(location)) {
                let atomIndex = -1;

                if (Unit.isAtomic(location.unit)) {
                    atomIndex = location.element;
                }

                if ((atomIndex === -1 || atomIndex >= currentValues.length) && currentValues?.length > 0) {
                    try {
                        const sourceIndex = StructureProperties.atom.sourceIndex(location);
                        if (sourceIndex >= 0 && sourceIndex < currentValues.length) {
                            atomIndex = sourceIndex;
                        }
                    } catch { /* ignore */ }
                }

                if (currentValues && atomIndex >= 0 && atomIndex < currentValues.length) {
                    const val = currentValues[atomIndex];
                    // Normalise to [-1, +1] then split into positive/negative halves
                    const norm = Math.max(-1, Math.min(1, val / range));
                    if (norm >= 0) {
                        return interpolateColor(WHITE, RED, norm);
                    } else {
                        return interpolateColor(WHITE, BLUE, -norm);
                    }
                }
            }
            return Color.fromRgb(200, 200, 200);
        },
        props,
        description: 'Atomic Partial Charges',
    };
}

export const ChargesColorThemeProvider: ColorTheme.Provider<ChargesColorThemeParams, 'atomic-charges'> = {
    name: 'atomic-charges',
    label: 'Atomic Charges',
    category: 'Custom',
    factory: ChargesColorTheme,
    getParams: () => ChargesColorThemeParams,
    defaultValues: PD.getDefaultValues(ChargesColorThemeParams),
    isApplicable: (_ctx: ThemeDataContext) => true,
};
