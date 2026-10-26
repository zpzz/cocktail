import { API_PATHS } from '../constants/api';
import type { HttpClient } from '../http/client';
import type {
  LoginRequest,
  RegisterRequest,
  RefreshRequest,
  TokenResponse,
  UserResponse,
} from '../types/api';

export function createAuthService(http: HttpClient) {
  return {
    register(payload: RegisterRequest) {
      return http.post<UserResponse>(API_PATHS.authRegister, payload);
    },
    login(payload: LoginRequest) {
      return http.post<TokenResponse>(API_PATHS.authLogin, payload);
    },
    refresh(payload: RefreshRequest) {
      return http.post<TokenResponse>(API_PATHS.authRefresh, payload);
    },
    logout() {
      return http.post<null>(API_PATHS.authLogout);
    },
  };
}
