import { API_PATHS } from '../constants/api';
import type { HttpClient } from '../http/client';
import type { CustomDetail, CustomSummary, WorkbenchRecipe } from '../types/api';

export function createCustomService(http: HttpClient) {
  return {
    list() {
      return http.get<CustomSummary[]>(API_PATHS.customs);
    },
    detail(id: number) {
      return http.get<CustomDetail>(`${API_PATHS.customs}/${id}`);
    },
    save(body: {
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
    }) {
      return http.post<CustomDetail>(API_PATHS.customs, body);
    },
    remove(id: number) {
      return http.delete<null>(`${API_PATHS.customs}/${id}`);
    },
  };
}
