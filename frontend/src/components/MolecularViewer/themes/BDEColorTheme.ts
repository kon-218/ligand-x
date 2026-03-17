/**
 * BDE (Bond Dissociation Energy) Color Theme
 * Colors bonds based on their BDE values.
 * - Weak bonds (low BDE): Red
 * - Strong bonds (high BDE): Green/Blue
 */

import { ColorTheme } from 'molstar/lib/mol-theme/color';
import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { Color } from 'molstar/lib/mol-util/color';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { Bond, StructureElement, StructureProperties } from 'molstar/lib/mol-model/structure';

export interface BDEBondData {
  atom1_idx: number
  atom2_idx: number
  bde_corrected_kcal: number
  bond_label: string
}

export const BDEColorThemeParams = {
    bonds: PD.Value<BDEBondData[]>([], { isHidden: true }),
    minBDE: PD.Value<number>(0, { isHidden: true }),
    maxBDE: PD.Value<number>(100, { isHidden: true }),
};

export type BDEColorThemeParams = typeof BDEColorThemeParams;

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

export function BDEColorTheme(
    ctx: ThemeDataContext,
    props: PD.Values<BDEColorThemeParams>
): ColorTheme<BDEColorThemeParams> {
    const { bonds, minBDE, maxBDE } = props;

    console.log(`[STYLE] Creating BDE color theme: ${bonds?.length || 0} bonds, range ${minBDE}-${maxBDE}`);

    const range = maxBDE - minBDE;
    const normalizedRange = range < 0.001 ? 0.001 : range;

    // Color scheme: weak (pale blue) -> strong (deep blue)
    const weakColor = Color.fromRgb(180, 210, 255);   // Pale blue
    const strongColor = Color.fromRgb(25, 70, 200);   // Deep blue

    // Create lookup map for bond BDE values
    const bondBDEMap = new Map<string, number>();
    if (bonds) {
        for (const bond of bonds) {
            // Store both directions for lookup
            const key1 = `${bond.atom1_idx}-${bond.atom2_idx}`;
            const key2 = `${bond.atom2_idx}-${bond.atom1_idx}`;
            bondBDEMap.set(key1, bond.bde_corrected_kcal);
            bondBDEMap.set(key2, bond.bde_corrected_kcal);
        }
    }

    return {
        factory: BDEColorTheme,
        granularity: 'group',
        color: (location: any) => {
            // Handle bond locations
            if (Bond.isLocation(location)) {
                const { aIndex, bIndex } = location;
                const key = `${aIndex}-${bIndex}`;
                const bde = bondBDEMap.get(key);

                if (bde !== undefined) {
                    const normalized = Math.max(0, Math.min(1, (bde - minBDE) / normalizedRange));
                    return interpolateColor(weakColor, strongColor, normalized);
                }
            }

            // Handle atom locations - color atoms based on their bonds
            if (StructureElement.Location.is(location)) {
                const atomIndex = location.element;

                for (const bond of bonds || []) {
                    if (bond.atom1_idx === atomIndex || bond.atom2_idx === atomIndex) {
                        const bde = bond.bde_corrected_kcal;
                        const normalized = Math.max(0, Math.min(1, (bde - minBDE) / normalizedRange));
                        return interpolateColor(weakColor, strongColor, normalized);
                    }
                }
            }

            return Color.fromRgb(180, 180, 180); // Default gray
        },
        props: props,
        description: 'Bond Dissociation Energy Visualization',
    };
}

export const BDEColorThemeProvider: ColorTheme.Provider<BDEColorThemeParams, 'bde-energy'> = {
    name: 'bde-energy',
    label: 'Bond Dissociation Energy',
    category: 'Custom',
    factory: BDEColorTheme,
    getParams: () => BDEColorThemeParams,
    defaultValues: PD.getDefaultValues(BDEColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => true,
};
