import { API_PATHS } from '../constants/api';
import type { HttpClient, MultipartFilePart } from '../http/client';
import type {
  CabinetAddRequest,
  CabinetItem,
  CabinetListResponse,
  CabinetUpdateRequest,
  MenuResponse,
  RecognizeResponse,
} from '../types/api';

export type CabinetListParams = {
  q?: string;
  category?: string;
  subCategory?: string;
  page?: number;
  size?: number;
};

export function createCabinetService(http: HttpClient) {
  return {
    list(params?: CabinetListParams) {
      return http.get<CabinetListResponse>(API_PATHS.cabinet, params);
    },
    add(body: CabinetAddRequest) {
      return http.post<CabinetItem[]>(API_PATHS.cabinet, body);
    },
    update(id: number, body: CabinetUpdateRequest) {
      return http.put<CabinetItem>(`${API_PATHS.cabinet}/${id}`, body);
    },
    remove(id: number) {
      return http.delete<null>(`${API_PATHS.cabinet}/${id}`);
    },
    recognize(file: MultipartFilePart) {
      return http.postMultipart<RecognizeResponse>(
        API_PATHS.cabinetRecognize,
        'file',
        file,
      );
    },
    menu(body?: { limit?: number; diversity?: boolean }) {
      return http.post<MenuResponse>(API_PATHS.cabinetMenu, body ?? {
        limit: 5,
        diversity: true,
      });
    },
  };
}
