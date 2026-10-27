import { API_PATHS } from '../constants/api';
import type { HttpClient } from '../http/client';
import type { CustomDetail, CustomSummary } from '../types/api';
import type { CustomSaveBody } from '../utils/customRecipe';

export type { CustomSaveBody };

export function createCustomService(http: HttpClient) {
  return {
    list() {
      return http.get<CustomSummary[]>(API_PATHS.customs);
    },
    detail(id: number) {
      return http.get<CustomDetail>(`${API_PATHS.customs}/${id}`);
    },
    save(body: CustomSaveBody) {
      return http.post<CustomDetail>(API_PATHS.customs, body);
    },
    remove(id: number) {
      return http.delete<null>(`${API_PATHS.customs}/${id}`);
    },
  };
}
