import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

type MciName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export const METHOD_ICONS: Record<string, MciName> = {
  shake: 'shaker-outline',
  stir: 'spoon-sugar',
  build: 'glass-cocktail',
  layer: 'layers-triple',
};

export const ICE_ICONS: Record<string, MciName> = {
  none: 'circle-off-outline',
  less: 'cube-outline',
  standard: 'snowflake',
  crushed: 'dots-grid',
  large: 'square-outline',
};
