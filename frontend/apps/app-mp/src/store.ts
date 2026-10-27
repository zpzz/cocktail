import { createAppStore, type AppStore } from '@cocktail/shared';

/**
 * 小程序每个页面独立打包时，模块级单例会复制多份。
 * 挂到 globalThis，保证登录态全小程序共用。
 */
type StoreGlobal = typeof globalThis & {
  __cocktailStore?: AppStore;
};

const g = globalThis as StoreGlobal;

export const store = (g.__cocktailStore ??= createAppStore());
export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
