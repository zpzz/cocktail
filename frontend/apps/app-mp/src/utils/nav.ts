import { openLoginPrompt } from '../auth/loginGate';
import { hydrateAuth } from '../auth/session';
import { store } from '../store';

/**
 * 确保已登录；无 token 时弹出全局「先登录」对话框。
 */
export async function requireAuth(): Promise<boolean> {
  if (!store.getState().auth.hydrated) {
    await hydrateAuth(store.dispatch);
  }
  const { accessToken, hydrated } = store.getState().auth;
  if (!hydrated) {
    return false;
  }
  if (accessToken) {
    return true;
  }
  return openLoginPrompt();
}
