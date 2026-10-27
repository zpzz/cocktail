import { API_PATHS } from '../constants/api';
import type { HttpClient } from '../http/client';
import type { RecipeEnrich, RecipeKbDetail, RecipeSummary } from '../types/api';

export function createRecipeService(http: HttpClient) {
  return {
    random(preferImage = true) {
      return http.get<RecipeSummary>(API_PATHS.recipesRandom, { preferImage });
    },
    detail(id: number) {
      return http.get<RecipeKbDetail>(`${API_PATHS.recipes}/${id}`);
    },
    enrich(id: number) {
      return http.post<RecipeEnrich>(`${API_PATHS.recipes}/${id}/enrich`);
    },
  };
}
