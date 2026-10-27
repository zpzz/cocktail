import {
  createAuthService,
  createCabinetService,
  createChatService,
  createCustomService,
  createIngredientService,
  createMenuService,
  createRecipeService,
  createWorkbenchService,
  signedOut,
  tokensRefreshed,
} from '@cocktail/shared';
import { resolveApiBaseUrl } from './adapters/apiBase';
import { createWxHttpClient } from './adapters/http';
import { openLoginPrompt } from './auth/loginGate';
import { clearPersistedAuth, savePersistedAuth } from './auth/storage';
import { store } from './store';

export const apiBaseUrl = resolveApiBaseUrl();

export const http = createWxHttpClient(apiBaseUrl, {
  getAccessToken: () => store.getState().auth.accessToken,
  getRefreshToken: () => store.getState().auth.refreshToken,
  onTokensRefreshed: async ({ accessToken, refreshToken }) => {
    const { username, nickname, avatarUrl } = store.getState().auth;
    store.dispatch(tokensRefreshed({ accessToken, refreshToken }));
    if (username) {
      await savePersistedAuth({
        accessToken,
        refreshToken,
        username,
        nickname: nickname || username,
        avatarUrl: avatarUrl ?? null,
      });
    }
  },
  onAuthFailure: async () => {
    await clearPersistedAuth();
    store.dispatch(signedOut());
  },
  // 刷新失败后弹出「先登录」对话框，成功后再重试原请求
  tryReauthenticate: () => openLoginPrompt(),
});

export const authService = createAuthService(http);
export const chatService = createChatService(http);
export const cabinetService = createCabinetService(http);
export const ingredientService = createIngredientService(http);
export const menuService = createMenuService(http);
export const recipeService = createRecipeService(http);
export const workbenchService = createWorkbenchService(http);
export const customService = createCustomService(http);
