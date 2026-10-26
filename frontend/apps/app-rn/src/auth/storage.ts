import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'cocktail.auth.v1';

export type PersistedAuth = {
  accessToken: string;
  refreshToken: string;
  username: string;
  nickname: string;
};

export async function loadPersistedAuth(): Promise<PersistedAuth | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PersistedAuth;
    if (!parsed.accessToken || !parsed.refreshToken) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function savePersistedAuth(auth: PersistedAuth): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(auth));
}

export async function clearPersistedAuth(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
