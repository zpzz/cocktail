import { API_PATHS } from '../constants/api';
import type { HttpClient } from '../http/client';
import type { HomeQuickEntriesResponse } from '../types/api';

export function createHomeService(http: HttpClient) {
  return {
    quickEntries() {
      return http.get<HomeQuickEntriesResponse>(API_PATHS.homeQuickEntries);
    },
  };
}
