import type {
  CustomDetail,
  RecipeEnrich,
  RecipeKbDetail,
  WorkbenchFlavorProfile,
  WorkbenchRecipe,
} from '../types/api';

export type CustomSaveBody = {
  workbenchSessionId?: string;
  name: string;
  nameEn?: string;
  glass?: string;
  method?: string;
  iceType?: string;
  garnishes?: string[];
  feeling?: string;
  flavorSummary?: string;
  abvRange?: string;
  difficulty?: string;
  taste?: string;
  flavorProfile?: WorkbenchRecipe['flavorProfile'];
  ingredients?: WorkbenchRecipe['ingredients'];
  steps?: WorkbenchRecipe['steps'];
  instructions?: string;
  imageUrl?: string;
};

export function pickRecipeProfile(
  recipe: WorkbenchRecipe | null | undefined,
): WorkbenchFlavorProfile | null {
  if (!recipe) {
    return null;
  }
  return recipe.flavorProfile ?? recipe.flavor_profile ?? null;
}

/** 已收藏特调详情 → 工作台配方结构（详情页复用） */
export function customDetailToRecipe(detail: CustomDetail): WorkbenchRecipe {
  return {
    name: detail.name,
    nameEn: detail.nameEn,
    glass: detail.glass,
    method: detail.method,
    iceType: detail.iceType,
    garnishes: detail.garnishes,
    feeling: detail.feeling,
    flavorSummary: detail.flavorSummary,
    abvRange: detail.abvRange ?? undefined,
    difficulty: detail.difficulty ?? undefined,
    taste: detail.taste ?? undefined,
    flavorProfile: detail.flavorProfile ?? undefined,
    ingredients: detail.ingredients ?? [],
    steps: detail.steps ?? [],
    instructions: detail.instructions,
  };
}

/** 知识库配方详情 → 详情页用的 WorkbenchRecipe（可再 merge AI enrich） */
export function kbDetailToRecipe(
  detail: RecipeKbDetail,
  enrich?: RecipeEnrich | null,
): WorkbenchRecipe {
  const garnishes = detail.garnish
    ? detail.garnish
        .split(/[,，、]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  return {
    name: detail.name,
    nameEn: detail.nameEn ?? undefined,
    glass: detail.glass ?? undefined,
    method: detail.method ?? undefined,
    iceType: detail.iceType ?? undefined,
    garnishes,
    flavorSummary: enrich?.flavorSummary || detail.description || undefined,
    abvRange: enrich?.abvRange || detail.abvRange || undefined,
    difficulty: enrich?.difficulty || undefined,
    taste: enrich?.taste || detail.flavorTags?.slice(0, 2).join('') || undefined,
    flavorProfile: enrich?.flavorProfile ?? undefined,
    ingredients: detail.ingredients ?? [],
    steps: detail.steps ?? [],
    instructions: detail.instructions ?? undefined,
  };
}

/** 把 AI enrich 合并进已有配方展示对象 */
export function mergeRecipeEnrich(
  recipe: WorkbenchRecipe,
  enrich: RecipeEnrich | null | undefined,
): WorkbenchRecipe {
  if (!enrich) {
    return recipe;
  }
  return {
    ...recipe,
    flavorSummary: enrich.flavorSummary || recipe.flavorSummary,
    abvRange: enrich.abvRange || recipe.abvRange,
    difficulty: enrich.difficulty || recipe.difficulty,
    taste: enrich.taste || recipe.taste,
    flavorProfile: enrich.flavorProfile ?? recipe.flavorProfile,
  };
}

/** 归一 camel/snake 字段，生成收藏请求体 */
export function buildCustomSaveBody(input: {
  recipe: WorkbenchRecipe;
  workbenchSessionId?: string;
  feelingFallback?: string;
  imageUrl?: string | null;
}): CustomSaveBody {
  const { recipe, workbenchSessionId, feelingFallback, imageUrl } = input;
  return {
    workbenchSessionId,
    name: recipe.name,
    nameEn: recipe.nameEn,
    glass: recipe.glass,
    method: recipe.method,
    iceType: recipe.iceType || recipe.ice_type,
    garnishes: recipe.garnishes,
    feeling: recipe.feeling || feelingFallback,
    flavorSummary: recipe.flavorSummary || recipe.flavor_summary,
    abvRange: recipe.abvRange || recipe.abv_range,
    difficulty: recipe.difficulty,
    taste: recipe.taste,
    flavorProfile: recipe.flavorProfile || recipe.flavor_profile || undefined,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    instructions: recipe.instructions,
    imageUrl: imageUrl || undefined,
  };
}
