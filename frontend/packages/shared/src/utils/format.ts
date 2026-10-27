import type { MenuIngredient, RecipeSummary } from '../types/api';

/** ISO 时间 →「M月D日 HH:mm」 */
export function formatShortDateTime(iso?: string): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

export function formatIngredientAmount(ing: MenuIngredient): string {
  if (ing.amount != null && ing.amount !== undefined) {
    return `${ing.amount}${ing.unit || ''}`;
  }
  return ing.unit || '';
}

export function methodDifficultyLabel(method?: string): string {
  switch (method) {
    case 'layer':
      return '进阶';
    case 'shake':
      return '中等';
    case 'stir':
    case 'build':
      return '简单';
    default:
      return '中等';
  }
}

export function recipeMetaLine(recipe: RecipeSummary): string {
  const parts = [
    recipe.category,
    recipe.baseSpirit,
    ...(recipe.flavorTags ?? []).slice(0, 2),
  ].filter((x): x is string => Boolean(x && String(x).trim()));
  return parts.length ? parts.join(' · ') : '精选配方';
}
