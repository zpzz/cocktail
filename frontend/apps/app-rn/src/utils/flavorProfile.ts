import type { WorkbenchFlavorProfile, WorkbenchSession } from '@cocktail/shared';

export type FlavorAxes = {
  sweetness: number;
  alcohol: number;
  sourness: number;
  aroma: number;
  energy: number;
  difficulty: number;
};

const SWEET = ['糖浆', '利口', 'liqueur', 'syrup', '蜜', '甜'];
const SOUR = ['柠檬', '青柠', '酸', 'lemon', 'lime', '柑橘'];
const BITTER = ['苦精', '苦艾', 'bitters', '金巴利', '苏兹'];
const BASE = ['金酒', '伏特加', '朗姆', '威士忌', '白兰地', '龙舌兰', 'gin', 'vodka', 'rum'];

function hay(session: WorkbenchSession): string {
  return session.ingredients
    .map((i) => i.name)
    .join(' ')
    .toLowerCase();
}

function hasAny(text: string, keys: string[]) {
  return keys.some((k) => text.includes(k.toLowerCase()));
}

function clamp01(v: number | null | undefined, fallback: number): number {
  if (v == null || Number.isNaN(Number(v))) {
    return fallback;
  }
  return Math.max(0, Math.min(1, Number(v)));
}

/** 将 AI 分析返回的 flavorProfile 转为雷达图六维；缺字段用 fallback 补齐。 */
export function axesFromAnalyze(
  profile: WorkbenchFlavorProfile | null | undefined,
  fallback?: FlavorAxes,
): FlavorAxes | null {
  if (!profile) {
    return null;
  }
  const fb = fallback ?? {
    sweetness: 0.2,
    alcohol: 0.2,
    sourness: 0.2,
    aroma: 0.2,
    energy: 0.2,
    difficulty: 0.2,
  };
  return {
    sweetness: clamp01(profile.sweetness, fb.sweetness),
    alcohol: clamp01(profile.alcohol, fb.alcohol),
    sourness: clamp01(profile.sourness, fb.sourness),
    aroma: clamp01(profile.aroma, fb.aroma),
    energy: clamp01(profile.energy, fb.energy),
    difficulty: clamp01(profile.difficulty, fb.difficulty),
  };
}

/** 根据当前会话启发式生成雷达图六维（0~1），分析前预览用。 */
export function deriveFlavorAxes(session: WorkbenchSession): FlavorAxes {
  const text = hay(session);
  const count = session.ingredients.length;
  const vol = Number(session.volumeMl || 0);
  const cap = Number(session.capacityMl || 200);
  const fill = cap > 0 ? Math.min(1, vol / cap) : 0.4;

  const sweetness = hasAny(text, SWEET) ? 0.72 : count > 0 ? 0.35 : 0.2;
  const sourness = hasAny(text, SOUR) ? 0.78 : 0.25;
  const bitter = hasAny(text, BITTER) ? 0.65 : 0.2;
  const hasBase = hasAny(text, BASE);

  const alcohol = hasBase ? Math.min(0.95, 0.45 + fill * 0.5) : count > 0 ? 0.3 : 0.15;
  const aroma = Math.min(0.9, 0.25 + count * 0.12 + (session.garnishes?.length ?? 0) * 0.08);
  const energy = Math.min(0.95, fill * 0.85 + (hasBase ? 0.15 : 0));
  const method = session.method || '';
  let difficulty = 0.35;
  if (method === 'layer') {
    difficulty = 0.85;
  } else if (method === 'shake') {
    difficulty = 0.55;
  } else if (method === 'stir') {
    difficulty = 0.45;
  }

  return {
    sweetness,
    alcohol,
    sourness,
    aroma,
    energy,
    difficulty: Math.max(difficulty, bitter * 0.3),
  };
}

export const FLAVOR_AXIS_LABELS = ['甜度', '酒精感', '酸度', '香气', '能量', '难度'] as const;

export function axesToArray(axes: FlavorAxes): number[] {
  return [
    axes.sweetness,
    axes.alcohol,
    axes.sourness,
    axes.aroma,
    axes.energy,
    axes.difficulty,
  ];
}
