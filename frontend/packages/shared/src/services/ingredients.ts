import { API_PATHS } from '../constants/api';
import type { HttpClient } from '../http/client';
import type {
  CategoriesResponse,
  IngredientSearchResponse,
} from '../types/api';

export type IngredientSearchParams = {
  q?: string;
  category?: string;
  subCategory?: string;
  page?: number;
  size?: number;
};

export function createIngredientService(http: HttpClient) {
  return {
    categories() {
      return http.get<CategoriesResponse>(API_PATHS.ingredientsCategories);
    },
    search(params?: IngredientSearchParams) {
      return http.get<IngredientSearchResponse>(
        API_PATHS.ingredientsSearch,
        params,
      );
    },
  };
}
