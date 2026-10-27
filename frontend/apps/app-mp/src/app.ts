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
    void hydrateAuth(store.dispatch);

    store.subscribe(() => {
      const { accessToken, hydrated } = store.getState().auth;
      if (!hydrated || accessToken) {
        return;
      }
      const pages = getCurrentPages();
      const route = pages.length ? pages[pages.length - 1]?.route || '' : '';
      if (route === 'pages/auth/index') {
        return;
      }
      wx.reLaunch({ url: '/pages/auth/index' });
    });
  },
});
