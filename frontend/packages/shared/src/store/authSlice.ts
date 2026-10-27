import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  username: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  hydrated: boolean;
};

const initialState: AuthState = {
  accessToken: null,
  refreshToken: null,
  username: null,
  nickname: null,
  avatarUrl: null,
  hydrated: false,
};

type AuthIdentity = {
  accessToken: string | null;
  refreshToken: string | null;
  username: string | null;
  nickname: string | null;
  avatarUrl?: string | null;
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    authHydrated(state, action: PayloadAction<AuthIdentity>) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.username = action.payload.username;
      state.nickname = action.payload.nickname;
      state.avatarUrl = action.payload.avatarUrl ?? null;
      state.hydrated = true;
    },
    signedIn(
      state,
      action: PayloadAction<{
        accessToken: string;
        refreshToken: string;
        username: string;
        nickname: string;
        avatarUrl?: string | null;
      }>,
    ) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.username = action.payload.username;
      state.nickname = action.payload.nickname;
      state.avatarUrl = action.payload.avatarUrl ?? null;
      state.hydrated = true;
    },
    tokensRefreshed(
      state,
      action: PayloadAction<{
        accessToken: string;
        refreshToken: string;
      }>,
    ) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
    },
    signedOut(state) {
      state.accessToken = null;
      state.refreshToken = null;
      state.username = null;
      state.nickname = null;
      state.avatarUrl = null;
      state.hydrated = true;
    },
  },
});

export const { authHydrated, signedIn, tokensRefreshed, signedOut } = authSlice.actions;
export const authReducer = authSlice.reducer;
