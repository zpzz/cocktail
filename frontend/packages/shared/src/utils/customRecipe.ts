import type {
  CustomDetail,
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
