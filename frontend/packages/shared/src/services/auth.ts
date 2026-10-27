import { API_PATHS } from '../constants/api';
import type { HttpClient } from '../http/client';
import type {
  LoginRequest,
  RegisterRequest,
  RefreshRequest,
  TokenResponse,
  UpdateProfileRequest,
  UserResponse,
  WechatLoginRequest,
} from '../types/api';

export function createAuthService(http: HttpClient) {
  return {
    register(payload: RegisterRequest) {
      return http.post<UserResponse>(API_PATHS.authRegister, payload);
    },
    login(payload: LoginRequest) {
      return http.post<TokenResponse>(API_PATHS.authLogin, payload);
    },
    wechatLogin(payload: WechatLoginRequest) {
      return http.post<TokenResponse>(API_PATHS.authWechat, payload);
    },
    refresh(payload: RefreshRequest) {
      return http.post<TokenResponse>(API_PATHS.authRefresh, payload);
    },
    logout() {
      return http.post<null>(API_PATHS.authLogout);
    },
    updateProfile(payload: UpdateProfileRequest) {
      return http.patch<UserResponse>(API_PATHS.authProfile, payload);
    },
    uploadAvatar(file: { uri: string; name: string; type: string }) {
      return http.postMultipart<UserResponse>(API_PATHS.authAvatar, 'file', file);
    },
  };
}
