import { setupPrivacyAuthorization } from './auth/privacy';
import { hydrateAuth } from './auth/session';
import { store } from './store';

type PendingRecipePayload = {
  recipe: unknown;
  imageUrl?: string | null;
  from?: string;
  sessionId?: string;
  feeling?: string;
  customId?: number;
};

App({
  globalData: {
    pendingRecipe: null as PendingRecipePayload | null,
  },

  onLaunch() {
    setupPrivacyAuthorization();
    // 游客可浏览公开内容；需登录的接口在 requireAuth / HTTP 401 时再走微信登录
    void hydrateAuth(store.dispatch);
  },
});
