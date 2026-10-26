import { API_PATHS } from '../constants/api';
import type { HttpClient } from '../http/client';
import type { MenuRecipe, SavedMenuDetail, SavedMenuSummary } from '../types/api';

export function createMenuService(http: HttpClient) {
  return {
    list() {
      return http.get<SavedMenuSummary[]>(API_PATHS.menus);
    },
    detail(id: number) {
      return http.get<SavedMenuDetail>(`${API_PATHS.menus}/${id}`);
    },
    save(body: { title?: string; recipes: MenuRecipe[] }) {
      return http.post<SavedMenuDetail>(API_PATHS.menus, body);
    },
    remove(id: number) {
      return http.delete<null>(`${API_PATHS.menus}/${id}`);
    },
  };
}
