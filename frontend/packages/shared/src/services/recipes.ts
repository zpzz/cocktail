import { API_PATHS } from '../constants/api';
import type { HttpClient } from '../http/client';
import type { RecipeSummary } from '../types/api';

export function createRecipeService(http: HttpClient) {
  return {
    random(preferImage = true) {
      return http.get<RecipeSummary>(API_PATHS.recipesRandom, { preferImage });
    },
  };
}
