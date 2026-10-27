const KEY = 'cocktail.auth.v1';

export type PersistedAuth = {
  accessToken: string;
  refreshToken: string;
  username: string;
  nickname: string;
};

export async function loadPersistedAuth(): Promise<PersistedAuth | null> {
  try {
    const raw = wx.getStorageSync(KEY) as string;
    if (!raw) {
      return null;
    }
    const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as PersistedAuth;
    if (!parsed.accessToken || !parsed.refreshToken) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function savePersistedAuth(auth: PersistedAuth): Promise<void> {
  wx.setStorageSync(KEY, JSON.stringify(auth));
}

export async function clearPersistedAuth(): Promise<void> {
  wx.removeStorageSync(KEY);
}
