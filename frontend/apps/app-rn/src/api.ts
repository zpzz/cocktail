import {
  createAuthService,
  createCabinetService,
  createChatService,
  createCustomService,
  createIngredientService,
  createMenuService,
  createWorkbenchService,
  signedOut,
  tokensRefreshed,
} from '@cocktail/shared';
import { resolveApiBaseUrl } from './adapters/apiBase';
import { createFetchHttpClient } from './adapters/http';
import { clearPersistedAuth, savePersistedAuth } from './auth/storage';
import { store } from './store';

export const apiBaseUrl = resolveApiBaseUrl();

export const http = createFetchHttpClient(apiBaseUrl, {
  getAccessToken: () => store.getState().auth.accessToken,
  getRefreshToken: () => store.getState().auth.refreshToken,
  onTokensRefreshed: async ({ accessToken, refreshToken }) => {
    const { username, nickname } = store.getState().auth;
    store.dispatch(tokensRefreshed({ accessToken, refreshToken }));
    if (username) {
      await savePersistedAuth({
        accessToken,
        refreshToken,
        username,
        nickname: nickname || username,
      });
    }
  },
  onAuthFailure: async () => {
    await clearPersistedAuth();
    store.dispatch(signedOut());
  },
});

export const authService = createAuthService(http);
export const chatService = createChatService(http);
export const cabinetService = createCabinetService(http);
export const ingredientService = createIngredientService(http);
export const menuService = createMenuService(http);
export const workbenchService = createWorkbenchService(http);
export const customService = createCustomService(http);
