import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  username: string | null;
  nickname: string | null;
  hydrated: boolean;
};

const initialState: AuthState = {
  accessToken: null,
  refreshToken: null,
  username: null,
  nickname: null,
  hydrated: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    authHydrated(
      state,
      action: PayloadAction<{
        accessToken: string | null;
        refreshToken: string | null;
        username: string | null;
        nickname: string | null;
      }>,
    ) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.username = action.payload.username;
      state.nickname = action.payload.nickname;
      state.hydrated = true;
    },
    signedIn(
      state,
      action: PayloadAction<{
        accessToken: string;
        refreshToken: string;
        username: string;
        nickname: string;
      }>,
    ) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.username = action.payload.username;
      state.nickname = action.payload.nickname;
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
      state.hydrated = true;
    },
  },
});

export const { authHydrated, signedIn, tokensRefreshed, signedOut } = authSlice.actions;
export const authReducer = authSlice.reducer;
